/**
 * Cobros con terminales Mercado Pago Point.
 * Prefix: /api/point
 *
 * Flujo de una venta con Point:
 *   1. El POS arma el pedido y genera un `ventaId` (UUID, igual que offline).
 *   2. POST /cobros con ese id como referencia → creamos la orden en MP.
 *   3. La terminal levanta la orden y el cliente paga.
 *   4. El webhook de MP nos avisa; emitimos por socket y el POS se entera.
 *   5. El POS registra la venta con POST /api/ventas/sync usando el mismo id.
 *
 * Por qué la venta la sigue creando el POS y no el webhook: reutiliza la cola
 * offline que ya existe y el upsert por id la hace idempotente. Como
 * contrapartida, si el POS se cae entre el cobro y el registro, queda plata
 * cobrada sin venta — para eso está GET /cobros/huerfanos.
 */

import type { FastifyPluginAsync } from "fastify";
import { firmaValida, secretoWebhook } from "../lib/mpFirma.js";
import { z } from "zod";
import { prisma, type Prisma } from "@niagara/db";
import { io } from "../index.js";
import {
  activarModoPDV,
  cancelarOrden,
  consultarOrden,
  crearOrden,
  listarTerminales,
  ordenCerradaSinPago,
  ordenPagada,
  idPagoDeOrden,
  pointConfigurado,
  posIdComoTexto,
  nombrePorDefecto,
  metodoPagoDeOrden,
  MPPointError,
  type OrdenMP,
} from "../lib/mpPoint.js";

const ROLES_COBRO = ["admin", "encargado", "cajero", "barman"];
const ROLES_ADMIN = ["admin", "encargado"];

const crearCobroSchema = z.object({
  /** UUID de la venta que se va a registrar si el cobro sale bien */
  ventaId: z.string().uuid(),
  terminalId: z.string().min(3),
  monto: z.number().positive(),
  descripcion: z.string().max(200).optional(),
  numeroTicket: z.string().max(32).optional(),
});


export const registrarRutasPoint: FastifyPluginAsync = async (app) => {
  // ══════════════════════════════════════════════════════════════
  // ESTADO
  // ══════════════════════════════════════════════════════════════

  app.get("/estado", async (req) => {
    const { localId } = req;

    const terminales = await prisma.terminal.count({ where: { localId, activa: true } });
    const enPDV = await prisma.terminal.count({
      where: { localId, activa: true, operatingMode: "PDV" },
    });

    return {
      configurado: pointConfigurado(),
      webhookFirmado: secretoWebhook() !== undefined,
      terminales,
      terminalesEnPDV: enPDV,
    };
  });

  // ══════════════════════════════════════════════════════════════
  // TERMINALES
  // ══════════════════════════════════════════════════════════════

  app.get("/terminales", async (req) => {
    const { localId } = req;

    const terminales = await prisma.terminal.findMany({
      where: { localId },
      include: { barra: { select: { id: true, nombre: true } } },
      orderBy: { nombre: "asc" },
    });

    return { terminales };
  });

  /**
   * Trae las terminales desde MP y las guarda. Es la forma de darlas de alta:
   * el `terminal_id` lo asigna MP, no se inventa acá.
   */
  app.post("/terminales/sincronizar", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!ROLES_ADMIN.includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    try {
      const deMP = await listarTerminales();

      const guardadas = await Promise.all(
        deMP.map((t) =>
          prisma.terminal.upsert({
            where: { id: t.id },
            // Solo se refrescan los datos que manda MP; el nombre y la barra
            // los asigna el operador y no se pisan.
            update: {
              posId: posIdComoTexto(t.pos_id),
              storeId: t.store_id,
              operatingMode: t.operating_mode,
            },
            create: {
              id: t.id,
              localId,
              nombre: nombrePorDefecto(t),
              posId: posIdComoTexto(t.pos_id),
              storeId: t.store_id,
              operatingMode: t.operating_mode,
            },
          })
        )
      );

      return { terminales: guardadas, encontradas: deMP.length };
    } catch (err) {
      if (err instanceof MPPointError) {
        return reply.status(err.status === 503 ? 503 : 502).send({ error: err.message });
      }

      // Cualquier otra cosa (Prisma, red, un parseo raro) se registra con el
      // detalle en el log del servidor y sale con un mensaje que al menos dice
      // en qué paso se rompió. Antes se re-lanzaba y el panel mostraba
      // "Internal Server Error" pelado, que no ayuda a nadie.
      req.log.error({ err }, "Falló la sincronización de terminales Point");

      return reply.status(500).send({
        error:
          "No se pudieron guardar las terminales. " +
          (err instanceof Error ? err.message : "Error desconocido"),
      });
    }
  });

  /** Asignar alias y barra, y opcionalmente pasar la terminal a modo PDV */
  app.patch("/terminales/:id", async (req, reply) => {
    const { localId, staffActual } = req;
    const { id } = req.params as { id: string };

    if (!ROLES_ADMIN.includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const schema = z.object({
      nombre: z.string().min(1).max(60).optional(),
      barraId: z.string().uuid().nullable().optional(),
      activa: z.boolean().optional(),
      activarPDV: z.boolean().optional(),
    });

    const body = schema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const existente = await prisma.terminal.findFirst({ where: { id, localId } });
    if (!existente) {
      return reply.status(404).send({ error: "Terminal no encontrada" });
    }

    let operatingMode = existente.operatingMode;

    if (body.data.activarPDV) {
      try {
        const [actualizada] = await activarModoPDV([id]);
        operatingMode = actualizada?.operating_mode ?? operatingMode;
      } catch (err) {
        if (err instanceof MPPointError) {
          return reply.status(502).send({ error: err.message });
        }
        throw err;
      }
    }

    const terminal = await prisma.terminal.update({
      where: { id },
      data: {
        ...(body.data.nombre !== undefined && { nombre: body.data.nombre }),
        ...(body.data.barraId !== undefined && { barraId: body.data.barraId }),
        ...(body.data.activa !== undefined && { activa: body.data.activa }),
        operatingMode,
      },
      // La barra va incluida para que el panel pueda mostrar el nombre nuevo
      // sin recargar: el front mezcla esta respuesta con lo que ya tenía, y sin
      // el include quedaba pegado el nombre de la barra anterior.
      include: { barra: { select: { id: true, nombre: true } } },
    });

    return {
      terminal,
      // El cambio de modo recién aplica cuando se reinicia el equipo.
      avisoReinicio: body.data.activarPDV
        ? "Reiniciá la terminal para que tome el modo PDV"
        : undefined,
    };
  });

  // ══════════════════════════════════════════════════════════════
  // COBROS
  // ══════════════════════════════════════════════════════════════

  app.post("/cobros", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!ROLES_COBRO.includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos para cobrar" });
    }

    const body = crearCobroSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const { ventaId, terminalId, monto, descripcion, numeroTicket } = body.data;

    const terminal = await prisma.terminal.findFirst({
      where: { id: terminalId, localId, activa: true },
    });
    if (!terminal) {
      return reply.status(404).send({ error: "Terminal no encontrada o inactiva" });
    }
    if (terminal.operatingMode !== "PDV") {
      return reply.status(409).send({
        error: "La terminal no está en modo PDV, no puede recibir órdenes por API",
      });
    }

    // Si ya hay una orden viva para esta venta, se devuelve en vez de duplicar
    // el cobro. Protege contra doble clic y contra reintentos de red.
    const previa = await prisma.ordenPoint.findUnique({ where: { referencia: ventaId } });
    if (previa && !["canceled", "expired"].includes(previa.estado)) {
      return reply.status(200).send({ orden: previa, yaExistia: true });
    }

    try {
      const ordenMP = await crearOrden({
        terminalId,
        monto,
        referencia: ventaId,
        ...(descripcion !== undefined && { descripcion }),
        ...(numeroTicket !== undefined && { numeroTicket }),
      });

      const orden = await prisma.ordenPoint.upsert({
        where: { referencia: ventaId },
        update: {
          id: ordenMP.id,
          terminalId,
          monto,
          estado: ordenMP.status,
          estadoDetalle: ordenMP.status_detail ?? null,
          mpPaymentId: idPagoDeOrden(ordenMP),
        },
        create: {
          id: ordenMP.id,
          localId,
          terminalId,
          referencia: ventaId,
          monto,
          estado: ordenMP.status,
          estadoDetalle: ordenMP.status_detail ?? null,
          mpPaymentId: idPagoDeOrden(ordenMP),
        },
      });

      return reply.status(201).send({ orden, yaExistia: false });
    } catch (err) {
      if (err instanceof MPPointError) {
        return reply
          .status(err.status === 503 ? 503 : 502)
          .send({ error: err.message, detalle: err.cuerpo });
      }
      throw err;
    }
  });

  /**
   * Estado del cobro. El POS lo consulta mientras espera, como respaldo del
   * socket: si el webhook no llegó, acá se le pregunta a MP directamente.
   */
  app.get("/cobros/:referencia", async (req, reply) => {
    const { localId } = req;
    const { referencia } = req.params as { referencia: string };
    const { refrescar } = req.query as { refrescar?: string };

    const orden = await prisma.ordenPoint.findFirst({ where: { referencia, localId } });
    if (!orden) {
      return reply.status(404).send({ error: "Cobro no encontrado" });
    }

    /**
     * `metodoPago` sale de la última notificación guardada: es con qué pagó
     * realmente el cliente en la terminal, que puede no ser lo que eligió el
     * cajero. La caja lo usa para registrar la venta con el medio correcto.
     */
    const metodoDeNotificacion = (): "tarjeta" | "qr_mp" | null => {
      const cruda = orden.ultimaNotificacion;
      if (!cruda || typeof cruda !== "object") return null;
      return metodoPagoDeOrden(cruda as unknown as OrdenMP);
    };

    // Estado final: no hace falta volver a preguntar.
    const finalizado = ["processed", "canceled", "expired", "refunded"].includes(orden.estado);
    if (finalizado || refrescar !== "true") {
      return { orden, metodoPago: metodoDeNotificacion() };
    }

    try {
      const ordenMP = await consultarOrden(orden.id);
      const actualizada = await guardarEstadoOrden(orden.id, ordenMP);
      return { orden: actualizada, metodoPago: metodoPagoDeOrden(ordenMP) };
    } catch (err) {
      if (err instanceof MPPointError) {
        // Se devuelve lo último que sabemos en vez de fallar: la caja necesita
        // seguir operando aunque MP no responda.
        return { orden, metodoPago: metodoDeNotificacion(), avisoMP: err.message };
      }
      throw err;
    }
  });

  app.post("/cobros/:referencia/cancelar", async (req, reply) => {
    const { localId, staffActual } = req;
    const { referencia } = req.params as { referencia: string };

    if (!ROLES_COBRO.includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const orden = await prisma.ordenPoint.findFirst({ where: { referencia, localId } });
    if (!orden) {
      return reply.status(404).send({ error: "Cobro no encontrado" });
    }

    if (orden.estado === "at_terminal") {
      return reply.status(409).send({
        error: "La terminal ya tomó la orden — hay que cancelarla desde el equipo",
      });
    }

    try {
      const ordenMP = await cancelarOrden(orden.id);
      const actualizada = await guardarEstadoOrden(orden.id, ordenMP);
      return { orden: actualizada };
    } catch (err) {
      if (err instanceof MPPointError) {
        return reply.status(502).send({ error: err.message });
      }
      throw err;
    }
  });

  /**
   * Cobros aprobados que no tienen venta registrada.
   *
   * Es la red de seguridad del flujo: si el POS se cerró justo después de
   * cobrar, la plata entró pero la venta no quedó asentada. Esto lo muestra
   * para poder cargarla a mano o investigarla.
   */
  app.get("/cobros/huerfanos", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!ROLES_ADMIN.includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const pagadas = await prisma.ordenPoint.findMany({
      where: { localId, estado: "processed" },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { terminal: { select: { nombre: true } } },
    });

    const ventasExistentes = await prisma.venta.findMany({
      where: { id: { in: pagadas.map((o) => o.referencia) } },
      select: { id: true },
    });
    const conVenta = new Set(ventasExistentes.map((v) => v.id));

    const huerfanos = pagadas.filter((o) => !conVenta.has(o.referencia));

    return { huerfanos, total: huerfanos.length };
  });

  // ══════════════════════════════════════════════════════════════
  // WEBHOOK
  // ══════════════════════════════════════════════════════════════

  /**
   * Notificaciones de orders de MP.
   *
   * Nunca se confía en el payload: solo se toma el id y se le vuelve a
   * preguntar a MP cuál es el estado real. Siempre se responde 200, porque si
   * devolvemos error MP reintenta y no hay nada que reintentar de su lado.
   */
  app.post("/webhook", async (req, reply) => {
    const cuerpo = req.body as {
      type?: string;
      action?: string;
      data?: { id?: string };
      resource?: string;
    };

    // En el panel de MP se pueden suscribir muchos eventos de una sola URL, y
    // es fácil dejarlos todos tildados. Acá solo se procesan los de órdenes:
    // sin este filtro, el id de un contracargo o de una suscripción se
    // consultaba como si fuera una orden, MP devolvía 404 y el log se llenaba
    // de errores que no eran errores.
    const tipo = cuerpo.type ?? "";
    if (tipo && !tipo.startsWith("order") && tipo !== "point_integration_wh") {
      return reply.status(200).send({ ok: true, ignorado: tipo });
    }

    const dataId = cuerpo.data?.id ?? cuerpo.resource?.split("/").pop();
    if (!dataId) {
      app.log.warn({ cuerpo }, "Webhook Point sin id");
      return reply.status(200).send({ ok: true });
    }

    const secreto = secretoWebhook();
    if (secreto) {
      const ok = firmaValida(
        secreto,
        {
          signature: req.headers["x-signature"] as string | undefined,
          requestId: req.headers["x-request-id"] as string | undefined,
        },
        dataId
      );
      if (!ok) {
        app.log.warn({ dataId }, "Webhook Point con firma inválida — descartado");
        return reply.status(401).send({ error: "Firma inválida" });
      }
    } else {
      app.log.warn(
        "MP_WEBHOOK_SECRET sin configurar: el webhook de Point acepta cualquier origen"
      );
    }

    try {
      const ordenMP = await consultarOrden(dataId);
      const orden = await guardarEstadoOrden(dataId, ordenMP, cuerpo);

      if (orden) {
        // El POS espera esto para cerrar la pantalla de cobro.
        io.to(`local:${orden.localId}`).emit("cobro:actualizado", {
          referencia: orden.referencia,
          estado: orden.estado,
          estadoDetalle: orden.estadoDetalle,
          monto: Number(orden.monto),
          pagado: ordenPagada(ordenMP),
          cerradoSinPago: ordenCerradaSinPago(ordenMP),
        });
      }
    } catch (err) {
      app.log.error({ err, dataId }, "Error procesando webhook de Point");
    }

    return reply.status(200).send({ ok: true });
  });
};

/**
 * Guarda el estado que reporta MP. Devuelve null si la orden no es nuestra
 * (puede llegar una notificación de algo creado por fuera del sistema).
 */
async function guardarEstadoOrden(
  ordenId: string,
  ordenMP: OrdenMP,
  notificacion?: unknown
) {
  const existente = await prisma.ordenPoint.findUnique({ where: { id: ordenId } });
  if (!existente) return null;

  // El campo es Json en Prisma y espera un InputJsonValue. Pasar por
  // stringify/parse garantiza que sea serializable y descarta undefined,
  // que Prisma rechaza dentro de un Json.
  const notificacionJson =
    notificacion === undefined
      ? undefined
      : (JSON.parse(JSON.stringify(notificacion)) as Prisma.InputJsonValue);

  return prisma.ordenPoint.update({
    where: { id: ordenId },
    data: {
      estado: ordenMP.status,
      estadoDetalle: ordenMP.status_detail ?? null,
      mpPaymentId: idPagoDeOrden(ordenMP) ?? existente.mpPaymentId,
      ...(notificacionJson !== undefined && { ultimaNotificacion: notificacionJson }),
    },
  });
}

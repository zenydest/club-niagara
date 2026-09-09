/**
 * Rutas de boletería — tipos de entrada y venta de tickets.
 * Prefix: /api/entradas
 *
 * Endpoints:
 *   GET    /tipos?eventoId=        — tipos de entrada de un evento
 *   POST   /tipos                  — crear tipo de entrada
 *   PATCH  /tipos/:id              — editar tipo (precio, cupo, nombre)
 *   DELETE /tipos/:id              — desactivar tipo
 *
 *   POST   /vender                 — vender entrada (genera QR único)
 *   GET    /vendidas?eventoId=     — listar entradas vendidas con filtros
 *   GET    /qr/:qrCode             — buscar entrada por QR (para portería)
 *   PATCH  /vendidas/:id/usar      — marcar entrada como usada (check-in)
 */

import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@niagara/db";
import { io } from "../index.js";
import { codigoValido } from "../lib/qrRotativo.js";
import { cancelarEntrada, mensajeRechazo } from "../lib/cancelarEntrada.js";

// ── Schemas ──────────────────────────────────────────────────────

const tipoEntradaSchema = z.object({
  eventoId: z.string().uuid(),
  nombre: z.string().min(1).max(100),
  tipo: z.enum(["general", "vip", "rrpp", "invitado", "staff"]),
  precio: z.number().nonnegative(),
  cantidadTotal: z.number().int().positive().nullable().optional(),
});

const venderEntradaSchema = z.object({
  eventoId: z.string().uuid(),
  entradaTipoId: z.string().uuid(),
  clienteNombre: z.string().min(1).max(200),
  clienteEmail: z.string().email().nullable().optional(),
  clienteTelefono: z.string().max(30).nullable().optional(),
  metodoPago: z.enum(["efectivo", "tarjeta", "cashless", "qr_mp", "cortesia"]),
  precioPagado: z.number().nonnegative(),
  rrppId: z.string().uuid().nullable().optional(),
  cantidad: z.number().int().positive().default(1),
});

// ── Rutas ─────────────────────────────────────────────────────────

export const registrarRutasEntradas: FastifyPluginAsync = async (app) => {

  // ── Tipos de entrada ───────────────────────────────────────

  // GET /api/entradas/tipos?eventoId=
  app.get("/tipos", async (req, reply) => {
    const { localId } = req;
    const { eventoId } = req.query as { eventoId?: string };

    if (!eventoId) {
      return reply.status(400).send({ error: "Se requiere eventoId" });
    }

    const tipos = await prisma.entradaTipo.findMany({
      where: { localId, eventoId, activo: true },
      orderBy: [{ tipo: "asc" }, { precio: "asc" }],
    });

    return {
      tipos: tipos.map((t) => ({ ...t, precio: Number(t.precio) })),
    };
  });

  // POST /api/entradas/tipos — crear tipo de entrada
  app.post("/tipos", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!["admin", "encargado"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const body = tipoEntradaSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    // Verificar que el evento pertenece al local
    const evento = await prisma.evento.findUnique({
      where: { id: body.data.eventoId, localId },
    });
    if (!evento) {
      return reply.status(404).send({ error: "Evento no encontrado" });
    }

    const tipo = await prisma.entradaTipo.create({
      data: {
        localId,
        eventoId: body.data.eventoId,
        nombre: body.data.nombre,
        tipo: body.data.tipo,
        precio: body.data.precio,
        cantidadTotal: body.data.cantidadTotal ?? null,
      },
    });

    return reply.status(201).send({ tipo: { ...tipo, precio: Number(tipo.precio) } });
  });

  // PATCH /api/entradas/tipos/:id — editar tipo
  app.patch("/tipos/:id", async (req, reply) => {
    const { localId, staffActual } = req;
    const { id } = req.params as { id: string };

    if (!["admin", "encargado"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const body = tipoEntradaSchema.partial().safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const tipo = await prisma.entradaTipo.update({
      where: { id, localId },
      data: {
        ...(body.data.nombre && { nombre: body.data.nombre }),
        ...(body.data.tipo && { tipo: body.data.tipo }),
        ...(body.data.precio !== undefined && { precio: body.data.precio }),
        ...(body.data.cantidadTotal !== undefined && { cantidadTotal: body.data.cantidadTotal }),
      },
    });

    return { tipo: { ...tipo, precio: Number(tipo.precio) } };
  });

  // DELETE /api/entradas/tipos/:id — desactivar tipo
  app.delete("/tipos/:id", async (req, reply) => {
    const { localId, staffActual } = req;
    const { id } = req.params as { id: string };

    if (!["admin", "encargado"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    await prisma.entradaTipo.update({
      where: { id, localId },
      data: { activo: false },
    });

    return reply.status(204).send();
  });

  // ── Venta de entradas ──────────────────────────────────────

  // POST /api/entradas/vender
  app.post("/vender", async (req, reply) => {
    const { localId, staffActual } = req;

    const rolesVenta = ["admin", "encargado", "cajero", "rrpp"];
    if (!rolesVenta.includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos para vender entradas" });
    }

    const body = venderEntradaSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const {
      eventoId,
      entradaTipoId,
      clienteNombre,
      clienteEmail,
      clienteTelefono,
      metodoPago,
      precioPagado,
      rrppId,
      cantidad,
    } = body.data;

    // Verificar tipo de entrada y cupo
    const tipo = await prisma.entradaTipo.findUnique({
      where: { id: entradaTipoId, localId, eventoId },
    });

    if (!tipo?.activo) {
      return reply.status(404).send({ error: "Tipo de entrada no encontrado" });
    }

    /**
     * El cupo se mide con `cantidadVendida`, no contando filas de
     * `entradasVendidas`.
     *
     * Cancelar una entrada no borra la fila —le pone `canceladaAt`— pero sí
     * devuelve el lugar (ver `lib/cancelarEntrada.ts`). Contando filas, cada
     * cancelación dejaba un cupo muerto: la tanda figuraba agotada teniendo
     * lugares libres.
     *
     * Esto es solo el corte temprano, para poder decir cuántas quedan. El
     * control de cupo es el UPDATE condicional de más abajo.
     */
    if (tipo.cantidadTotal !== null) {
      const disponibles = tipo.cantidadTotal - tipo.cantidadVendida;
      if (disponibles < cantidad) {
        return reply.status(422).send({
          error: "Sin cupo disponible",
          disponibles: Math.max(0, disponibles),
          requeridas: cantidad,
        });
      }
    }

    // Vincular la entrada con la cuenta de la app, si el email corresponde a un
    // cliente registrado.
    //
    // Sin esto, la app del cliente nunca muestra las entradas vendidas desde el
    // panel: GET /api/cliente/entradas filtra por `clienteId`, y acá solo se
    // guardaba `clienteEmail`, que es texto suelto. El email vive en la tabla
    // User (Better Auth), por eso se busca a través de la relación.
    const clienteVinculado = clienteEmail
      ? await prisma.cliente.findFirst({
          where: { localId, user: { email: clienteEmail } },
          select: { id: true },
        })
      : null;

    /**
     * Reservar el cupo y crear las entradas van juntos, en una transacción.
     *
     * La condición viaja adentro del UPDATE: leer el saldo y después
     * incrementarlo son dos pasos, y dos ventas simultáneas alcanzan a leer el
     * mismo número y pasar las dos. Si el UPDATE no toca ninguna fila es que no
     * había lugar, y entonces no se crea ninguna entrada.
     */
    const entradas = await prisma.$transaction(async (tx) => {
      const filas = await tx.$executeRaw`
        UPDATE entradas_tipo
           SET cantidad_vendida = cantidad_vendida + ${cantidad}
         WHERE id = ${entradaTipoId}::uuid
           AND (cantidad_total IS NULL
                OR cantidad_vendida + ${cantidad} <= cantidad_total)
      `;

      if (filas === 0) return null;

      return Promise.all(
        Array.from({ length: cantidad }).map(() =>
          tx.entradaVendida.create({
            data: {
              localId,
              eventoId,
              entradaTipoId,
              clienteId: clienteVinculado?.id ?? null,
              /**
               * Sin código rotativo, a propósito.
               *
               * Estas entradas se venden en el panel y se entregan por link de
               * WhatsApp: quien las muestra abre una página web, que no puede
               * calcular el código rotativo sin tener el secreto — y ponerlo en
               * la página lo dejaría a la vista de cualquiera con el enlace.
               *
               * Las compradas desde la app sí lo llevan (ver `routes/cliente.ts`):
               * ahí la app lo calcula y una captura de pantalla se vence sola.
               *
               * La protección de estas es que son de un solo uso: si el link se
               * reenvía, entra el primero que llega. El portero además ve el
               * aviso de que ese QR no tiene código rotativo.
               */
              qrSecret: null,
              clienteNombre,
              clienteEmail: clienteEmail ?? null,
              clienteTelefono: clienteTelefono ?? null,
              precioPagado,
              metodoPago: metodoPago,
              rrppId: rrppId ?? null,
            },
          })
        )
      );
    });

    if (entradas === null) {
      // Se relee el cupo para responder con el número de ahora: entre el
      // intento y esta respuesta puede haber cambiado otra vez.
      const actual = await prisma.entradaTipo.findUnique({
        where: { id: entradaTipoId },
        select: { cantidadTotal: true, cantidadVendida: true },
      });

      const cupo = actual?.cantidadTotal ?? null;
      const vendidas = actual?.cantidadVendida ?? 0;

      return reply.status(422).send({
        error: "Sin cupo disponible",
        disponibles: cupo === null ? 0 : Math.max(0, cupo - vendidas),
        requeridas: cantidad,
      });
    }

    // Emitir evento en tiempo real
    io.to(`local:${localId}`).emit("entrada:vendida", {
      eventoId,
      cantidad,
      total: precioPagado * cantidad,
      metodoPago,
    });

    return reply.status(201).send({
      entradas: entradas.map((e) => ({ ...e, precioPagado: Number(e.precioPagado) })),
      cantidad,
      total: precioPagado * cantidad,
      // Le permite al panel avisar si la entrada le va a aparecer al cliente en
      // la app o si quedó solo como registro interno.
      vinculadaACuenta: Boolean(clienteVinculado),
    });
  });

  /**
   * GET /api/entradas/vendidas?eventoId=&entradaTipoId=&usada=&busqueda=
   *
   * Devuelve nombre, email y teléfono de cada comprador. Es la base de datos
   * de clientes del boliche: va restringida a quienes venden y controlan.
   */
  app.get("/vendidas", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!["admin", "encargado", "cajero", "portero"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }
    const { eventoId, entradaTipoId, usada, busqueda, limite } = req.query as {
      eventoId?: string;
      entradaTipoId?: string;
      usada?: string;
      busqueda?: string;
      limite?: string;
    };

    const vendidas = await prisma.entradaVendida.findMany({
      where: {
        localId,
        ...(eventoId && { eventoId }),
        ...(entradaTipoId && { entradaTipoId }),
        ...(usada !== undefined && { usada: usada === "true" }),
        ...(busqueda && {
          OR: [
            { clienteNombre: { contains: busqueda, mode: "insensitive" } },
            { clienteEmail: { contains: busqueda, mode: "insensitive" } },
            { clienteTelefono: { contains: busqueda, mode: "insensitive" } },
            { qrCode: { contains: busqueda, mode: "insensitive" } },
          ],
        }),
      },
      include: {
        entradaTipo: { select: { nombre: true, tipo: true } },
        rrpp: { select: { nombre: true, apellido: true } },
      },
      orderBy: { createdAt: "desc" },
      take: Number(limite ?? 100),
    });

    return {
      vendidas: vendidas.map((e) => ({ ...e, precioPagado: Number(e.precioPagado) })),
      total: vendidas.length,
    };
  });

  // GET /api/entradas/qr/:qrCode — buscar entrada por código QR (portería)
  app.get("/qr/:qrCode", async (req, reply) => {
    const { localId, staffActual } = req;
    const { qrCode } = req.params as { qrCode: string };

    if (!["portero", "admin", "encargado", "cajero"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const entrada = await prisma.entradaVendida.findUnique({
      where: { qrCode },
      include: {
        entradaTipo: true,
        evento: { select: { nombre: true, estado: true } },
      },
    });

    if (entrada?.localId !== localId) {
      return reply.status(404).send({ error: "Entrada no encontrada" });
    }

    return {
      entrada: { ...entrada, precioPagado: Number(entrada.precioPagado) },
    };
  });

  /**
   * POST /api/entradas/validar — escanear un QR en la puerta.
   *
   * Quema la entrada de forma **atómica**: el `updateMany` con
   * `usada: false` en el WHERE hace que la base decida el ganador. Antes esto
   * eran dos operaciones (leer y después marcar), así que dos porteros
   * escaneando el mismo QR al mismo tiempo dejaban entrar a los dos.
   *
   * Además registra el ingreso y actualiza el aforo, para que escanear sea una
   * sola acción y no dos pantallas distintas.
   */
  app.post("/validar", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!["portero", "admin", "encargado"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const schema = z.object({
      qrCode: z.string().min(1).max(200),
      /** Código rotativo que muestra la app. Ausente en entradas viejas. */
      codigo: z.string().min(4).max(32).optional(),
      /** Si se manda, se valida que la entrada sea de ese evento */
      eventoId: z.string().uuid().optional(),
      /** Registrar el ingreso además de quemar el QR */
      registrarAcceso: z.boolean().default(true),
      /**
       * El portero cobró la entrada en la puerta y confirma el ingreso.
       * Sin esto, una reserva sin pagar se rechaza.
       */
      cobrarEnPuerta: z.boolean().default(false),
      /** Con qué se pagó en la puerta */
      metodoPagoPuerta: z
        .enum(["efectivo", "tarjeta", "cashless", "qr_mp", "cortesia"])
        .optional(),
    });

    const body = schema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const { qrCode, codigo, eventoId, registrarAcceso, cobrarEnPuerta, metodoPagoPuerta } =
      body.data;

    const entrada = await prisma.entradaVendida.findUnique({
      where: { qrCode },
      include: {
        entradaTipo: { select: { nombre: true, tipo: true } },
        evento: { select: { id: true, nombre: true, estado: true } },
      },
    });

    // Los desenlaces de negocio van con 200 y un `resultado`: que una entrada
    // esté quemada no es un error de la request, es la respuesta. Reservamos
    // los 4xx para permisos y payloads inválidos.
    if (entrada?.localId !== localId) {
      return { resultado: "no_encontrada", entrada: null };
    }

    if (eventoId && entrada.eventoId !== eventoId) {
      return {
        resultado: "otro_evento",
        entrada: { ...entrada, precioPagado: Number(entrada.precioPagado) },
      };
    }

    /**
     * Cancelada: no entra, y no hay forma de forzarlo desde la puerta.
     *
     * Se chequea antes que el pago: una entrada cancelada que además estaba
     * paga tiene una devolución en curso, y dejarla entrar sería regalar el
     * ingreso y la plata.
     */
    if (entrada.canceladaAt) {
      return {
        resultado: "cancelada",
        entrada: { ...entrada, precioPagado: Number(entrada.precioPagado) },
      };
    }

    // Entrada emitida antes del código rotativo: se valida solo por `qrCode`,
    // así que una captura vieja sirve igual. No se rechaza —dejar gente afuera
    // por una migración sería peor— pero se avisa en la puerta para que el
    // portero sepa que ese QR no tiene protección contra capturas.
    const sinCodigoRotativo = !entrada.qrSecret;

    // El código rotativo se verifica ANTES de quemar. Al revés, un código
    // vencido quemaría una entrada legítima y dejaría al dueño afuera.
    if (entrada.qrSecret) {
      if (!codigo) {
        return {
          resultado: "codigo_faltante",
          entrada: { ...entrada, precioPagado: Number(entrada.precioPagado) },
        };
      }

      if (!codigoValido(entrada.qrSecret, codigo)) {
        return {
          resultado: "codigo_vencido",
          entrada: { ...entrada, precioPagado: Number(entrada.precioPagado) },
        };
      }
    }

    // Reserva sin pagar: no se deja entrar salvo que el portero cobre ahora.
    // Se corta antes de quemar, para que el QR siga sirviendo cuando vuelva
    // con la plata.
    if (!entrada.pagada && !cobrarEnPuerta) {
      return {
        resultado: "impaga",
        entrada: { ...entrada, precioPagado: Number(entrada.precioPagado) },
        aCobrar: Number(entrada.precioPagado),
      };
    }

    if (!entrada.pagada && cobrarEnPuerta) {
      await prisma.entradaVendida.update({
        where: { id: entrada.id },
        data: {
          pagada: true,
          ...(metodoPagoPuerta && { metodoPago: metodoPagoPuerta }),
        },
      });
    }

    // Acá se define quién gana: solo una request puede pasar de false a true.
    const quemada = await prisma.entradaVendida.updateMany({
      where: { id: entrada.id, localId, usada: false },
      data: { usada: true },
    });

    if (quemada.count === 0) {
      return {
        resultado: "ya_usada",
        entrada: { ...entrada, precioPagado: Number(entrada.precioPagado), usada: true },
      };
    }

    if (registrarAcceso) {
      await prisma.acceso.create({
        data: {
          // `Acceso.id` no tiene default: normalmente lo genera el cliente para
          // que la cola offline sea idempotente. Acá el origen es el servidor,
          // así que lo generamos nosotros.
          id: randomUUID(),
          localId,
          eventoId: entrada.eventoId,
          staffId: staffActual.id,
          entradaVendidaId: entrada.id,
          tipo: "ingreso",
          metodo: "qr",
          createdAt: new Date(),
          synced: "synced",
        },
      });

      const [ingresos, egresos] = await Promise.all([
        prisma.acceso.count({
          where: { localId, eventoId: entrada.eventoId, tipo: "ingreso" },
        }),
        prisma.acceso.count({
          where: { localId, eventoId: entrada.eventoId, tipo: "egreso" },
        }),
      ]);

      const aforoActual = Math.max(0, ingresos - egresos);

      io.to(`local:${localId}`).emit("aforo:actualizado", {
        eventoId: entrada.eventoId,
        aforoActual,
      });

      // Alimenta el feed de accesos del dashboard, que hasta ahora nunca
      // recibía nada porque la API no emitía este evento.
      io.to(`local:${localId}`).emit("acceso:nuevo", {
        eventoId: entrada.eventoId,
        tipo: "ingreso",
        metodo: "qr",
        clienteNombre: entrada.clienteNombre,
        entradaTipo: entrada.entradaTipo.nombre,
        createdAt: new Date().toISOString(),
      });
    }

    return {
      resultado: "ok",
      sinCodigoRotativo,
      entrada: { ...entrada, precioPagado: Number(entrada.precioPagado), usada: true },
    };
  });

  /**
   * GET /api/entradas/publica/:qrCode — página del QR para el comprador.
   *
   * **Sin autenticación**: es el link que se manda por WhatsApp al vender una
   * entrada. Quien lo abre ve el QR sin instalar nada ni registrarse.
   *
   * Devuelve el `qrSecret` porque la página necesita calcular el código
   * rotativo igual que hace la app. Eso significa que quien tiene el link
   * tiene la entrada — es el modelo que pidió el cliente. La protección real
   * es que sea de un solo uso: si el link se reenvía, entra el primero que
   * llega.
   *
   * Solo se expone lo mínimo: nada del comprador, del precio ni del evento más
   * allá de lo que hace falta para mostrar la pantalla.
   */
  app.get("/publica/:qrCode", async (req, reply) => {
    const { qrCode } = req.params as { qrCode: string };

    const entrada = await prisma.entradaVendida.findUnique({
      where: { qrCode },
      include: {
        evento: {
          select: { nombre: true, fechaInicio: true, imagenUrl: true, estado: true },
        },
        entradaTipo: { select: { nombre: true } },
      },
    });

    if (!entrada) {
      return reply.status(404).send({ error: "Esta entrada no existe" });
    }

    return {
      qrCode: entrada.qrCode,
      qrSecret: entrada.qrSecret,
      localId: entrada.localId,
      usada: entrada.usada,
      pagada: entrada.pagada,
      cancelada: entrada.canceladaAt !== null,
      nombre: entrada.clienteNombre,
      tipo: entrada.entradaTipo.nombre,
      evento: entrada.evento,
      // La app corrige el desfasaje del reloj del celular con este valor; la
      // página web hace lo mismo.
      serverTime: Date.now(),
    };
  });

  /**
   * POST /api/entradas/vendidas/:id/cancelar — cancelar desde el panel.
   *
   * El staff puede cancelar aunque el evento ya haya empezado: sirve para
   * arreglar un caso puntual. El cliente desde la app no puede, para que
   * nadie cancele a las 3 de la mañana después de arrepentirse en la fila.
   */
  app.post("/vendidas/:id/cancelar", async (req, reply) => {
    const { localId, staffActual } = req;
    const { id } = req.params as { id: string };

    if (!["admin", "encargado"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const res = await cancelarEntrada({
      entradaId: id,
      localId,
      canceladaPor: staffActual.id,
      ignorarVencimiento: true,
    });

    if (!res.ok && res.motivo) {
      return reply.status(409).send({ error: mensajeRechazo(res.motivo) });
    }

    return {
      ok: true,
      reembolsoPendiente: res.reembolsoPendiente ?? false,
      monto: res.monto ?? 0,
    };
  });

  /**
   * GET /api/entradas/reembolsos — entradas canceladas con plata por devolver.
   *
   * El reembolso se hace a mano desde Mercado Pago. Esta lista es para no
   * olvidarse: sin ella, la plata queda del boliche y el cliente reclama.
   */
  app.get("/reembolsos", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!["admin", "encargado"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const pendientes = await prisma.entradaVendida.findMany({
      where: { localId, reembolsoPendiente: true },
      orderBy: { canceladaAt: "desc" },
      include: {
        evento: { select: { nombre: true } },
        entradaTipo: { select: { nombre: true } },
      },
    });

    return {
      reembolsos: pendientes.map((e) => ({
        id: e.id,
        cliente: e.clienteNombre,
        email: e.clienteEmail,
        evento: e.evento.nombre,
        tipo: e.entradaTipo.nombre,
        monto: Number(e.precioPagado),
        canceladaAt: e.canceladaAt,
        mpPaymentId: e.mpPaymentId,
      })),
      total: pendientes.length,
      montoTotal: pendientes.reduce((acc, e) => acc + Number(e.precioPagado), 0),
    };
  });

  /** PATCH /api/entradas/vendidas/:id/reembolsado — marcar la plata devuelta. */
  app.patch("/vendidas/:id/reembolsado", async (req, reply) => {
    const { localId, staffActual } = req;
    const { id } = req.params as { id: string };

    if (!["admin", "encargado"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const actualizada = await prisma.entradaVendida.updateMany({
      where: { id, localId, reembolsoPendiente: true },
      data: { reembolsoPendiente: false },
    });

    if (actualizada.count === 0) {
      return reply.status(404).send({
        error: "No hay un reembolso pendiente para esa entrada",
      });
    }

    return { ok: true };
  });

  /**
   * PATCH /api/entradas/vendidas/:id/usar — check-in manual
   *
   * Quemar una entrada la deja inservible: quien la compró no entra. Va
   * restringido a los mismos roles que validan en la puerta.
   *
   * Antes no pedía rol: cualquiera con una cuenta del local podía invalidar
   * entradas ajenas conociendo el id, y no hay forma de deshacerlo desde el
   * panel.
   */
  app.patch("/vendidas/:id/usar", async (req, reply) => {
    const { localId, staffActual } = req;
    const { id } = req.params as { id: string };

    if (!["portero", "admin", "encargado"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    // Mismo quemado atómico que en /validar: un solo UPDATE condicionado.
    const quemada = await prisma.entradaVendida.updateMany({
      where: { id, localId, usada: false },
      data: { usada: true },
    });

    if (quemada.count === 0) {
      const existe = await prisma.entradaVendida.findFirst({ where: { id, localId } });
      return existe
        ? reply.status(409).send({ error: "Entrada ya fue utilizada" })
        : reply.status(404).send({ error: "Entrada no encontrada" });
    }

    const actualizada = await prisma.entradaVendida.findFirstOrThrow({
      where: { id, localId },
    });

    return { entrada: { ...actualizada, precioPagado: Number(actualizada.precioPagado) } };
  });
};

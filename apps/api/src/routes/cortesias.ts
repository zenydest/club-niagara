/**
 * Cortesías — accesos gratuitos sin registro.
 * Prefix: /api/cortesias
 *
 * El flujo del boliche: se genera una tanda de 200 códigos, se le pasa a un
 * RRPP, y él los reparte por WhatsApp. Quien recibe uno abre un link, ve el QR
 * y lo muestra en la puerta. No crea cuenta, no baja la app, no da datos.
 *
 * La diferencia con las entradas vendidas es esa: acá no hay comprador. Por eso
 * viven en su propia tabla en vez de forzar `EntradaVendida` a tener todo en
 * null.
 *
 * Endpoints:
 *   POST /lotes              — generar una tanda
 *   GET  /lotes?eventoId=    — listar tandas con su avance
 *   POST /lotes/:id/anular   — dar de baja las que quedan sin usar
 *   GET  /lotes/:id/codigos  — links para repartir
 *   GET  /publica/:codigo    — datos para la página del QR (sin auth)
 *   POST /validar            — usar el código en la puerta
 */

import type { FastifyPluginAsync } from "fastify";
import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@niagara/db";
import { io } from "../index.js";

const ROLES_GESTION = ["admin", "encargado"];
const ROLES_PUERTA = ["portero", "admin", "encargado"];

/**
 * Alfabeto sin caracteres que se confunden al leerlos en voz alta o al
 * tipearlos: sin O/0, sin I/1, sin L. Si el escáner falla, el portero tiene
 * que poder cargar el código dictado sin equivocarse.
 */
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LARGO_CODIGO = 8;

function generarCodigo(): string {
  let salida = "";
  for (let i = 0; i < LARGO_CODIGO; i += 1) {
    salida += ALFABETO[randomInt(ALFABETO.length)];
  }
  return salida;
}

export const registrarRutasCortesias: FastifyPluginAsync = async (app) => {

  /**
   * POST /api/cortesias/lotes — generar una tanda.
   *
   * Los códigos se crean todos juntos en una transacción: si algo falla a
   * mitad, no queda medio lote suelto que nadie sabe si se repartió.
   */
  app.post("/lotes", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!ROLES_GESTION.includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const body = z.object({
      eventoId: z.string().uuid(),
      nombre: z.string().min(1).max(80),
      cantidad: z.number().int().min(1).max(1000),
      /** ISO. Hora máxima de ingreso. */
      validaHasta: z.string().datetime(),
      rrppId: z.string().uuid().nullish(),
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const evento = await prisma.evento.findFirst({
      where: { id: body.data.eventoId, localId },
      select: { id: true, nombre: true },
    });
    if (!evento) return reply.status(404).send({ error: "Evento no encontrado" });

    const validaHasta = new Date(body.data.validaHasta);
    if (validaHasta <= new Date()) {
      return reply.status(422).send({
        error: "La hora límite ya pasó. Poné una hora futura.",
      });
    }

    /**
     * Se generan más códigos de los pedidos y se descartan los repetidos.
     *
     * Con 31 caracteres y 8 posiciones las colisiones son improbables, pero
     * `codigo` es único en la base: una sola repetición haría fallar el insert
     * de todo el lote. Generar de más sale gratis y lo evita.
     */
    const codigos = new Set<string>();
    while (codigos.size < body.data.cantidad) {
      codigos.add(generarCodigo());
    }

    const lote = await prisma.$transaction(async (tx) => {
      const nuevo = await tx.loteCortesias.create({
        data: {
          localId,
          eventoId: body.data.eventoId,
          nombre: body.data.nombre,
          validaHasta,
          rrppId: body.data.rrppId ?? null,
          creadoPor: staffActual.id,
        },
      });

      await tx.cortesia.createMany({
        data: [...codigos].map((codigo) => ({
          localId,
          loteId: nuevo.id,
          codigo,
        })),
      });

      return nuevo;
    });

    return reply.status(201).send({
      lote,
      cantidad: codigos.size,
      evento: evento.nombre,
    });
  });

  /** GET /api/cortesias/lotes?eventoId= — tandas con cuántas se usaron. */
  app.get("/lotes", async (req, reply) => {
    const { localId, staffActual } = req;
    const { eventoId } = req.query as { eventoId?: string };

    if (!ROLES_GESTION.includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const lotes = await prisma.loteCortesias.findMany({
      where: { localId, ...(eventoId && { eventoId }) },
      orderBy: { createdAt: "desc" },
      include: {
        evento: { select: { nombre: true, fechaInicio: true } },
        rrpp: { select: { nombre: true, apellido: true } },
        _count: { select: { cortesias: true } },
      },
    });

    // Las usadas se cuentan aparte: Prisma no permite filtrar dentro de
    // `_count` en esta versión.
    const usadasPorLote = await prisma.cortesia.groupBy({
      by: ["loteId"],
      where: { localId, usada: true },
      _count: { _all: true },
    });

    const usadas = new Map(usadasPorLote.map((u) => [u.loteId, u._count._all]));

    return {
      lotes: lotes.map((l) => ({
        id: l.id,
        nombre: l.nombre,
        evento: l.evento.nombre,
        rrpp: l.rrpp ? `${l.rrpp.nombre} ${l.rrpp.apellido}` : null,
        validaHasta: l.validaHasta,
        anulado: l.anuladoAt !== null,
        total: l._count.cortesias,
        usadas: usadas.get(l.id) ?? 0,
        createdAt: l.createdAt,
      })),
    };
  });

  /**
   * GET /api/cortesias/lotes/:id/codigos — los links para repartir.
   *
   * Devuelve los códigos crudos; el panel arma los links y permite copiarlos o
   * bajarlos en planilla para pasárselos al RRPP.
   */
  app.get("/lotes/:id/codigos", async (req, reply) => {
    const { localId, staffActual } = req;
    const { id } = req.params as { id: string };

    if (!ROLES_GESTION.includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const lote = await prisma.loteCortesias.findFirst({
      where: { id, localId },
      include: { evento: { select: { nombre: true, fechaInicio: true } } },
    });
    if (!lote) return reply.status(404).send({ error: "Lote no encontrado" });

    const cortesias = await prisma.cortesia.findMany({
      where: { loteId: id },
      orderBy: { createdAt: "asc" },
      select: { codigo: true, usada: true, usadaAt: true },
    });

    return { lote, cortesias };
  });

  /**
   * POST /api/cortesias/lotes/:id/anular
   *
   * Da de baja el lote. Las ya usadas no se tocan: esa gente entró y el aforo
   * las contó.
   */
  app.post("/lotes/:id/anular", async (req, reply) => {
    const { localId, staffActual } = req;
    const { id } = req.params as { id: string };

    if (!ROLES_GESTION.includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const lote = await prisma.loteCortesias.findFirst({ where: { id, localId } });
    if (!lote) return reply.status(404).send({ error: "Lote no encontrado" });

    await prisma.loteCortesias.update({
      where: { id },
      data: { anuladoAt: new Date() },
    });

    const sinUsar = await prisma.cortesia.count({
      where: { loteId: id, usada: false },
    });

    return { ok: true, anuladas: sinUsar };
  });

  /**
   * GET /api/cortesias/publica/:codigo — datos para la página del QR.
   *
   * **Sin autenticación**: es el link que se reparte por WhatsApp y lo abre
   * cualquiera. Devuelve solo lo que hace falta para mostrar la pantalla —
   * evento, fecha, hora límite y si ya se usó. Nada del lote, del RRPP ni de
   * cuántas se repartieron.
   */
  app.get("/publica/:codigo", async (req, reply) => {
    const { codigo } = req.params as { codigo: string };

    const cortesia = await prisma.cortesia.findUnique({
      where: { codigo: codigo.toUpperCase() },
      include: {
        lote: {
          select: {
            validaHasta: true,
            anuladoAt: true,
            evento: {
              select: { nombre: true, fechaInicio: true, imagenUrl: true, estado: true },
            },
          },
        },
      },
    });

    if (!cortesia) {
      return reply.status(404).send({ error: "Este código no existe" });
    }

    const ahora = new Date();
    const vencida = cortesia.lote.validaHasta <= ahora;

    return {
      codigo: cortesia.codigo,
      usada: cortesia.usada,
      anulada: cortesia.lote.anuladoAt !== null,
      vencida,
      validaHasta: cortesia.lote.validaHasta,
      evento: cortesia.lote.evento,
      // El QR codifica el mismo código: la puerta escanea y valida contra la
      // base, así que no hace falta meter nada más adentro.
      qr: cortesia.codigo,
    };
  });

  /**
   * POST /api/cortesias/validar — usar el código en la puerta.
   *
   * Mismo criterio que las entradas: un solo UPDATE condicionado decide quién
   * gana. Si dos porteros escanean el mismo código a la vez, entra uno.
   */
  app.post("/validar", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!ROLES_PUERTA.includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const body = z.object({
      codigo: z.string().min(4).max(40),
      nombre: z.string().max(100).optional(),
      registrarAcceso: z.boolean().default(true),
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const codigo = body.data.codigo.trim().toUpperCase();

    const cortesia = await prisma.cortesia.findFirst({
      where: { codigo, localId },
      include: {
        lote: {
          select: {
            id: true,
            nombre: true,
            eventoId: true,
            validaHasta: true,
            anuladoAt: true,
          },
        },
      },
    });

    if (!cortesia) return { resultado: "no_encontrada" };

    if (cortesia.lote.anuladoAt) {
      return { resultado: "anulada", lote: cortesia.lote.nombre };
    }

    if (cortesia.usada) {
      return { resultado: "ya_usada", usadaAt: cortesia.usadaAt };
    }

    /**
     * Vencimiento por horario: es el motivo por el que existe todo esto.
     *
     * Se chequea antes de quemar. Si la persona llega 1:31, el código no se
     * usa —queda intacto— pero no entra. Que el portero pueda decidir algo
     * distinto es una decisión del boliche, no del sistema.
     */
    if (cortesia.lote.validaHasta <= new Date()) {
      return {
        resultado: "fuera_de_horario",
        validaHasta: cortesia.lote.validaHasta,
      };
    }

    // Quemado atómico: solo una request puede pasar `usada` de false a true.
    const quemada = await prisma.cortesia.updateMany({
      where: { id: cortesia.id, usada: false },
      data: {
        usada: true,
        usadaAt: new Date(),
        ...(body.data.nombre && { nombreIngreso: body.data.nombre }),
      },
    });

    if (quemada.count === 0) {
      return { resultado: "ya_usada" };
    }

    if (body.data.registrarAcceso) {
      await prisma.acceso.create({
        data: {
          // `Acceso` no genera id ni fecha: los pone quien lo crea, porque el
          // modelo está pensado para la portería offline, donde el registro
          // nace en el dispositivo y se sincroniza después. Acá el ingreso
          // ocurre contra el servidor, así que se generan en el momento.
          id: randomUUID(),
          createdAt: new Date(),
          localId,
          eventoId: cortesia.lote.eventoId,
          tipo: "ingreso",
          metodo: "qr",
          staffId: staffActual.id,
          synced: "synced",
        },
      });

      await prisma.evento.update({
        where: { id: cortesia.lote.eventoId },
        data: { aforoActual: { increment: 1 } },
      });

      io.to(`local:${localId}`).emit("acceso:nuevo", {
        eventoId: cortesia.lote.eventoId,
        tipo: "ingreso",
        metodo: "cortesia",
      });
    }

    return {
      resultado: "ok",
      lote: cortesia.lote.nombre,
      validaHasta: cortesia.lote.validaHasta,
    };
  });
};

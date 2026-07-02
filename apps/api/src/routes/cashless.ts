/**
 * Rutas de sistema cashless (tarjetas/pulseras con saldo).
 * Prefix: /api/cashless
 *
 * Endpoints:
 *   GET    /tarjetas                — listar todas las tarjetas del local
 *   POST   /tarjetas                — crear/asignar tarjeta a un cliente
 *   GET    /tarjetas/:codigo        — consultar tarjeta por código (balance incluido)
 *   POST   /recargar                — cargar saldo a una tarjeta
 *   POST   /cobrar                  — descontar saldo (pago en barra)
 *   PATCH  /tarjetas/:codigo/estado — activar/desactivar tarjeta
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@niagara/db";
import type { MetodoPago } from "@niagara/db";
import { io } from "../index.js";

// ── Schemas ──────────────────────────────────────────────────────

const crearTarjetaSchema = z.object({
  codigo: z.string().min(1).max(50).trim(),
  clienteNombre: z.string().min(1).max(100).optional(),
  clienteEmail: z.string().email().optional(),
  saldoInicial: z.number().nonnegative().default(0),
});

const recargarSchema = z.object({
  tarjetaCodigo: z.string().min(1).trim(),
  monto: z.number().positive("El monto debe ser mayor a cero"),
  metodoPago: z.enum(["efectivo", "tarjeta", "qr_mp", "cortesia"]),
  mpPaymentId: z.string().optional(), // ID del pago MP (si aplica)
});

const cobrarSchema = z.object({
  tarjetaCodigo: z.string().min(1).trim(),
  monto: z.number().positive(),
  ventaId: z.string().uuid().optional(), // UUID de la venta (para vincular)
});

// ── Rutas ────────────────────────────────────────────────────────

export const registrarRutasCashless: FastifyPluginAsync = async (app) => {

  // GET /api/cashless/tarjetas — listar tarjetas del local
  app.get("/tarjetas", async (req) => {
    const { localId } = req;
    const { activa, busqueda } = req.query as {
      activa?: string;
      busqueda?: string;
    };

    const tarjetas = await prisma.tarjetaCashless.findMany({
      where: {
        localId,
        ...(activa !== undefined && { activa: activa === "true" }),
        ...(busqueda && {
          OR: [
            { codigo: { contains: busqueda, mode: "insensitive" } },
            { clienteNombre: { contains: busqueda, mode: "insensitive" } },
            { clienteEmail: { contains: busqueda, mode: "insensitive" } },
          ],
        }),
      },
      include: {
        recargas: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { monto: true, metodoPago: true, createdAt: true },
        },
        _count: { select: { recargas: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Normalizar Decimal → number
    const normalizadas = tarjetas.map((t) => ({
      ...t,
      saldo: Number(t.saldo),
      recargas: t.recargas.map((r) => ({ ...r, monto: Number(r.monto) })),
    }));

    return { tarjetas: normalizadas };
  });

  // POST /api/cashless/tarjetas — crear tarjeta nueva
  app.post("/tarjetas", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!["admin", "encargado", "cajero"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos para crear tarjetas" });
    }

    const body = crearTarjetaSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const { codigo, clienteNombre, clienteEmail, saldoInicial } = body.data;

    // Verificar código único dentro del local
    const existente = await prisma.tarjetaCashless.findUnique({
      where: { localId_codigo: { localId, codigo } },
    });
    if (existente) {
      return reply.status(409).send({ error: `Ya existe una tarjeta con el código "${codigo}"` });
    }

    const tarjeta = await prisma.tarjetaCashless.create({
      data: {
        localId,
        codigo,
        clienteNombre: clienteNombre ?? null,
        clienteEmail: clienteEmail ?? null,
        saldo: saldoInicial,
      },
    });

    // Si tiene saldo inicial, registrar como recarga de cortesía
    if (saldoInicial > 0) {
      await prisma.recarga.create({
        data: {
          id: crypto.randomUUID(),
          localId,
          tarjetaId: tarjeta.id,
          staffId: staffActual.id,
          monto: saldoInicial,
          metodoPago: "cortesia",
          createdAt: new Date(),
        },
      });
    }

    return reply.status(201).send({
      tarjeta: { ...tarjeta, saldo: Number(tarjeta.saldo) },
    });
  });

  // GET /api/cashless/tarjetas/:codigo — consultar tarjeta por código
  app.get("/tarjetas/:codigo", async (req, reply) => {
    const { localId } = req;
    const { codigo } = req.params as { codigo: string };

    const tarjeta = await prisma.tarjetaCashless.findUnique({
      where: { localId_codigo: { localId, codigo } },
      include: {
        recargas: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            monto: true,
            metodoPago: true,
            createdAt: true,
            staff: { select: { nombre: true, apellido: true } },
          },
        },
      },
    });

    if (!tarjeta) {
      return reply.status(404).send({ error: "Tarjeta no encontrada" });
    }

    if (!tarjeta.activa) {
      return reply.status(403).send({ error: "La tarjeta está desactivada" });
    }

    return {
      tarjeta: {
        ...tarjeta,
        saldo: Number(tarjeta.saldo),
        recargas: tarjeta.recargas.map((r) => ({ ...r, monto: Number(r.monto) })),
      },
    };
  });

  // POST /api/cashless/recargar — cargar saldo a una tarjeta
  app.post("/recargar", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!["admin", "encargado", "cajero"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos para recargar" });
    }

    const body = recargarSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const { tarjetaCodigo, monto, metodoPago, mpPaymentId } = body.data;

    // Buscar tarjeta
    const tarjeta = await prisma.tarjetaCashless.findUnique({
      where: { localId_codigo: { localId, codigo: tarjetaCodigo } },
    });

    if (!tarjeta) {
      return reply.status(404).send({ error: "Tarjeta no encontrada" });
    }
    if (!tarjeta.activa) {
      return reply.status(403).send({ error: "La tarjeta está desactivada" });
    }

    // Acreditar saldo y registrar recarga en transacción
    const [tarjetaActualizada, recarga] = await prisma.$transaction([
      prisma.tarjetaCashless.update({
        where: { id: tarjeta.id },
        data: { saldo: { increment: monto } },
      }),
      prisma.recarga.create({
        data: {
          id: crypto.randomUUID(),
          localId,
          tarjetaId: tarjeta.id,
          staffId: staffActual.id,
          monto,
          metodoPago: metodoPago as MetodoPago,
          mpPaymentId: mpPaymentId ?? null,
          createdAt: new Date(),
        },
      }),
    ]);

    // Emitir evento en tiempo real
    io.to(`local:${localId}`).emit("cashless:recarga", {
      tarjetaCodigo,
      monto,
      nuevoSaldo: Number(tarjetaActualizada.saldo),
    });

    return {
      tarjeta: { ...tarjetaActualizada, saldo: Number(tarjetaActualizada.saldo) },
      recarga: { ...recarga, monto: Number(recarga.monto) },
      nuevoSaldo: Number(tarjetaActualizada.saldo),
    };
  });

  // POST /api/cashless/cobrar — descontar saldo al pagar en barra
  app.post("/cobrar", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!["admin", "encargado", "cajero", "barman"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const body = cobrarSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const { tarjetaCodigo, monto } = body.data;

    // Buscar tarjeta
    const tarjeta = await prisma.tarjetaCashless.findUnique({
      where: { localId_codigo: { localId, codigo: tarjetaCodigo } },
    });

    if (!tarjeta) {
      return reply.status(404).send({ error: "Tarjeta no encontrada" });
    }
    if (!tarjeta.activa) {
      return reply.status(403).send({ error: "La tarjeta está desactivada" });
    }

    const saldoActual = Number(tarjeta.saldo);
    if (saldoActual < monto) {
      return reply.status(422).send({
        error: "Saldo insuficiente",
        saldoActual,
        montoRequerido: monto,
        diferencia: monto - saldoActual,
      });
    }

    // Debitar saldo
    const tarjetaActualizada = await prisma.tarjetaCashless.update({
      where: { id: tarjeta.id },
      data: { saldo: { decrement: monto } },
    });

    // Emitir actualización en tiempo real
    io.to(`local:${localId}`).emit("cashless:cobro", {
      tarjetaCodigo,
      monto,
      nuevoSaldo: Number(tarjetaActualizada.saldo),
    });

    return {
      ok: true,
      saldoAnterior: saldoActual,
      nuevoSaldo: Number(tarjetaActualizada.saldo),
      tarjeta: { ...tarjetaActualizada, saldo: Number(tarjetaActualizada.saldo) },
    };
  });

  // PATCH /api/cashless/tarjetas/:codigo/estado — activar/desactivar
  app.patch("/tarjetas/:codigo/estado", async (req, reply) => {
    const { localId, staffActual } = req;
    const { codigo } = req.params as { codigo: string };

    if (!["admin", "encargado"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const body = z.object({ activa: z.boolean() }).safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const tarjeta = await prisma.tarjetaCashless.update({
      where: { localId_codigo: { localId, codigo } },
      data: { activa: body.data.activa },
    });

    return { tarjeta: { ...tarjeta, saldo: Number(tarjeta.saldo) } };
  });
};

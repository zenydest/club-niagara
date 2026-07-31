/**
 * Rutas de ventas (sync offline-first).
 * El POS genera UUIDs en el cliente y los envía en batch cuando reconecta.
 * Prefix: /api/ventas
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@niagara/db";
import { io } from "../index.js";
import { ventaSchema } from "@niagara/core";

export const registrarRutasVentas: FastifyPluginAsync = async (app) => {
  // GET /api/ventas?eventoId=&desde=&hasta=&limite=
  app.get("/", async (req) => {
    const { localId } = req;
    const { eventoId, desde, hasta, limite } = req.query as {
      eventoId?: string;
      desde?: string;
      hasta?: string;
      limite?: string;
    };

    const ventas = await prisma.venta.findMany({
      where: {
        localId,
        ...(eventoId && { eventoId }),
        ...(desde && { createdAt: { gte: new Date(desde) } }),
        ...(hasta && { createdAt: { lte: new Date(hasta) } }),
      },
      include: {
        items: { include: { producto: true } },
        staff: { select: { nombre: true, apellido: true } },
        barra: { select: { nombre: true } },
      },
      orderBy: { createdAt: "desc" },
      take: Number(limite ?? 100),
    });

    return { ventas };
  });

  /**
   * POST /api/ventas/sync — recibe batch de ventas offline
   * El POS envía un array de ventas con id generado en cliente.
   * Si el id ya existe se ignora (idempotente).
   */
  app.post("/sync", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!["cajero", "admin", "encargado", "barman"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos para registrar ventas" });
    }

    const bodySchema = z.object({
      ventas: z.array(ventaSchema),
    });

    const body = bodySchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const { ventas } = body.data;
    const resultados: { id: string; ok: boolean; error?: string }[] = [];

    for (const v of ventas) {
      try {
        // upsert idempotente — si ya existe, no hace nada
        await prisma.venta.upsert({
          where: { id: v.id },
          update: {},
          create: {
            id: v.id,
            localId,
            eventoId: v.eventoId ?? null,
            barraId: v.barraId ?? null,
            staffId: staffActual.id,
            metodoPago: v.metodoPago,
            total: v.total,
            descuento: v.descuento ?? 0,
            nota: v.nota ?? null,
            createdAt: new Date(v.createdAt),
            synced: "synced",
            items: {
              create: v.items.map((item: { productoId: string; cantidad: number; precioUnitario: number; subtotal: number }) => ({
                localId,
                productoId: item.productoId,
                cantidad: item.cantidad,
                precioUnitario: item.precioUnitario,
                subtotal: item.subtotal,
              })),
            },
          },
        });

        resultados.push({ id: v.id, ok: true });

        // Emitir a dashboard en tiempo real
        // `staffId` y `barraId` son necesarios para la recaudación por cajero:
        // sin ellos el dashboard sabe cuánto se vendió pero no quién vendió.
        io.to(`local:${localId}`).emit("venta:nueva", {
          localId,
          eventoId: v.eventoId,
          barraId: v.barraId ?? null,
          staffId: staffActual.id,
          staffNombre: `${staffActual.nombre} ${staffActual.apellido}`,
          total: v.total,
          metodoPago: v.metodoPago,
        });
      } catch (err) {
        resultados.push({ id: v.id, ok: false, error: String(err) });
      }
    }

    const exitosas = resultados.filter((r) => r.ok).length;
    return reply.status(207).send({ resultados, exitosas, total: ventas.length });
  });

  // POST /api/ventas — venta individual (para cuando hay conexión)
  app.post("/", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!["cajero", "admin", "encargado", "barman"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const body = ventaSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const v = body.data;

    const venta = await prisma.venta.create({
      data: {
        id: v.id,
        localId,
        eventoId: v.eventoId ?? null,
        barraId: v.barraId ?? null,
        staffId: staffActual.id,
        metodoPago: v.metodoPago,
        total: v.total,
        descuento: v.descuento ?? 0,
        nota: v.nota ?? null,
        createdAt: new Date(v.createdAt),
        synced: "synced",
        items: {
          create: v.items.map((item) => ({
            localId,
            productoId: item.productoId,
            cantidad: item.cantidad,
            precioUnitario: item.precioUnitario,
            subtotal: item.subtotal,
          })),
        },
      },
      include: { items: true },
    });

    io.to(`local:${localId}`).emit("venta:nueva", {
      localId,
      eventoId: v.eventoId,
      barraId: v.barraId ?? null,
      staffId: staffActual.id,
      staffNombre: `${staffActual.nombre} ${staffActual.apellido}`,
      total: v.total,
      metodoPago: v.metodoPago,
    });

    return reply.status(201).send({ venta });
  });
};

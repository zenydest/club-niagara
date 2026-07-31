/**
 * Rutas de eventos.
 * Prefix: /api/eventos
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@niagara/db";
import type { EstadoEvento } from "@niagara/db";
import { io } from "../index.js";

const crearEventoSchema = z.object({
  nombre: z.string().min(3),
  descripcion: z.string().optional(),
  fechaInicio: z.string().datetime(),
  fechaFin: z.string().datetime().optional(),
  capacidad: z.number().int().positive(),
  imagenUrl: z.string().url().optional(),
});

export const registrarRutasEventos: FastifyPluginAsync = async (app) => {
  // GET /api/eventos
  app.get("/", async (req) => {
    const { localId } = req;
    const { estado } = req.query as { estado?: string };

    const eventos = await prisma.evento.findMany({
      where: {
        localId,
        ...(estado && { estado: estado as EstadoEvento }),
      },
      orderBy: { fechaInicio: "desc" },
      take: 50,
    });

    return { eventos };
  });

  // GET /api/eventos/:id
  app.get("/:id", async (req, reply) => {
    const { localId } = req;
    const { id } = req.params as { id: string };

    const evento = await prisma.evento.findUnique({
      where: { id, localId },
      include: {
        entradasTipo: true,
        _count: {
          select: {
            accesos: { where: { tipo: "ingreso" } },
            ventas: true,
            entradasVendidas: true,
          },
        },
      },
    });

    if (!evento) return reply.status(404).send({ error: "Evento no encontrado" });

    return { evento };
  });

  // POST /api/eventos
  app.post("/", async (req, reply) => {
    const { localId } = req;

    if (!["admin", "encargado"].includes(req.staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const body = crearEventoSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const evento = await prisma.evento.create({
      data: {
        localId,
        nombre: body.data.nombre,
        // Columnas nullable: Prisma espera `null`, no `undefined`
        descripcion: body.data.descripcion ?? null,
        fechaInicio: new Date(body.data.fechaInicio),
        fechaFin: body.data.fechaFin ? new Date(body.data.fechaFin) : null,
        capacidad: body.data.capacidad,
        imagenUrl: body.data.imagenUrl ?? null,
      },
    });

    return reply.status(201).send({ evento });
  });

  // PATCH /api/eventos/:id — editar datos del evento
  app.patch("/:id", async (req, reply) => {
    const { localId } = req;
    const { id } = req.params as { id: string };

    if (!["admin", "encargado"].includes(req.staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const body = crearEventoSchema.partial().safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const evento = await prisma.evento.update({
      where: { id, localId },
      data: {
        ...(body.data.nombre && { nombre: body.data.nombre }),
        ...(body.data.descripcion !== undefined && { descripcion: body.data.descripcion }),
        ...(body.data.fechaInicio && { fechaInicio: new Date(body.data.fechaInicio) }),
        ...(body.data.fechaFin !== undefined && {
          fechaFin: body.data.fechaFin ? new Date(body.data.fechaFin) : null,
        }),
        ...(body.data.capacidad && { capacidad: body.data.capacidad }),
        ...(body.data.imagenUrl !== undefined && { imagenUrl: body.data.imagenUrl }),
      },
    });

    return { evento };
  });

  // PATCH /api/eventos/:id/estado
  app.patch("/:id/estado", async (req, reply) => {
    const { localId } = req;
    const { id } = req.params as { id: string };

    const body = z.object({
      estado: z.enum(["borrador", "preventa", "en_vivo", "cerrado", "cancelado"]),
    }).safeParse(req.body);

    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    if (!["admin", "encargado"].includes(req.staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const evento = await prisma.evento.update({
      where: { id, localId },
      data: { estado: body.data.estado },
    });

    // Notificar en tiempo real a todos los clientes del local
    io.to(`local:${localId}`).emit("evento:estado_cambiado", {
      eventoId: id,
      estado: body.data.estado,
    });

    return { evento };
  });
};

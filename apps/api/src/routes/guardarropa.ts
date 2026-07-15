/**
 * Guardarropa — tickets de prendas.
 * Prefix: /api/guardarropa
 *
 * GET    /               — listar tickets activos (no entregados)
 * GET    /pendientes     — tickets no entregados (cierre de turno)
 * GET    /siguiente-numero?eventoId= — próximo número de ticket
 * POST   /               — registrar prenda
 * PATCH  /:id/entregar   — marcar prenda como entregada
 * DELETE /:id            — cancelar ticket (error de carga)
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@niagara/db";

export const registrarRutasGuardarropa: FastifyPluginAsync = async (app) => {

  // GET /api/guardarropa — tickets activos del turno/evento
  app.get("/", async (req) => {
    const { localId } = req;
    const { eventoId, entregado } = req.query as {
      eventoId?: string;
      entregado?: string;
    };

    const tickets = await prisma.guardarropa.findMany({
      where: {
        localId,
        ...(eventoId && { eventoId }),
        ...(entregado !== undefined && { entregado: entregado === "true" }),
      },
      include: {
        staff: { select: { nombre: true, apellido: true } },
      },
      orderBy: { numeroTicket: "asc" },
    });

    return { tickets };
  });

  // GET /api/guardarropa/pendientes — no entregados (para cierre)
  app.get("/pendientes", async (req) => {
    const { localId } = req;
    const { eventoId } = req.query as { eventoId?: string };

    const tickets = await prisma.guardarropa.findMany({
      where: {
        localId,
        entregado: false,
        ...(eventoId && { eventoId }),
      },
      orderBy: { numeroTicket: "asc" },
    });

    return {
      tickets,
      total: tickets.length,
    };
  });

  // GET /api/guardarropa/siguiente-numero — número auto-incrementado
  app.get("/siguiente-numero", async (req) => {
    const { localId } = req;
    const { eventoId } = req.query as { eventoId?: string };

    const ultimo = await prisma.guardarropa.findFirst({
      where: {
        localId,
        ...(eventoId ? { eventoId } : { eventoId: null }),
      },
      orderBy: { numeroTicket: "desc" },
      select: { numeroTicket: true },
    });

    return { siguiente: (ultimo?.numeroTicket ?? 0) + 1 };
  });

  // POST /api/guardarropa — registrar prenda
  app.post("/", async (req, reply) => {
    const { localId, staffActual } = req;

    const body = z.object({
      numeroTicket: z.number().int().positive().optional(), // opcional: auto si no se provee
      descripcion: z.string().max(200).nullable().optional(),
      clienteNombre: z.string().max(100).nullable().optional(),
      eventoId: z.string().uuid().nullable().optional(),
    }).safeParse(req.body);

    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    // Si no se provee número, auto-incrementar
    let numeroTicket = body.data.numeroTicket;
    if (!numeroTicket) {
      const ultimo = await prisma.guardarropa.findFirst({
        where: {
          localId,
          ...(body.data.eventoId ? { eventoId: body.data.eventoId } : { eventoId: null }),
        },
        orderBy: { numeroTicket: "desc" },
        select: { numeroTicket: true },
      });
      numeroTicket = (ultimo?.numeroTicket ?? 0) + 1;
    }

    // Verificar que no exista el número en el turno
    const existente = await prisma.guardarropa.findUnique({
      where: {
        localId_eventoId_numeroTicket: {
          localId,
          eventoId: body.data.eventoId ?? "",
          numeroTicket,
        },
      },
    });
    if (existente) {
      return reply.status(409).send({ error: `El ticket #${numeroTicket} ya existe` });
    }

    const ticket = await prisma.guardarropa.create({
      data: {
        localId,
        eventoId: body.data.eventoId ?? null,
        numeroTicket,
        descripcion: body.data.descripcion ?? null,
        clienteNombre: body.data.clienteNombre ?? null,
        staffId: staffActual.id,
        entregado: false,
      },
    });

    return reply.status(201).send({ ticket });
  });

  // PATCH /api/guardarropa/:id/entregar
  app.patch("/:id/entregar", async (req, reply) => {
    const { localId } = req;
    const { id } = req.params as { id: string };

    const ticket = await prisma.guardarropa.findUnique({ where: { id, localId } });
    if (!ticket) return reply.status(404).send({ error: "Ticket no encontrado" });
    if (ticket.entregado) return reply.status(409).send({ error: "La prenda ya fue entregada" });

    const actualizado = await prisma.guardarropa.update({
      where: { id },
      data: { entregado: true },
    });

    return { ticket: actualizado };
  });

  // DELETE /api/guardarropa/:id — cancelar ticket
  app.delete("/:id", async (req, reply) => {
    const { localId, staffActual } = req;
    const { id } = req.params as { id: string };

    if (!["admin", "encargado"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const ticket = await prisma.guardarropa.findUnique({ where: { id, localId } });
    if (!ticket) return reply.status(404).send({ error: "Ticket no encontrado" });
    if (ticket.entregado) return reply.status(409).send({ error: "No se puede eliminar un ticket ya entregado" });

    await prisma.guardarropa.delete({ where: { id } });
    return reply.status(204).send();
  });
};

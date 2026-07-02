/**
 * Rutas de VIP — mesas y reservas.
 * Prefix: /api/vip
 *
 * Mesas:
 *   GET    /mesas?eventoId=         — listar mesas (con estado y reserva activa)
 *   POST   /mesas                   — crear mesa
 *   PATCH  /mesas/:id               — editar mesa (nombre, capacidad, sector, posición)
 *   PATCH  /mesas/:id/estado        — cambiar estado (libre/reservada/ocupada/bloqueada)
 *   DELETE /mesas/:id               — eliminar mesa
 *
 * Reservas:
 *   GET    /reservas?eventoId=      — listar reservas
 *   POST   /reservas                — crear reserva
 *   PATCH  /reservas/:id            — editar reserva
 *   PATCH  /reservas/:id/estado     — confirmar / cancelar / completar
 *   DELETE /reservas/:id            — eliminar reserva
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@niagara/db";
import type { EstadoMesa, EstadoReserva } from "@niagara/db";
import { io } from "../index.js";

// ── Schemas ──────────────────────────────────────────────────────

const mesaSchema = z.object({
  numero: z.string().min(1).max(20),
  sector: z.string().max(50).nullable().optional(),
  capacidad: z.number().int().positive(),
  posX: z.number().min(0).max(100).optional(),  // % sobre el canvas
  posY: z.number().min(0).max(100).optional(),
});

const reservaSchema = z.object({
  eventoId: z.string().uuid().nullable().optional(),
  mesaVipId: z.string().uuid().nullable().optional(),
  clienteNombre: z.string().min(1).max(200),
  clienteEmail: z.string().email().nullable().optional(),
  clienteTelefono: z.string().max(30).nullable().optional(),
  cantidadPersonas: z.number().int().positive(),
  nota: z.string().max(500).nullable().optional(),
  montoSena: z.number().nonnegative().nullable().optional(),
});

// ── Rutas ────────────────────────────────────────────────────────

export const registrarRutasVip: FastifyPluginAsync = async (app) => {

  // ══════════════════════════════════════════════════════════════
  // MESAS
  // ══════════════════════════════════════════════════════════════

  // GET /api/vip/mesas?eventoId=
  app.get("/mesas", async (req) => {
    const { localId } = req;
    const { eventoId } = req.query as { eventoId?: string };

    const mesas = await prisma.mesaVip.findMany({
      where: { localId },
      include: {
        reservas: {
          where: {
            estado: { in: ["pendiente", "confirmada"] },
            ...(eventoId ? { OR: [{ eventoId }, { eventoId: null }] } : {}),
          },
          select: {
            id: true,
            clienteNombre: true,
            clienteTelefono: true,
            cantidadPersonas: true,
            estado: true,
            montoSena: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: [{ sector: "asc" }, { numero: "asc" }],
    });

    return {
      mesas: mesas.map((m) => ({
        ...m,
        reservaActiva: m.reservas[0] ?? null,
        reservas: undefined,
      })),
    };
  });

  // POST /api/vip/mesas — crear mesa
  app.post("/mesas", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!["admin", "encargado"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const body = mesaSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    // Verificar número único dentro del local
    const existente = await prisma.mesaVip.findUnique({
      where: { localId_numero: { localId, numero: body.data.numero } },
    });
    if (existente) {
      return reply.status(409).send({ error: `Ya existe la mesa "${body.data.numero}"` });
    }

    const mesa = await prisma.mesaVip.create({
      data: {
        localId,
        numero: body.data.numero,
        sector: body.data.sector ?? null,
        capacidad: body.data.capacidad,
        posX: body.data.posX ?? 10,
        posY: body.data.posY ?? 10,
        estado: "libre",
      },
    });

    io.to(`local:${localId}`).emit("vip:mesa_actualizada", mesa);
    return reply.status(201).send({ mesa });
  });

  // PATCH /api/vip/mesas/:id — editar datos o posición
  app.patch("/mesas/:id", async (req, reply) => {
    const { localId, staffActual } = req;
    const { id } = req.params as { id: string };

    if (!["admin", "encargado"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const body = mesaSchema.partial().safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const mesa = await prisma.mesaVip.update({
      where: { id, localId },
      data: {
        ...(body.data.numero !== undefined && { numero: body.data.numero }),
        ...(body.data.sector !== undefined && { sector: body.data.sector }),
        ...(body.data.capacidad !== undefined && { capacidad: body.data.capacidad }),
        ...(body.data.posX !== undefined && { posX: body.data.posX }),
        ...(body.data.posY !== undefined && { posY: body.data.posY }),
      },
    });

    io.to(`local:${localId}`).emit("vip:mesa_actualizada", mesa);
    return { mesa };
  });

  // PATCH /api/vip/mesas/:id/estado
  app.patch("/mesas/:id/estado", async (req, reply) => {
    const { localId } = req;
    const { id } = req.params as { id: string };

    const body = z.object({
      estado: z.enum(["libre", "reservada", "ocupada", "bloqueada"]),
    }).safeParse(req.body);

    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const mesa = await prisma.mesaVip.update({
      where: { id, localId },
      data: { estado: body.data.estado as EstadoMesa },
    });

    io.to(`local:${localId}`).emit("vip:mesa_actualizada", mesa);
    return { mesa };
  });

  // DELETE /api/vip/mesas/:id
  app.delete("/mesas/:id", async (req, reply) => {
    const { localId, staffActual } = req;
    const { id } = req.params as { id: string };

    if (staffActual.rol !== "admin") {
      return reply.status(403).send({ error: "Solo el admin puede eliminar mesas" });
    }

    await prisma.mesaVip.delete({ where: { id, localId } });
    io.to(`local:${localId}`).emit("vip:mesa_eliminada", { id });
    return reply.status(204).send();
  });

  // ══════════════════════════════════════════════════════════════
  // RESERVAS
  // ══════════════════════════════════════════════════════════════

  // GET /api/vip/reservas?eventoId=&estado=&mesaVipId=
  app.get("/reservas", async (req) => {
    const { localId } = req;
    const { eventoId, estado, mesaVipId } = req.query as {
      eventoId?: string;
      estado?: string;
      mesaVipId?: string;
    };

    const reservas = await prisma.reserva.findMany({
      where: {
        localId,
        ...(eventoId && { eventoId }),
        ...(estado && { estado: estado as EstadoReserva }),
        ...(mesaVipId && { mesaVipId }),
      },
      include: {
        mesaVip: { select: { numero: true, sector: true, capacidad: true } },
        evento: { select: { nombre: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return {
      reservas: reservas.map((r) => ({
        ...r,
        montoSena: r.montoSena ? Number(r.montoSena) : null,
      })),
    };
  });

  // POST /api/vip/reservas — crear reserva
  app.post("/reservas", async (req, reply) => {
    const { localId, staffActual } = req;

    const rolesPermitidos = ["admin", "encargado", "cajero"];
    if (!rolesPermitidos.includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos para crear reservas" });
    }

    const body = reservaSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    // Si se asigna mesa, verificar que esté libre
    if (body.data.mesaVipId) {
      const mesa = await prisma.mesaVip.findUnique({
        where: { id: body.data.mesaVipId, localId },
      });
      if (!mesa) return reply.status(404).send({ error: "Mesa no encontrada" });
      if (mesa.estado === "bloqueada") {
        return reply.status(422).send({ error: "La mesa está bloqueada" });
      }
    }

    const reserva = await prisma.reserva.create({
      data: {
        localId,
        eventoId: body.data.eventoId ?? null,
        mesaVipId: body.data.mesaVipId ?? null,
        clienteNombre: body.data.clienteNombre,
        clienteEmail: body.data.clienteEmail ?? null,
        clienteTelefono: body.data.clienteTelefono ?? null,
        cantidadPersonas: body.data.cantidadPersonas,
        nota: body.data.nota ?? null,
        montoSena: body.data.montoSena ?? null,
        estado: "pendiente",
      },
      include: {
        mesaVip: { select: { numero: true, sector: true } },
      },
    });

    // Si tiene mesa, actualizar estado de la mesa a "reservada"
    if (body.data.mesaVipId) {
      await prisma.mesaVip.update({
        where: { id: body.data.mesaVipId },
        data: { estado: "reservada" },
      });
      io.to(`local:${localId}`).emit("vip:mesa_actualizada", {
        id: body.data.mesaVipId,
        estado: "reservada",
      });
    }

    io.to(`local:${localId}`).emit("vip:reserva_nueva", reserva);
    return reply.status(201).send({
      reserva: { ...reserva, montoSena: reserva.montoSena ? Number(reserva.montoSena) : null },
    });
  });

  // PATCH /api/vip/reservas/:id — editar datos de la reserva
  app.patch("/reservas/:id", async (req, reply) => {
    const { localId, staffActual } = req;
    const { id } = req.params as { id: string };

    if (!["admin", "encargado", "cajero"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const body = reservaSchema.partial().safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const reserva = await prisma.reserva.update({
      where: { id, localId },
      data: {
        ...(body.data.clienteNombre && { clienteNombre: body.data.clienteNombre }),
        ...(body.data.clienteEmail !== undefined && { clienteEmail: body.data.clienteEmail }),
        ...(body.data.clienteTelefono !== undefined && { clienteTelefono: body.data.clienteTelefono }),
        ...(body.data.cantidadPersonas && { cantidadPersonas: body.data.cantidadPersonas }),
        ...(body.data.nota !== undefined && { nota: body.data.nota }),
        ...(body.data.montoSena !== undefined && { montoSena: body.data.montoSena }),
        ...(body.data.mesaVipId !== undefined && { mesaVipId: body.data.mesaVipId }),
        ...(body.data.eventoId !== undefined && { eventoId: body.data.eventoId }),
      },
      include: { mesaVip: { select: { numero: true, sector: true } } },
    });

    return { reserva: { ...reserva, montoSena: reserva.montoSena ? Number(reserva.montoSena) : null } };
  });

  // PATCH /api/vip/reservas/:id/estado — confirmar / cancelar / completar
  app.patch("/reservas/:id/estado", async (req, reply) => {
    const { localId } = req;
    const { id } = req.params as { id: string };

    const body = z.object({
      estado: z.enum(["pendiente", "confirmada", "cancelada", "completada"]),
    }).safeParse(req.body);

    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const reserva = await prisma.reserva.update({
      where: { id, localId },
      data: { estado: body.data.estado as EstadoReserva },
    });

    // Si se cancela o completa, liberar la mesa
    if (["cancelada", "completada"].includes(body.data.estado) && reserva.mesaVipId) {
      await prisma.mesaVip.update({
        where: { id: reserva.mesaVipId },
        data: { estado: "libre" },
      });
      io.to(`local:${localId}`).emit("vip:mesa_actualizada", {
        id: reserva.mesaVipId,
        estado: "libre",
      });
    }

    io.to(`local:${localId}`).emit("vip:reserva_actualizada", reserva);
    return { reserva: { ...reserva, montoSena: reserva.montoSena ? Number(reserva.montoSena) : null } };
  });

  // DELETE /api/vip/reservas/:id
  app.delete("/reservas/:id", async (req, reply) => {
    const { localId, staffActual } = req;
    const { id } = req.params as { id: string };

    if (!["admin", "encargado"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const reserva = await prisma.reserva.findUnique({ where: { id, localId } });
    if (!reserva) return reply.status(404).send({ error: "Reserva no encontrada" });

    await prisma.reserva.delete({ where: { id } });

    // Liberar mesa si tenía
    if (reserva.mesaVipId) {
      await prisma.mesaVip.update({
        where: { id: reserva.mesaVipId },
        data: { estado: "libre" },
      });
      io.to(`local:${localId}`).emit("vip:mesa_actualizada", {
        id: reserva.mesaVipId,
        estado: "libre",
      });
    }

    return reply.status(204).send();
  });
};

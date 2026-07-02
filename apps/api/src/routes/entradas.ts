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
import { z } from "zod";
import { prisma } from "@niagara/db";
import type { MetodoPago, TipoEntrada } from "@niagara/db";
import { io } from "../index.js";

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
        tipo: body.data.tipo as TipoEntrada,
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
        ...(body.data.tipo && { tipo: body.data.tipo as TipoEntrada }),
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
      include: { _count: { select: { entradasVendidas: true } } },
    });

    if (!tipo || !tipo.activo) {
      return reply.status(404).send({ error: "Tipo de entrada no encontrado" });
    }

    if (tipo.cantidadTotal !== null) {
      const vendidas = tipo._count.entradasVendidas;
      if (vendidas + cantidad > tipo.cantidadTotal) {
        return reply.status(422).send({
          error: "Sin cupo disponible",
          disponibles: tipo.cantidadTotal - vendidas,
          requeridas: cantidad,
        });
      }
    }

    // Crear las entradas (una por cantidad)
    const entradas = await Promise.all(
      Array.from({ length: cantidad }).map(() =>
        prisma.entradaVendida.create({
          data: {
            localId,
            eventoId,
            entradaTipoId,
            clienteNombre,
            clienteEmail: clienteEmail ?? null,
            clienteTelefono: clienteTelefono ?? null,
            precioPagado,
            metodoPago: metodoPago as MetodoPago,
            rrppId: rrppId ?? null,
          },
        })
      )
    );

    // Actualizar contador en EntradaTipo
    await prisma.entradaTipo.update({
      where: { id: entradaTipoId },
      data: { cantidadVendida: { increment: cantidad } },
    });

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
    });
  });

  // GET /api/entradas/vendidas?eventoId=&entradaTipoId=&usada=&busqueda=
  app.get("/vendidas", async (req) => {
    const { localId } = req;
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
    const { localId } = req;
    const { qrCode } = req.params as { qrCode: string };

    const entrada = await prisma.entradaVendida.findUnique({
      where: { qrCode },
      include: {
        entradaTipo: true,
        evento: { select: { nombre: true, estado: true } },
      },
    });

    if (!entrada || entrada.localId !== localId) {
      return reply.status(404).send({ error: "Entrada no encontrada" });
    }

    return {
      entrada: { ...entrada, precioPagado: Number(entrada.precioPagado) },
    };
  });

  // PATCH /api/entradas/vendidas/:id/usar — check-in manual
  app.patch("/vendidas/:id/usar", async (req, reply) => {
    const { localId } = req;
    const { id } = req.params as { id: string };

    const entrada = await prisma.entradaVendida.findUnique({
      where: { id, localId },
    });

    if (!entrada) {
      return reply.status(404).send({ error: "Entrada no encontrada" });
    }
    if (entrada.usada) {
      return reply.status(409).send({ error: "Entrada ya fue utilizada" });
    }

    const actualizada = await prisma.entradaVendida.update({
      where: { id },
      data: { usada: true },
    });

    return { entrada: { ...actualizada, precioPagado: Number(actualizada.precioPagado) } };
  });
};

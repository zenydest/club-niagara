/**
 * Rutas de portería / control de acceso.
 * Offline-first: misma lógica de sync que ventas.
 * Prefix: /api/accesos
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@niagara/db";
import type { TipoAcceso, MetodoAcceso } from "@niagara/db";
import { io } from "../index.js";
import { accesosSchema } from "@niagara/core";

export const registrarRutasAccesos: FastifyPluginAsync = async (app) => {
  // GET /api/accesos/eventos-activos — eventos en vivo o preventa del local
  app.get("/eventos-activos", async (req, reply) => {
    const { localId } = req;

    const eventos = await prisma.evento.findMany({
      where: {
        localId,
        estado: { in: ["en_vivo", "preventa"] },
      },
      select: {
        id: true,
        nombre: true,
        fechaInicio: true,
        capacidad: true,
        aforoActual: true,
        estado: true,
      },
      orderBy: { fechaInicio: "desc" },
    });

    return { eventos };
  });

  // GET /api/accesos/aforo?eventoId=
  app.get("/aforo", async (req, reply) => {
    const { localId } = req;
    const { eventoId } = req.query as { eventoId: string };

    if (!eventoId) return reply.status(400).send({ error: "eventoId requerido" });

    const [ingresos, egresos, evento] = await Promise.all([
      prisma.acceso.count({ where: { localId, eventoId, tipo: "ingreso" } }),
      prisma.acceso.count({ where: { localId, eventoId, tipo: "egreso" } }),
      prisma.evento.findUnique({ where: { id: eventoId, localId }, select: { capacidad: true, nombre: true } }),
    ]);

    if (!evento) return reply.status(404).send({ error: "Evento no encontrado" });

    const aforoActual = Math.max(0, ingresos - egresos);

    return {
      eventoId,
      aforoActual,
      capacidad: evento.capacidad,
      ingresos,
      egresos,
      disponibles: evento.capacidad - aforoActual,
      lleno: aforoActual >= evento.capacidad,
    };
  });

  // POST /api/accesos/sync — batch offline
  app.post("/sync", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!["portero", "admin", "encargado"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const bodySchema = z.object({
      accesos: z.array(accesosSchema),
    });

    const body = bodySchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const { accesos } = body.data;
    const resultados: { id: string; ok: boolean; error?: string }[] = [];

    for (const a of accesos) {
      try {
        await prisma.acceso.upsert({
          where: { id: a.id },
          update: {},
          create: {
            id: a.id,
            localId,
            eventoId: a.eventoId,
            staffId: staffActual.id,
            tipo: a.tipo as TipoAcceso,
            metodo: (a.metodo ?? "manual") as MetodoAcceso,
            createdAt: new Date(a.createdAt),
            synced: "synced",
          },
        });

        resultados.push({ id: a.id, ok: true });

        // Actualizar aforo en tiempo real
        const [ingresos, egresos] = await Promise.all([
          prisma.acceso.count({ where: { localId, eventoId: a.eventoId, tipo: "ingreso" } }),
          prisma.acceso.count({ where: { localId, eventoId: a.eventoId, tipo: "egreso" } }),
        ]);

        io.to(`local:${localId}`).emit("aforo:actualizado", {
          eventoId: a.eventoId,
          aforoActual: Math.max(0, ingresos - egresos),
        });
      } catch (err) {
        resultados.push({ id: a.id, ok: false, error: String(err) });
      }
    }

    return reply.status(207).send({ resultados, exitosas: resultados.filter((r) => r.ok).length });
  });

  // POST /api/accesos — acceso individual (con conexión)
  app.post("/", async (req, reply) => {
    const { localId, staffActual } = req;

    const body = accesosSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const a = body.data;

    // Verificar si hay aforo disponible para ingresos
    if (a.tipo === "ingreso") {
      const evento = await prisma.evento.findUnique({
        where: { id: a.eventoId, localId },
        select: { capacidad: true },
      });

      if (evento) {
        const [ingresos, egresos] = await Promise.all([
          prisma.acceso.count({ where: { localId, eventoId: a.eventoId, tipo: "ingreso" } }),
          prisma.acceso.count({ where: { localId, eventoId: a.eventoId, tipo: "egreso" } }),
        ]);

        if (ingresos - egresos >= evento.capacidad) {
          return reply.status(422).send({ error: "Aforo completo" });
        }
      }
    }

    const acceso = await prisma.acceso.create({
      data: {
        id: a.id,
        localId,
        eventoId: a.eventoId,
        staffId: staffActual.id,
        tipo: a.tipo as TipoAcceso,
        metodo: (a.metodo ?? "manual") as MetodoAcceso,
        createdAt: new Date(a.createdAt),
        synced: "synced",
      },
    });

    // Aforo en tiempo real
    const [ingresos, egresos] = await Promise.all([
      prisma.acceso.count({ where: { localId, eventoId: a.eventoId, tipo: "ingreso" } }),
      prisma.acceso.count({ where: { localId, eventoId: a.eventoId, tipo: "egreso" } }),
    ]);

    io.to(`local:${localId}`).emit("aforo:actualizado", {
      eventoId: a.eventoId,
      aforoActual: Math.max(0, ingresos - egresos),
    });

    return reply.status(201).send({ acceso });
  });
};

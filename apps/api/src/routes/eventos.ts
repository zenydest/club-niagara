/**
 * Rutas de eventos.
 * Prefix: /api/eventos
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@niagara/db";
import type { EstadoEvento } from "@niagara/db";
import { io } from "../index.js";

/**
 * `.nullish()` y no `.optional()` en los campos que pueden venir vacíos.
 *
 * `.optional()` solo acepta que la clave falte; el panel manda `null` explícito
 * para "sin descripción" / "sin fecha de fin", y Zod lo rechazaba con
 * "Expected string, received null". El formulario de nuevo evento no dejaba
 * crear nada si no se llenaban campos que son opcionales.
 *
 * `imagenUrl` acepta además cadena vacía: es lo que queda cuando se borra la
 * imagen desde el campo, y significa lo mismo que no tenerla.
 */
const crearEventoSchema = z.object({
  nombre: z.string().min(3),
  descripcion: z.string().nullish(),
  fechaInicio: z.string().datetime(),
  fechaFin: z.string().datetime().nullish(),
  capacidad: z.number().int().positive(),
  imagenUrl: z.union([z.string().url(), z.literal("")]).nullish(),
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
        // Cadena vacía y "sin imagen" son lo mismo; en la base va `null` para
        // no tener dos formas de representar lo mismo.
        imagenUrl: body.data.imagenUrl || null,
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
        ...(body.data.imagenUrl !== undefined && { imagenUrl: body.data.imagenUrl || null }),
      },
    });

    return { evento };
  });

  /**
   * DELETE /api/eventos/:id
   *
   * Solo borra eventos que no dejaron rastro: sin ventas, sin entradas
   * vendidas, sin accesos, sin reservas y sin guardarropa.
   *
   * Un evento con movimiento **no se borra ni se puede forzar**. No es una
   * restricción del código: esa información es la recaudación de una noche.
   * Para sacarlo de la vista está el estado `cerrado`.
   *
   * Los tipos de entrada sí se borran con el evento, porque sin él no
   * significan nada.
   */
  app.delete("/:id", async (req, reply) => {
    const { localId } = req;
    const { id } = req.params as { id: string };

    if (req.staffActual.rol !== "admin") {
      return reply.status(403).send({ error: "Solo el admin puede eliminar eventos" });
    }

    const evento = await prisma.evento.findFirst({
      where: { id, localId },
      include: {
        _count: {
          select: {
            ventas: true,
            entradasVendidas: true,
            accesos: true,
            reservas: true,
            guardarropa: true,
          },
        },
      },
    });

    if (!evento) return reply.status(404).send({ error: "Evento no encontrado" });

    const c = evento._count;
    const movimiento =
      c.ventas + c.entradasVendidas + c.accesos + c.reservas + c.guardarropa;

    if (movimiento > 0) {
      return reply.status(409).send({
        error:
          "El evento tiene movimiento registrado y no se puede eliminar. " +
          "Cambialo a “cerrado” para sacarlo de la vista.",
        detalle: {
          ventas: c.ventas,
          entradasVendidas: c.entradasVendidas,
          accesos: c.accesos,
          reservas: c.reservas,
          guardarropa: c.guardarropa,
        },
      });
    }

    // Los tipos primero: son hijos del evento y sin él no tienen sentido.
    await prisma.$transaction([
      prisma.entradaTipo.deleteMany({ where: { eventoId: id } }),
      prisma.evento.delete({ where: { id } }),
    ]);

    return reply.status(204).send();
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

/**
 * Rutas de productos (menú del POS).
 * El POS descarga el catálogo al iniciar y lo cachea en IndexedDB.
 * Prefix: /api/productos
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@niagara/db";

const productoSchema = z.object({
  nombre: z.string().min(2),
  descripcion: z.string().optional(),
  categoria: z.string().min(2),
  precio: z.number().positive(),
  costo: z.number().positive().optional(),
  imagenUrl: z.string().url().optional(),
});

export const registrarRutasProductos: FastifyPluginAsync = async (app) => {
  // GET /api/productos?categoria=&soloActivos=true
  app.get("/", async (req) => {
    const { localId } = req;
    const { categoria, soloActivos } = req.query as { categoria?: string; soloActivos?: string };

    const productos = await prisma.producto.findMany({
      where: {
        localId,
        ...(categoria && { categoria }),
        ...(soloActivos !== "false" && { activo: true }),
      },
      orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
    });

    return { productos };
  });

  // GET /api/productos/categorias — lista de categorías únicas
  app.get("/categorias", async (req) => {
    const { localId } = req;

    const result = await prisma.producto.findMany({
      where: { localId, activo: true },
      select: { categoria: true },
      distinct: ["categoria"],
      orderBy: { categoria: "asc" },
    });

    return { categorias: result.map((r) => r.categoria) };
  });

  // POST /api/productos
  app.post("/", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!["admin", "encargado"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const body = productoSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const producto = await prisma.producto.create({
      data: { localId, ...body.data },
    });

    return reply.status(201).send({ producto });
  });

  // PATCH /api/productos/:id
  app.patch("/:id", async (req, reply) => {
    const { localId, staffActual } = req;
    const { id } = req.params as { id: string };

    if (!["admin", "encargado"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const body = productoSchema.partial().safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const producto = await prisma.producto.update({
      where: { id, localId },
      data: body.data,
    });

    return { producto };
  });

  // DELETE /api/productos/:id — soft delete
  app.delete("/:id", async (req, reply) => {
    const { localId, staffActual } = req;
    const { id } = req.params as { id: string };

    if (staffActual.rol !== "admin") {
      return reply.status(403).send({ error: "Solo el admin puede eliminar productos" });
    }

    await prisma.producto.update({
      where: { id, localId },
      data: { activo: false },
    });

    return reply.status(204).send();
  });
};

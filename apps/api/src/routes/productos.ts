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
  descripcion: z.string().nullish(),
  categoria: z.string().min(2),
  precio: z.number().positive(),
  costo: z.number().positive().nullish(),
  imagenUrl: z.union([z.string().url(), z.literal("")]).nullish(),
});

/**
 * En el PATCH se acepta además `activo`, que no está en el alta porque un
 * producto nuevo siempre nace activo.
 *
 * Sirve para deshacer una baja: sin esto, un producto dado de baja por error
 * quedaba fuera de la carta para siempre y había que crearlo de nuevo, con lo
 * que las ventas viejas quedaban colgadas del producto muerto.
 */
const editarProductoSchema = productoSchema.partial().extend({
  activo: z.boolean().optional(),
});

/**
 * Borra el producto si nunca se usó; si no, lo desactiva.
 *
 * Devuelve `null` si no existe en ese local. `borrado: false` significa que
 * quedó inactivo pero sigue en la base.
 */
async function eliminarProducto(
  id: string,
  localId: string
): Promise<{ nombre: string; borrado: boolean } | null> {
  const producto = await prisma.producto.findFirst({
    where: { id, localId },
    include: {
      _count: { select: { ventaItems: true, stockMovimientos: true } },
    },
  });

  if (!producto) return null;

  const tieneHistoria =
    producto._count.ventaItems > 0 || producto._count.stockMovimientos > 0;

  if (tieneHistoria) {
    await prisma.producto.update({ where: { id }, data: { activo: false } });
    return { nombre: producto.nombre, borrado: false };
  }

  await prisma.producto.delete({ where: { id } });
  return { nombre: producto.nombre, borrado: true };
}

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

    return { categorias: result.map((r: { categoria: string }) => r.categoria) };
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

    const { nombre, categoria, precio, descripcion, costo, imagenUrl } = body.data;

    const producto = await prisma.producto.create({
      data: {
        localId,
        nombre,
        categoria,
        precio,
        // Columnas nullable: Prisma espera `null`, no `undefined`
        descripcion: descripcion ?? null,
        costo: costo ?? null,
        imagenUrl: imagenUrl ?? null,
      },
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

    const body = editarProductoSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const d = body.data;

    // En un PATCH, omitir un campo y mandarlo como `undefined` no es lo mismo
    // para Prisma, así que solo se incluyen las claves realmente enviadas.
    const producto = await prisma.producto.update({
      where: { id, localId },
      data: {
        ...(d.nombre !== undefined && { nombre: d.nombre }),
        ...(d.categoria !== undefined && { categoria: d.categoria }),
        ...(d.precio !== undefined && { precio: d.precio }),
        ...(d.descripcion !== undefined && { descripcion: d.descripcion || null }),
        ...(d.costo !== undefined && { costo: d.costo ?? null }),
        ...(d.imagenUrl !== undefined && { imagenUrl: d.imagenUrl || null }),
        ...(d.activo !== undefined && { activo: d.activo }),
      },
    });

    return { producto };
  });

  /**
   * DELETE /api/productos/:id
   *
   * Borra de verdad si el producto nunca se usó; si tiene ventas o movimientos
   * de stock, lo da de baja.
   *
   * No es un capricho: las ventas viejas apuntan al producto. Borrarlo de la
   * base dejaría los reportes históricos con ítems sin nombre ni precio, y esa
   * información no se recupera. En cambio un producto que nunca se vendió
   * —típico de los de prueba— no le sirve a nadie ocupando la lista.
   */
  app.delete("/:id", async (req, reply) => {
    const { localId, staffActual } = req;
    const { id } = req.params as { id: string };

    if (staffActual.rol !== "admin") {
      return reply.status(403).send({ error: "Solo el admin puede eliminar productos" });
    }

    const resultado = await eliminarProducto(id, localId);
    if (!resultado) return reply.status(404).send({ error: "Producto no encontrado" });

    return { ...resultado };
  });

  /**
   * POST /api/productos/eliminar — borrado en lote.
   *
   * Existe para poder limpiar la carta de prueba de una sola vez, en vez de
   * borrar de a uno. Devuelve el detalle de qué se borró y qué se dio de baja,
   * porque no todos los productos terminan igual.
   */
  app.post("/eliminar", async (req, reply) => {
    const { localId, staffActual } = req;

    if (staffActual.rol !== "admin") {
      return reply.status(403).send({ error: "Solo el admin puede eliminar productos" });
    }

    const body = z.object({
      ids: z.array(z.string().uuid()).min(1).max(200),
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const borrados: string[] = [];
    const dadosDeBaja: string[] = [];

    for (const id of body.data.ids) {
      const r = await eliminarProducto(id, localId);
      if (!r) continue;
      if (r.borrado) borrados.push(r.nombre);
      else dadosDeBaja.push(r.nombre);
    }

    return {
      borrados: borrados.length,
      dadosDeBaja: dadosDeBaja.length,
      nombresDadosDeBaja: dadosDeBaja,
    };
  });
};

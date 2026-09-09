/**
 * Ruta de KPIs del dashboard en tiempo real.
 * Prefix: /api/dashboard
 */

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@niagara/db";

export const registrarRutasDashboard: FastifyPluginAsync = async (app) => {
  // GET /api/dashboard/kpis?eventoId=xxx
  app.get("/kpis", async (req, reply) => {
    const { localId, staffActual } = req;
    const { eventoId } = req.query as { eventoId?: string };

    /**
     * Los KPIs incluyen la recaudación de la noche, así que van solo para el
     * dueño.
     *
     * Se pasó por alto en la revisión de permisos: se cerró Reportes pero no
     * esto, y un RRPP entrando al panel veía la facturación completa en la
     * primera pantalla.
     *
     * El encargado quedó afuera junto con el dashboard: lo que necesita mirar
     * está en Reportes. El cajero tiene su propia vista en `/mi-consumo`, sin
     * montos acumulados.
     */
    if (staffActual.rol !== "admin") {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    // Evento activo: el pasado por query o el último evento "en_vivo"
    const evento = eventoId
      ? await prisma.evento.findUnique({ where: { id: eventoId, localId } })
      : await prisma.evento.findFirst({
          where: { localId, estado: "en_vivo" },
          orderBy: { fechaInicio: "desc" },
        });

    // Que no haya evento en vivo no es un error: es un martes a la tarde.
    //
    // Antes esto devolvía 404 y el panel mostraba pantalla de error con el
    // 404 rojo en la consola cada 60 segundos. Ahora responde 200 con el
    // evento en null y los contadores en cero, y el dashboard puede decir
    // "no hay ningún evento en vivo", que es la verdad.
    //
    // El 404 se reserva para cuando piden un `eventoId` que no existe: ahí sí
    // el recurso pedido no está.
    if (!evento) {
      if (eventoId) {
        return reply.status(404).send({ error: "El evento no existe" });
      }

      return {
        evento: null,
        kpis: {
          aforoActual: 0,
          aforoMaximo: 0,
          porcentajeAforo: 0,
          totalIngresos: 0,
          totalEgresos: 0,
          ventasBarra: { total: 0, cantidad: 0 },
          boleteria: { total: 0, cantidad: 0 },
          recaudacionTotal: 0,
        },
      };
    }

    // Consultas en paralelo para performance
    const [accesosIngreso, accesosSalida, ventas, entradasVendidas] = await Promise.all([
      prisma.acceso.count({ where: { localId, eventoId: evento.id, tipo: "ingreso" } }),
      prisma.acceso.count({ where: { localId, eventoId: evento.id, tipo: "egreso" } }),
      prisma.venta.aggregate({
        where: { localId, eventoId: evento.id },
        _sum: { total: true },
        _count: { id: true },
      }),
      prisma.entradaVendida.aggregate({
        where: { localId, eventoId: evento.id },
        _count: { id: true },
        _sum: { precioPagado: true },
      }),
    ]);

    const aforoActual = accesosIngreso - accesosSalida;

    return {
      evento: {
        id: evento.id,
        nombre: evento.nombre,
        estado: evento.estado,
        capacidad: evento.capacidad,
        fechaInicio: evento.fechaInicio,
      },
      kpis: {
        aforoActual: Math.max(0, aforoActual),
        aforoMaximo: evento.capacidad,
        porcentajeAforo: Math.round((Math.max(0, aforoActual) / evento.capacidad) * 100),
        totalIngresos: accesosIngreso,
        totalEgresos: accesosSalida,
        ventasBarra: {
          total: Number(ventas._sum.total ?? 0),
          cantidad: ventas._count.id,
        },
        boleteria: {
          total: Number(entradasVendidas._sum.precioPagado ?? 0),
          cantidad: entradasVendidas._count.id,
        },
        recaudacionTotal:
          Number(ventas._sum.total ?? 0) + Number(entradasVendidas._sum.precioPagado ?? 0),
      },
    };
  });

  // GET /api/dashboard/ventas-por-hora?eventoId=xxx
  app.get("/ventas-por-hora", async (req, reply) => {
    const { localId, staffActual } = req;

    if (staffActual.rol !== "admin") {
      return reply.status(403).send({ error: "Sin permisos" });
    }
    const { eventoId } = req.query as { eventoId?: string };

    // Ventas agrupadas por hora — filtro opcional de eventoId con cast nullable
    const resultado = await prisma.$queryRaw<{ hora: Date; total: number; cantidad: number }[]>`
      SELECT
        DATE_TRUNC('hour', "created_at") AS hora,
        SUM(total)::float AS total,
        COUNT(id)::int AS cantidad
      FROM ventas
      WHERE local_id = ${localId}
        AND (${eventoId ?? null}::text IS NULL OR evento_id = ${eventoId ?? null})
      GROUP BY DATE_TRUNC('hour', "created_at")
      ORDER BY hora ASC
    `;

    return { ventasPorHora: resultado };
  });

  /**
   * GET /api/dashboard/mi-consumo — qué vendió el cajero que está pidiendo.
   *
   * Es el dashboard del cajero, y es deliberadamente distinto del de gerencia:
   * responde "qué salió de mi barra" y no "cuánto se facturó". Por eso devuelve
   * unidades y precio de lista, y ningún total acumulado. La facturación la
   * mira el dueño.
   *
   * El filtro por `staffId` no es configurable: siempre es quien pregunta. Un
   * cajero no puede consultar lo de otro ni pasando parámetros.
   */
  app.get("/mi-consumo", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!["cajero", "admin"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const evento = await prisma.evento.findFirst({
      where: { localId, estado: "en_vivo" },
      orderBy: { fechaInicio: "desc" },
      select: { id: true, nombre: true },
    });

    /**
     * Con evento en vivo se filtra por evento; si no, por las últimas 12 horas.
     *
     * No sirve "hoy": una noche de boliche cruza la medianoche, y a las 3 AM el
     * cajero vería su turno vacío porque las ventas quedaron en el día
     * anterior. Doce horas cubre el turno más largo sin arrastrar el de ayer.
     */
    const desde = new Date(Date.now() - 12 * 60 * 60 * 1000);

    const items = await prisma.ventaItem.findMany({
      where: {
        localId,
        venta: {
          staffId: staffActual.id,
          ...(evento ? { eventoId: evento.id } : { createdAt: { gte: desde } }),
        },
      },
      select: {
        cantidad: true,
        ventaId: true,
        producto: { select: { nombre: true, categoria: true, precio: true } },
      },
    });

    // Se agrupa acá y no en SQL porque es el turno de una sola persona: unos
    // cientos de filas como mucho. Un groupBy de Prisma no alcanza igual,
    // porque la categoría vive en `productos` y no en `venta_items`.
    const porCategoria = new Map<
      string,
      { unidades: number; productos: Map<string, { unidades: number; precioUnitario: number }> }
    >();

    for (const item of items) {
      const categoria = item.producto.categoria;
      // El `new Map()` va tipado: sin los parámetros infiere `Map<any, any>` y
      // todo lo que sale de `grupo` deja de estar chequeado.
      const grupo = porCategoria.get(categoria) ?? {
        unidades: 0,
        productos: new Map<string, { unidades: number; precioUnitario: number }>(),
      };

      grupo.unidades += item.cantidad;

      const previo = grupo.productos.get(item.producto.nombre);
      grupo.productos.set(item.producto.nombre, {
        unidades: (previo?.unidades ?? 0) + item.cantidad,
        precioUnitario: Number(item.producto.precio),
      });

      porCategoria.set(categoria, grupo);
    }

    const categorias = [...porCategoria.entries()]
      .map(([nombre, grupo]) => ({
        nombre,
        unidades: grupo.unidades,
        productos: [...grupo.productos.entries()]
          .map(([nombreProducto, datos]) => ({ nombre: nombreProducto, ...datos }))
          .sort((a, b) => b.unidades - a.unidades),
      }))
      .sort((a, b) => b.unidades - a.unidades);

    return {
      evento,
      // Cuántas ventas distintas cerró, no cuánta plata entró.
      cantidadVentas: new Set(items.map((i) => i.ventaId)).size,
      totalUnidades: items.reduce((acc, i) => acc + i.cantidad, 0),
      categorias,
      ...(evento ? {} : { desde: desde.toISOString() }),
    };
  });
};

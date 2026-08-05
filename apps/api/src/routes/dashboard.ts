/**
 * Ruta de KPIs del dashboard en tiempo real.
 * Prefix: /api/dashboard
 */

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@niagara/db";

export const registrarRutasDashboard: FastifyPluginAsync = async (app) => {
  // GET /api/dashboard/kpis?eventoId=xxx
  app.get("/kpis", async (req, reply) => {
    const { localId } = req;
    const { eventoId } = req.query as { eventoId?: string };

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
  app.get("/ventas-por-hora", async (req) => {
    const { localId } = req;
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
};

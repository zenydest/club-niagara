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

    if (!evento) {
      return reply.status(404).send({ error: "No hay evento activo" });
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

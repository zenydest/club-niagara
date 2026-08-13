/**
 * Rutas de Reportes + Corte de Caja.
 * Prefix: /api/reportes
 *
 * Reportes:
 *   GET  /resumen?fechaDesde=&fechaHasta=&eventoId=
 *        → KPIs: ventas por método, recargas cashless, accesos, entradas
 *   GET  /ventas?fechaDesde=&fechaHasta=&barraId=&metodoPago=&page=&limit=
 *        → Listado paginado de ventas con items
 *   GET  /productos-top?fechaDesde=&fechaHasta=&limit=
 *        → Top N productos por cantidad vendida y monto
 *   GET  /ventas-por-hora?fechaDesde=&fechaHasta=
 *        → Agregado de ventas agrupado por hora (para gráfico)
 *
 * Corte de caja:
 *   GET   /cortes?barraId=&eventoId=
 *         → Historial de cortes del local
 *   POST  /cortes
 *         → Crear nuevo corte (calcula totales desde ventas del período)
 *   PATCH /cortes/:id/cerrar
 *         → Cerrar corte con efectivo real declarado
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@niagara/db";

// ── Helpers ───────────────────────────────────────────────────────

/** Convierte string de fecha a inicio/fin del día en UTC-3 (Argentina) */
function parsearRangoFechas(desde?: string, hasta?: string): { gte: Date; lte: Date } {
  const hoy = new Date();
  // Inicio del día actual en Argentina (UTC-3)
  const inicioHoy = new Date(hoy);
  inicioHoy.setUTCHours(3, 0, 0, 0); // 00:00 ART = 03:00 UTC

  const gte = desde ? new Date(desde) : inicioHoy;
  const lte = hasta ? new Date(hasta) : new Date(hoy.getTime() + 24 * 60 * 60 * 1000);

  return { gte, lte };
}

// ── Rutas ────────────────────────────────────────────────────────

export const registrarRutasReportes: FastifyPluginAsync = async (app) => {

  /**
   * GET /api/reportes/por-cajero — recaudación de cada cajero.
   *
   * Es lo que se mira desde la oficina para ver cómo va cada puesto de la
   * barra. Agrupa por staff y desglosa por método de pago, porque el efectivo
   * es lo único que después hay que contar a mano contra la caja física.
   */
  /**
   * Todo lo que muestra plata del local es solo para admin y encargado.
   *
   * El sidebar ya oculta Reportes para los demás roles, pero eso es apariencia:
   * la sesión de un portero o un barman sirve igual para llamar al endpoint
   * directo. Sin este chequeo, cualquiera con una cuenta veía la recaudación
   * completa de la noche.
   */
  const soloGerencia = async (
    req: { staffActual: { rol: string } },
    reply: { status: (n: number) => { send: (b: unknown) => unknown } }
  ): Promise<boolean> => {
    if (!["admin", "encargado"].includes(req.staffActual.rol)) {
      reply.status(403).send({ error: "Sin permisos para ver reportes" });
      return false;
    }
    return true;
  };

  app.get("/por-cajero", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!["admin", "encargado"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const { eventoId, desde, hasta } = req.query as {
      eventoId?: string;
      desde?: string;
      hasta?: string;
    };

    const rango = parsearRangoFechas(desde, hasta);

    const ventas = await prisma.venta.findMany({
      where: {
        localId,
        ...(eventoId && { eventoId }),
        createdAt: { gte: rango.gte, lte: rango.lte },
      },
      select: {
        staffId: true,
        metodoPago: true,
        total: true,
        barraId: true,
        staff: { select: { nombre: true, apellido: true, rol: true } },
        barra: { select: { nombre: true } },
      },
    });

    interface FilaCajero {
      staffId: string;
      nombre: string;
      rol: string;
      barra: string | null;
      cantidadVentas: number;
      total: number;
      porMetodo: Record<string, { cantidad: number; monto: number }>;
    }

    const porCajero = new Map<string, FilaCajero>();

    for (const v of ventas) {
      let fila = porCajero.get(v.staffId);
      if (!fila) {
        fila = {
          staffId: v.staffId,
          nombre: `${v.staff.nombre} ${v.staff.apellido}`,
          rol: v.staff.rol,
          barra: v.barra?.nombre ?? null,
          cantidadVentas: 0,
          total: 0,
          porMetodo: {},
        };
        porCajero.set(v.staffId, fila);
      }

      const monto = Number(v.total);
      fila.cantidadVentas += 1;
      fila.total += monto;

      const metodo = (fila.porMetodo[v.metodoPago] ??= { cantidad: 0, monto: 0 });
      metodo.cantidad += 1;
      metodo.monto += monto;
    }

    const cajeros = [...porCajero.values()].sort((a, b) => b.total - a.total);

    return {
      cajeros,
      totalGeneral: cajeros.reduce((sum, c) => sum + c.total, 0),
      desde: rango.gte.toISOString(),
      hasta: rango.lte.toISOString(),
    };
  });

  // ══════════════════════════════════════════════════════════════
  // RESUMEN DE KPIs
  // ══════════════════════════════════════════════════════════════

  app.get("/resumen", async (req, reply) => {
    if (!(await soloGerencia(req, reply))) return;
    const { localId } = req;
    const { fechaDesde, fechaHasta, eventoId } = req.query as {
      fechaDesde?: string;
      fechaHasta?: string;
      eventoId?: string;
    };

    const rango = parsearRangoFechas(fechaDesde, fechaHasta);
    const filtroFecha = { gte: rango.gte, lte: rango.lte };
    const filtroEvento = eventoId ? { eventoId } : {};

    // ── Ventas caja ───────────────────────────────────────────
    const [ventasPorMetodo, totalVentasAgregado] = await Promise.all([
      prisma.venta.groupBy({
        by: ["metodoPago"],
        where: { localId, createdAt: filtroFecha, ...filtroEvento },
        _sum: { total: true },
        _count: { id: true },
      }),
      prisma.venta.aggregate({
        where: { localId, createdAt: filtroFecha, ...filtroEvento },
        _sum: { total: true, descuento: true },
        _count: { id: true },
      }),
    ]);

    // ── Recargas cashless ─────────────────────────────────────
    const recargasAgregado = await prisma.recarga.aggregate({
      where: { localId, createdAt: filtroFecha },
      _sum: { monto: true },
      _count: { id: true },
    });

    // ── Accesos portería ──────────────────────────────────────
    const accesosAgregado = await prisma.acceso.groupBy({
      by: ["tipo"],
      where: { localId, createdAt: filtroFecha, ...filtroEvento },
      _count: { id: true },
    });

    // ── Entradas vendidas ─────────────────────────────────────
    const entradasAgregado = await prisma.entradaVendida.aggregate({
      where: { localId, createdAt: filtroFecha, ...filtroEvento },
      _sum: { precioPagado: true },
      _count: { id: true },
    });

    const entradasUsadas = await prisma.entradaVendida.count({
      where: { localId, createdAt: filtroFecha, ...filtroEvento, usada: true },
    });

    // ── Construir respuesta ───────────────────────────────────
    const ventasMap: Record<string, { monto: number; cantidad: number }> = {};
    for (const g of ventasPorMetodo) {
      ventasMap[g.metodoPago] = {
        monto: Number(g._sum.total ?? 0),
        cantidad: g._count.id,
      };
    }

    const ingresosBrutos =
      Number(totalVentasAgregado._sum.total ?? 0) +
      Number(entradasAgregado._sum.precioPagado ?? 0);

    const accesoIngreso = accesosAgregado.find((a) => a.tipo === "ingreso")?._count.id ?? 0;
    const accesoEgreso = accesosAgregado.find((a) => a.tipo === "egreso")?._count.id ?? 0;

    return {
      periodo: { desde: rango.gte, hasta: rango.lte },
      ventas: {
        total: Number(totalVentasAgregado._sum.total ?? 0),
        cantidad: totalVentasAgregado._count.id,
        descuentos: Number(totalVentasAgregado._sum.descuento ?? 0),
        porMetodo: {
          efectivo:  ventasMap["efectivo"]  ?? { monto: 0, cantidad: 0 },
          tarjeta:   ventasMap["tarjeta"]   ?? { monto: 0, cantidad: 0 },
          cashless:  ventasMap["cashless"]  ?? { monto: 0, cantidad: 0 },
          qr_mp:     ventasMap["qr_mp"]     ?? { monto: 0, cantidad: 0 },
          cortesia:  ventasMap["cortesia"]  ?? { monto: 0, cantidad: 0 },
        },
      },
      recargas: {
        total: Number(recargasAgregado._sum.monto ?? 0),
        cantidad: recargasAgregado._count.id,
      },
      entradas: {
        total: Number(entradasAgregado._sum.precioPagado ?? 0),
        cantidad: entradasAgregado._count.id,
        usadas: entradasUsadas,
      },
      accesos: {
        ingresos: accesoIngreso,
        egresos: accesoEgreso,
        aforoActual: accesoIngreso - accesoEgreso,
      },
      ingresosBrutos,
    };
  });

  // ══════════════════════════════════════════════════════════════
  // LISTADO DE VENTAS
  // ══════════════════════════════════════════════════════════════

  app.get("/ventas", async (req, reply) => {
    if (!(await soloGerencia(req, reply))) return;
    const { localId } = req;
    const {
      fechaDesde, fechaHasta, barraId, metodoPago, page, limit,
    } = req.query as {
      fechaDesde?: string;
      fechaHasta?: string;
      barraId?: string;
      metodoPago?: string;
      page?: string;
      limit?: string;
    };

    const rango = parsearRangoFechas(fechaDesde, fechaHasta);
    const skip = (Number(page ?? 1) - 1) * Number(limit ?? 50);
    const take = Math.min(Number(limit ?? 50), 200);

    const where = {
      localId,
      createdAt: { gte: rango.gte, lte: rango.lte },
      ...(barraId && { barraId }),
      ...(metodoPago && { metodoPago: metodoPago as never }),
    };

    const [ventas, total] = await Promise.all([
      prisma.venta.findMany({
        where,
        include: {
          items: {
            include: { producto: { select: { nombre: true, categoria: true } } },
          },
          barra: { select: { nombre: true } },
          staff: { select: { nombre: true, apellido: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.venta.count({ where }),
    ]);

    return {
      ventas: ventas.map((v) => ({
        ...v,
        total: Number(v.total),
        descuento: Number(v.descuento),
        items: v.items.map((i) => ({
          ...i,
          precioUnitario: Number(i.precioUnitario),
          subtotal: Number(i.subtotal),
        })),
      })),
      total,
      paginas: Math.ceil(total / take),
    };
  });

  // ══════════════════════════════════════════════════════════════
  // TOP PRODUCTOS
  // ══════════════════════════════════════════════════════════════

  app.get("/productos-top", async (req, reply) => {
    if (!(await soloGerencia(req, reply))) return;
    const { localId } = req;
    const { fechaDesde, fechaHasta, limit } = req.query as {
      fechaDesde?: string;
      fechaHasta?: string;
      limit?: string;
    };

    const rango = parsearRangoFechas(fechaDesde, fechaHasta);
    const top = Math.min(Number(limit ?? 10), 50);

    // Raw query para GROUP BY con JOIN a producto
    const resultado = await prisma.ventaItem.groupBy({
      by: ["productoId"],
      where: {
        local: { id: localId },
        venta: { createdAt: { gte: rango.gte, lte: rango.lte } },
      },
      _sum: { cantidad: true, subtotal: true },
      _count: { id: true },
      orderBy: { _sum: { subtotal: "desc" } },
      take: top,
    });

    // Enriquecer con nombre del producto
    const productoIds = resultado.map((r) => r.productoId);
    const productos = await prisma.producto.findMany({
      where: { id: { in: productoIds } },
      select: { id: true, nombre: true, categoria: true },
    });
    const productoMap = Object.fromEntries(productos.map((p) => [p.id, p]));

    return {
      productos: resultado.map((r) => ({
        productoId: r.productoId,
        nombre: productoMap[r.productoId]?.nombre ?? "Desconocido",
        categoria: productoMap[r.productoId]?.categoria ?? null,
        cantidadVendida: r._sum.cantidad ?? 0,
        montoTotal: Number(r._sum.subtotal ?? 0),
        cantidadVentas: r._count.id,
      })),
    };
  });

  // ══════════════════════════════════════════════════════════════
  // VENTAS POR HORA (para gráfico de barras)
  // ══════════════════════════════════════════════════════════════

  app.get("/ventas-por-hora", async (req, reply) => {
    if (!(await soloGerencia(req, reply))) return;
    const { localId } = req;
    const { fechaDesde, fechaHasta } = req.query as {
      fechaDesde?: string;
      fechaHasta?: string;
    };

    const rango = parsearRangoFechas(fechaDesde, fechaHasta);

    // Agrupar ventas por hora del día (hora ART = hora UTC - 3)
    const ventas = await prisma.$queryRaw<
      { hora: number; total: number; cantidad: number }[]
    >`
      SELECT
        EXTRACT(HOUR FROM ("created_at" AT TIME ZONE 'America/Argentina/Buenos_Aires'))::int AS hora,
        SUM(total)::float AS total,
        COUNT(*)::int AS cantidad
      FROM ventas
      WHERE local_id = ${localId}
        AND created_at >= ${rango.gte}
        AND created_at <= ${rango.lte}
      GROUP BY hora
      ORDER BY hora
    `;

    // Completar las 24 horas con 0 donde no hubo ventas
    const mapa = Object.fromEntries(ventas.map((v) => [v.hora, v]));
    const porHora = Array.from({ length: 24 }, (_, h) => ({
      hora: h,
      total: mapa[h]?.total ?? 0,
      cantidad: mapa[h]?.cantidad ?? 0,
    }));

    return { porHora };
  });

  // ══════════════════════════════════════════════════════════════
  // CORTES DE CAJA
  // ══════════════════════════════════════════════════════════════

  // GET /api/reportes/cortes
  app.get("/cortes", async (req, reply) => {
    if (!(await soloGerencia(req, reply))) return;
    const { localId } = req;
    const { barraId, eventoId } = req.query as { barraId?: string; eventoId?: string };

    const cortes = await prisma.corteCaja.findMany({
      where: {
        localId,
        ...(barraId && { barraId }),
        ...(eventoId && { eventoId }),
      },
      include: {
        staff: { select: { nombre: true, apellido: true } },
        barra: { select: { nombre: true } },
        evento: { select: { nombre: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return {
      cortes: cortes.map((c) => ({
        ...c,
        efectivoEsperado: Number(c.efectivoEsperado),
        efectivoReal: c.efectivoReal ? Number(c.efectivoReal) : null,
        diferencia: c.diferencia ? Number(c.diferencia) : null,
        ventasEfectivo: Number(c.ventasEfectivo),
        ventasTarjeta: Number(c.ventasTarjeta),
        ventasCashless: Number(c.ventasCashless),
        ventasQr: Number(c.ventasQr),
        ventasCortesia: Number(c.ventasCortesia),
        totalVentas: Number(c.totalVentas),
      })),
    };
  });

  // POST /api/reportes/cortes — crear corte (calcula totales automáticamente)
  app.post("/cortes", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!["admin", "encargado", "cajero"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos para crear corte de caja" });
    }

    const body = z.object({
      barraId: z.string().uuid().nullable().optional(),
      eventoId: z.string().uuid().nullable().optional(),
      fechaDesde: z.string().optional(),
      fechaHasta: z.string().optional(),
      nota: z.string().max(500).optional(),
    }).safeParse(req.body);

    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const rango = parsearRangoFechas(body.data.fechaDesde, body.data.fechaHasta);

    const filtroBase = {
      localId,
      createdAt: { gte: rango.gte, lte: rango.lte },
      ...(body.data.barraId ? { barraId: body.data.barraId } : {}),
      ...(body.data.eventoId ? { eventoId: body.data.eventoId } : {}),
    };

    // Calcular totales desde las ventas del período
    const ventasPorMetodo = await prisma.venta.groupBy({
      by: ["metodoPago"],
      where: filtroBase,
      _sum: { total: true },
    });

    const ventasMap: Record<string, number> = {};
    let totalVentas = 0;
    for (const g of ventasPorMetodo) {
      const monto = Number(g._sum.total ?? 0);
      ventasMap[g.metodoPago] = monto;
      totalVentas += monto;
    }

    const efectivoEsperado = ventasMap["efectivo"] ?? 0;

    const corte = await prisma.corteCaja.create({
      data: {
        localId,
        staffId: staffActual.id,
        barraId: body.data.barraId ?? null,
        eventoId: body.data.eventoId ?? null,
        ventasEfectivo: efectivoEsperado,
        ventasTarjeta: ventasMap["tarjeta"] ?? 0,
        ventasCashless: ventasMap["cashless"] ?? 0,
        ventasQr: ventasMap["qr_mp"] ?? 0,
        ventasCortesia: ventasMap["cortesia"] ?? 0,
        totalVentas,
        efectivoEsperado,
        nota: body.data.nota ?? null,
      },
      include: {
        staff: { select: { nombre: true, apellido: true } },
        barra: { select: { nombre: true } },
      },
    });

    return reply.status(201).send({
      corte: {
        ...corte,
        efectivoEsperado: Number(corte.efectivoEsperado),
        efectivoReal: null,
        diferencia: null,
        ventasEfectivo: Number(corte.ventasEfectivo),
        ventasTarjeta: Number(corte.ventasTarjeta),
        ventasCashless: Number(corte.ventasCashless),
        ventasQr: Number(corte.ventasQr),
        ventasCortesia: Number(corte.ventasCortesia),
        totalVentas: Number(corte.totalVentas),
      },
    });
  });

  // PATCH /api/reportes/cortes/:id/cerrar — declarar efectivo real
  /**
   * Cerrar el corte es declarar cuánto efectivo hay realmente en la caja, y de
   * ahí sale la diferencia contra lo esperado. Lo hace gerencia, no quien
   * estuvo cobrando: es el control cruzado que evita que un faltante se tape
   * declarando el número que cierra.
   */
  app.patch("/cortes/:id/cerrar", async (req, reply) => {
    if (!(await soloGerencia(req, reply))) return;

    const { localId } = req;
    const { id } = req.params as { id: string };

    const body = z.object({
      efectivoReal: z.number().nonnegative(),
      nota: z.string().max(500).optional(),
    }).safeParse(req.body);

    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const corteExistente = await prisma.corteCaja.findUnique({ where: { id, localId } });
    if (!corteExistente) {
      return reply.status(404).send({ error: "Corte no encontrado" });
    }
    if (corteExistente.cerradoAt) {
      return reply.status(409).send({ error: "El corte ya fue cerrado" });
    }

    const diferencia = body.data.efectivoReal - Number(corteExistente.efectivoEsperado);

    const corte = await prisma.corteCaja.update({
      where: { id },
      data: {
        efectivoReal: body.data.efectivoReal,
        diferencia,
        cerradoAt: new Date(),
        ...(body.data.nota !== undefined && { nota: body.data.nota }),
      },
      include: {
        staff: { select: { nombre: true, apellido: true } },
        barra: { select: { nombre: true } },
      },
    });

    return {
      corte: {
        ...corte,
        efectivoEsperado: Number(corte.efectivoEsperado),
        efectivoReal: Number(corte.efectivoReal),
        diferencia: Number(corte.diferencia),
        ventasEfectivo: Number(corte.ventasEfectivo),
        ventasTarjeta: Number(corte.ventasTarjeta),
        ventasCashless: Number(corte.ventasCashless),
        ventasQr: Number(corte.ventasQr),
        ventasCortesia: Number(corte.ventasCortesia),
        totalVentas: Number(corte.totalVentas),
      },
    };
  });
};

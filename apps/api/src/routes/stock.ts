/**
 * Stock — depósitos, nivel de stock y movimientos.
 * Prefix: /api/stock
 *
 * Depósitos:
 *   GET    /depositos              — listar depósitos del local
 *   POST   /depositos              — crear depósito
 *
 * Nivel de stock:
 *   GET    /nivel?depositoId=      — stock actual por producto (sum de movimientos)
 *   GET    /alertas?depositoId=    — productos bajo su stockMinimo
 *
 * Movimientos:
 *   GET    /movimientos?productoId=&depositoId=&tipo=&fechaDesde=
 *   POST   /movimientos            — registrar movimiento manual
 *
 * Productos (solo lo referente a stock):
 *   PATCH  /productos/:id          — actualizar stockMinimo (y campos de producto)
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma, Prisma } from "@niagara/db";

interface FilaStock {
  producto_id: string;
  deposito_id: string;
  stock: number;
}

/**
 * Stock actual por (producto, depósito), calculado sumando los movimientos.
 *
 *   ingreso → +cantidad · egreso_* → -cantidad · ajuste → +cantidad (firmado)
 *
 * `transferencia` se ignora a propósito: hoy se guarda como un movimiento
 * suelto que no dice de qué depósito sale ni a cuál entra, así que sumarla
 * duplicaría mercadería. Cuando se registre como par egreso+ingreso, entra acá.
 *
 * Se llama `$queryRaw(Prisma.sql\`…\`)` en vez de usar el template etiquetado
 * directo porque el filtro de depósito es un fragmento de SQL variable. En el
 * template etiquetado cada `${}` se manda como parámetro, no como SQL, así que
 * componer ahí adentro es justamente lo que rompe la consulta.
 */
async function sumarStock(localId: string, depositoId?: string): Promise<FilaStock[]> {
  const filtroDeposito = depositoId
    ? Prisma.sql`AND deposito_id = ${depositoId}`
    : Prisma.empty;

  return prisma.$queryRaw<FilaStock[]>(Prisma.sql`
    SELECT
      producto_id,
      deposito_id,
      SUM(
        CASE
          WHEN tipo = 'ingreso'      THEN cantidad
          WHEN tipo = 'egreso_venta' THEN -cantidad
          WHEN tipo = 'egreso_merma' THEN -cantidad
          WHEN tipo = 'ajuste'       THEN cantidad
          ELSE 0
        END
      )::float AS stock
    FROM stock_movimientos
    WHERE local_id = ${localId}
    ${filtroDeposito}
    GROUP BY producto_id, deposito_id
  `);
}

export const registrarRutasStock: FastifyPluginAsync = async (app) => {

  // ══════════════════════════════════════════════════════════════
  // DEPÓSITOS
  // ══════════════════════════════════════════════════════════════

  app.get("/depositos", async (req) => {
    const { localId } = req;
    const depositos = await prisma.deposito.findMany({
      where: { localId },
      orderBy: [{ esPrincipal: "desc" }, { nombre: "asc" }],
    });
    return { depositos };
  });

  app.post("/depositos", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!["admin", "encargado"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const body = z.object({
      nombre: z.string().min(1).max(100),
      esPrincipal: z.boolean().optional().default(false),
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const deposito = await prisma.deposito.create({
      data: { localId, nombre: body.data.nombre, esPrincipal: body.data.esPrincipal },
    });
    return reply.status(201).send({ deposito });
  });

  /**
   * DELETE /api/stock/depositos/:id
   *
   * Solo si está vacío de historia. Un depósito con movimientos es de dónde
   * salió y entró la mercadería: borrarlo dejaría los movimientos apuntando a
   * un lugar que no existe y el stock calculado dejaría de cuadrar.
   */
  app.delete("/depositos/:id", async (req, reply) => {
    const { localId, staffActual } = req;
    const { id } = req.params as { id: string };

    if (staffActual.rol !== "admin") {
      return reply.status(403).send({ error: "Solo el admin puede eliminar depósitos" });
    }

    const deposito = await prisma.deposito.findFirst({
      where: { id, localId },
      include: { _count: { select: { stockMovimientos: true } } },
    });

    if (!deposito) return reply.status(404).send({ error: "Depósito no encontrado" });

    if (deposito._count.stockMovimientos > 0) {
      return reply.status(409).send({
        error:
          `“${deposito.nombre}” tiene ${deposito._count.stockMovimientos} movimiento(s) ` +
          "registrados y no se puede eliminar sin romper el cálculo de stock.",
      });
    }

    await prisma.deposito.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ══════════════════════════════════════════════════════════════
  // NIVEL DE STOCK
  // ══════════════════════════════════════════════════════════════

  app.get("/nivel", async (req) => {
    const { localId } = req;
    const { depositoId } = req.query as { depositoId?: string };

    const stockRows = await sumarStock(localId, depositoId);

    // Obtener todos los productos activos
    const productos = await prisma.producto.findMany({
      where: { localId, activo: true },
      select: { id: true, nombre: true, categoria: true, precio: true, costo: true, stockMinimo: true },
      orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
    });

    // Obtener depósitos para join
    const depositos = await prisma.deposito.findMany({
      where: { localId },
      select: { id: true, nombre: true, esPrincipal: true },
    });
    const depositoMap = Object.fromEntries(depositos.map((d) => [d.id, d]));

    // Construir índice de stock: productoId → Map<depositoId, stock>
    const stockIndex = new Map<string, Map<string, number>>();
    for (const row of stockRows) {
      let porDeposito = stockIndex.get(row.producto_id);
      if (!porDeposito) {
        porDeposito = new Map<string, number>();
        stockIndex.set(row.producto_id, porDeposito);
      }
      porDeposito.set(row.deposito_id, row.stock);
    }

    // Armar respuesta
    const resultado = productos.map((p) => {
      const porDeposito = stockIndex.get(p.id) ?? new Map<string, number>();
      const stockTotal = [...porDeposito.values()].reduce((a, b) => a + b, 0);
      const bajoMinimo = p.stockMinimo !== null && stockTotal <= p.stockMinimo;

      return {
        ...p,
        precio: Number(p.precio),
        costo: p.costo ? Number(p.costo) : null,
        stockTotal,
        bajoMinimo,
        porDeposito: [...porDeposito.entries()].map(([dId, stock]) => ({
          depositoId: dId,
          depositoNombre: depositoMap[dId]?.nombre ?? "Desconocido",
          esPrincipal: depositoMap[dId]?.esPrincipal ?? false,
          stock,
        })),
      };
    });

    return { productos: resultado, depositos };
  });

  // GET /api/stock/alertas — productos bajo stockMinimo
  app.get("/alertas", async (req) => {
    const { localId } = req;

    // El helper agrupa por (producto, depósito); acá el depósito no importa,
    // así que se suman los depósitos de cada producto.
    const stockRows = await sumarStock(localId);

    const stockMap = new Map<string, number>();
    for (const fila of stockRows) {
      stockMap.set(fila.producto_id, (stockMap.get(fila.producto_id) ?? 0) + fila.stock);
    }

    const productos = await prisma.producto.findMany({
      where: { localId, activo: true, stockMinimo: { not: null } },
      select: { id: true, nombre: true, categoria: true, stockMinimo: true },
    });

    const alertas = productos
      .filter((p) => {
        const stock = stockMap.get(p.id) ?? 0;
        return p.stockMinimo !== null && stock <= p.stockMinimo;
      })
      .map((p) => ({
        ...p,
        stockActual: stockMap.get(p.id) ?? 0,
      }));

    return { alertas, total: alertas.length };
  });

  // ══════════════════════════════════════════════════════════════
  // MOVIMIENTOS
  // ══════════════════════════════════════════════════════════════

  app.get("/movimientos", async (req) => {
    const { localId } = req;
    const { productoId, depositoId, tipo, fechaDesde, fechaHasta, page, limit } = req.query as {
      productoId?: string;
      depositoId?: string;
      tipo?: string;
      fechaDesde?: string;
      fechaHasta?: string;
      page?: string;
      limit?: string;
    };

    const skip = (Number(page ?? 1) - 1) * Number(limit ?? 50);
    const take = Math.min(Number(limit ?? 50), 200);

    const where = {
      localId,
      ...(productoId && { productoId }),
      ...(depositoId && { depositoId }),
      ...(tipo && { tipo: tipo as never }),
      // Se arman con spread condicional en vez de `: undefined`: pasarle
      // `undefined` explícito a un filtro de Prisma no es lo mismo que omitirlo.
      ...(fechaDesde || fechaHasta
        ? {
            createdAt: {
              ...(fechaDesde && { gte: new Date(fechaDesde) }),
              ...(fechaHasta && { lte: new Date(fechaHasta) }),
            },
          }
        : {}),
    };

    const [movimientos, total] = await Promise.all([
      prisma.stockMovimiento.findMany({
        where,
        include: {
          producto: { select: { nombre: true, categoria: true } },
          deposito: { select: { nombre: true } },
          staff: { select: { nombre: true, apellido: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.stockMovimiento.count({ where }),
    ]);

    return {
      movimientos: movimientos.map((m) => ({
        ...m,
        cantidad: Number(m.cantidad),
        cantidadAnterior: Number(m.cantidadAnterior),
      })),
      total,
    };
  });

  app.post("/movimientos", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!["admin", "encargado", "barman"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos para registrar movimientos de stock" });
    }

    const body = z.object({
      depositoId: z.string().uuid(),
      productoId: z.string().uuid(),
      tipo: z.enum(["ingreso", "egreso_merma", "ajuste"]),
      cantidad: z.number(), // positivo para ingreso/ajuste positivo, puede ser negativo para ajuste
      motivo: z.string().max(300).optional(),
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    // Verificar que el depósito y producto pertenezcan al local
    const [deposito, producto] = await Promise.all([
      prisma.deposito.findUnique({ where: { id: body.data.depositoId, localId } }),
      prisma.producto.findUnique({ where: { id: body.data.productoId, localId } }),
    ]);
    if (!deposito) return reply.status(404).send({ error: "Depósito no encontrado" });
    if (!producto) return reply.status(404).send({ error: "Producto no encontrado" });

    // Calcular stock anterior
    const stockActualRows = await prisma.$queryRaw<{ stock: number }[]>`
      SELECT SUM(
        CASE
          WHEN tipo = 'ingreso'      THEN cantidad
          WHEN tipo = 'egreso_venta' THEN -cantidad
          WHEN tipo = 'egreso_merma' THEN -cantidad
          WHEN tipo = 'ajuste'       THEN cantidad
          ELSE 0
        END
      )::float AS stock
      FROM stock_movimientos
      WHERE local_id = ${localId}
        AND producto_id::text = ${body.data.productoId}
        AND deposito_id::text = ${body.data.depositoId}
    `;
    const cantidadAnterior = stockActualRows[0]?.stock ?? 0;

    const movimiento = await prisma.stockMovimiento.create({
      data: {
        localId,
        depositoId: body.data.depositoId,
        productoId: body.data.productoId,
        tipo: body.data.tipo,
        cantidad: body.data.cantidad,
        cantidadAnterior,
        motivo: body.data.motivo ?? null,
        staffId: staffActual.id,
        synced: "synced",
      },
      include: {
        producto: { select: { nombre: true } },
        deposito: { select: { nombre: true } },
      },
    });

    return reply.status(201).send({
      movimiento: {
        ...movimiento,
        cantidad: Number(movimiento.cantidad),
        cantidadAnterior: Number(movimiento.cantidadAnterior),
      },
    });
  });

  // ══════════════════════════════════════════════════════════════
  // PRODUCTOS (solo campos de stock)
  // ══════════════════════════════════════════════════════════════

  app.patch("/productos/:id", async (req, reply) => {
    const { localId, staffActual } = req;
    const { id } = req.params as { id: string };

    if (!["admin", "encargado"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const body = z.object({
      nombre: z.string().min(1).max(200).optional(),
      descripcion: z.string().max(500).nullable().optional(),
      categoria: z.string().min(1).max(100).optional(),
      precio: z.number().positive().optional(),
      costo: z.number().nonnegative().nullable().optional(),
      stockMinimo: z.number().int().nonnegative().nullable().optional(),
      activo: z.boolean().optional(),
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const producto = await prisma.producto.update({
      where: { id, localId },
      data: {
        ...(body.data.nombre !== undefined && { nombre: body.data.nombre }),
        ...(body.data.descripcion !== undefined && { descripcion: body.data.descripcion }),
        ...(body.data.categoria !== undefined && { categoria: body.data.categoria }),
        ...(body.data.precio !== undefined && { precio: body.data.precio }),
        ...(body.data.costo !== undefined && { costo: body.data.costo }),
        ...(body.data.stockMinimo !== undefined && { stockMinimo: body.data.stockMinimo }),
        ...(body.data.activo !== undefined && { activo: body.data.activo }),
      },
    });

    return {
      producto: {
        ...producto,
        precio: Number(producto.precio),
        costo: producto.costo ? Number(producto.costo) : null,
      },
    };
  });
};

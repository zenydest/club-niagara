/**
 * Rutas de barras (puntos de venta dentro del local).
 * El POS las carga al iniciar para que el cajero elija en cuál está.
 * Prefix: /api/barras
 */

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@niagara/db";

export const registrarRutasBarras: FastifyPluginAsync = async (app) => {
  // GET /api/barras — lista de barras activas del local
  app.get("/", async (req) => {
    const { localId } = req;

    const barras = await prisma.barra.findMany({
      where: { localId, activo: true },
      orderBy: { nombre: "asc" },
    });

    return { barras };
  });
};

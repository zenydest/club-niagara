/**
 * Cliente Prisma singleton para Club Niágara.
 *
 * Uso en apps server-side (API):
 *   import { prisma } from "@niagara/db"
 *
 * Variable de entorno requerida:
 *   DATABASE_URL — connection string de Render PostgreSQL
 *
 * En el cliente (web/pos) NO se importa Prisma directamente;
 * todo pasa por la API REST o Socket.io.
 */

import { PrismaClient } from "@prisma/client";

// Patrón singleton para evitar conexiones duplicadas en dev con HMR
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env["NODE_ENV"] === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}

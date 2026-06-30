/**
 * Configuración de Better Auth para Club Niágara.
 *
 * Docs: https://better-auth.com
 * Adapter: Prisma
 *
 * Variables de entorno requeridas:
 *   BETTER_AUTH_SECRET  — string aleatorio largo (mínimo 32 chars)
 *   BETTER_AUTH_URL     — URL base del API (ej: https://api.clubniagara.com)
 *   DATABASE_URL        — ya usada por Prisma
 */

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@niagara/db";

export const auth = betterAuth({
  // Adapter Prisma — usa las tablas User, Session, Account, Verification
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  // URL base del API (para generar links de verificación de email, etc.)
  baseURL: process.env["BETTER_AUTH_URL"] ?? "http://localhost:3001",
  secret: process.env["BETTER_AUTH_SECRET"] ?? "dev-secret-cambiar-en-produccion",

  // Autenticación con email/password
  emailAndPassword: {
    enabled: true,
    // No registramos usuarios públicamente — solo el admin crea staff desde el panel
    autoSignIn: true,
  },

  // Sesión — cookie httpOnly para web, también permite header Bearer para móvil/POS
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 días
    updateAge: 60 * 60 * 24,     // renovar si usó en las últimas 24hs
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // cache en cookie por 5 minutos
    },
  },

  // No exponemos registro público
  user: {
    additionalFields: {
      // No hay campos adicionales por ahora — el Staff se maneja en su propia tabla
    },
  },

  // Trusted origins para CORS
  trustedOrigins: (process.env["FRONTEND_URLS"] ?? "http://localhost:5173").split(","),
});

/** Tipo de sesión inferido de Better Auth */
export type Session = typeof auth.$Infer.Session;
export type AuthUser = typeof auth.$Infer.Session.user;

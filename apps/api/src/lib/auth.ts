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

const SECRETO_DEV = "dev-secret-cambiar-en-produccion";

/**
 * El secreto firma las cookies de sesión. Con el valor de desarrollo —que está
 * en el repo y es público— cualquiera puede fabricar una sesión válida y
 * entrar como admin.
 *
 * Antes esto caía en el default en silencio: si alguien se olvidaba de cargar
 * la variable en Render, la API arrancaba igual y parecía funcionar. Ahora
 * revienta al arrancar, que es la única forma de que no pase inadvertido.
 */
function resolverSecreto(): string {
  const secreto = process.env["BETTER_AUTH_SECRET"];

  if (process.env["NODE_ENV"] === "production" && (!secreto || secreto === SECRETO_DEV)) {
    throw new Error(
      "BETTER_AUTH_SECRET no está configurado. En producción es obligatorio: " +
        "sin él las sesiones se firman con un secreto público. " +
        "Generá uno con: openssl rand -base64 32"
    );
  }

  return secreto ?? SECRETO_DEV;
}

export const auth = betterAuth({
  // Adapter Prisma — usa las tablas User, Session, Account, Verification
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  // URL base del API (para generar links de verificación de email, etc.)
  baseURL: process.env["BETTER_AUTH_URL"] ?? "http://localhost:3001",
  secret: resolverSecreto(),

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

  // Cookies cross-origin: Vercel (frontend) → Render (API) son dominios distintos.
  // SameSite=None;Secure permite que el browser envíe la cookie en requests cross-site.
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      httpOnly: true,
      path: "/",
    },
  },
});

/** Tipo de sesión inferido de Better Auth */
export type Session = typeof auth.$Infer.Session;
export type AuthUser = typeof auth.$Infer.Session.user;

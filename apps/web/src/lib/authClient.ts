/**
 * Cliente de Better Auth para el panel web.
 *
 * Variable de entorno requerida:
 *   VITE_API_URL — URL del backend Fastify (ej: https://api.clubniagara.com)
 */

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env["VITE_API_URL"] ?? "http://localhost:3001",
});

export type { Session } from "better-auth";

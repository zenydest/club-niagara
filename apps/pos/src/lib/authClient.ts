/**
 * Cliente Better Auth para el POS de Club Niágara.
 *
 * Variable de entorno requerida:
 *   VITE_API_URL — URL del backend Fastify
 */

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env["VITE_API_URL"] ?? "http://localhost:3001",
});

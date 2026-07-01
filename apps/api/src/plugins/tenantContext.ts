/**
 * Plugin de contexto de tenant para Club Niágara.
 */

import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { prisma } from "@niagara/db";
import type { Staff } from "@niagara/db";
import { auth } from "../lib/auth.js";

declare module "fastify" {
  interface FastifyRequest {
    localId: string;
    staffActual: Staff;
    userId: string;
  }
}

const RUTAS_PUBLICAS = ["/health", "/api/auth/", "/api/me"];

/** Convierte IncomingHttpHeaders de Node.js a Web API Headers */
function toWebHeaders(incoming: Record<string, string | string[] | undefined>): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined) {
      headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
  }
  return headers;
}

const tenantPlugin: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (req: FastifyRequest, reply) => {
    if (RUTAS_PUBLICAS.some((r) => req.url.startsWith(r))) return;

    // Verificar sesión con Better Auth (convirtiendo headers a Web API)
    const session = await auth.api.getSession({
      headers: toWebHeaders(req.headers as Record<string, string | string[] | undefined>),
    });

    if (!session?.user) {
      return reply.status(401).send({ error: "No autenticado" });
    }

    const localId = req.headers["x-local-id"] as string | undefined;
    if (!localId) {
      return reply.status(400).send({ error: "Header x-local-id requerido" });
    }

    const local = await prisma.local.findUnique({ where: { id: localId } });
    if (!local) {
      return reply.status(404).send({ error: "Local no encontrado" });
    }

    const staff = await prisma.staff.findUnique({
      where: { localId_userId: { localId, userId: session.user.id } },
    });

    if (!staff || !staff.activo) {
      return reply.status(403).send({ error: "Sin permisos para este local" });
    }

    req.localId = localId;
    req.staffActual = staff;
    req.userId = session.user.id;
  });
};

export const tenantContextPlugin = fp(tenantPlugin, {
  name: "tenant-context",
  fastify: "4.x",
});

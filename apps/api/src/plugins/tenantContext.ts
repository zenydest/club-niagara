/**
 * Plugin de contexto de tenant para Club Niágara.
 *
 * Responsabilidades:
 *  1. Verificar que el request tenga sesión válida (Better Auth)
 *  2. Resolver el Staff del usuario para el localId indicado
 *  3. Inyectar { session, staffActual, localId } en req para que
 *     las rutas no repitan esa lógica
 *
 * Rutas excluidas: /health, /api/auth/*
 */

import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { prisma } from "@niagara/db";
import type { Staff } from "@niagara/db";
import { auth } from "../lib/auth.js";

// Extender los tipos de Fastify para agregar nuestros campos
declare module "fastify" {
  interface FastifyRequest {
    localId: string;
    staffActual: Staff;
    userId: string;
  }
}

const RUTAS_PUBLICAS = ["/health", "/api/auth/"];

const tenantContextPlugin: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (req: FastifyRequest, reply) => {
    // Saltar rutas públicas
    if (RUTAS_PUBLICAS.some((r) => req.url.startsWith(r))) return;

    // 1. Verificar sesión con Better Auth
    const session = await auth.api.getSession({ headers: req.headers as Headers });

    if (!session?.user) {
      return reply.status(401).send({ error: "No autenticado" });
    }

    // 2. Obtener localId del header (cada app envía su localId)
    const localId = req.headers["x-local-id"] as string | undefined;

    if (!localId) {
      return reply.status(400).send({ error: "Header x-local-id requerido" });
    }

    // 3. Verificar que el local existe
    const local = await prisma.local.findUnique({ where: { id: localId } });
    if (!local) {
      return reply.status(404).send({ error: "Local no encontrado" });
    }

    // 4. Verificar que el usuario tiene staff en ese local
    const staff = await prisma.staff.findUnique({
      where: {
        localId_userId: { localId, userId: session.user.id },
      },
    });

    if (!staff || !staff.activo) {
      return reply.status(403).send({ error: "Sin permisos para este local" });
    }

    // 5. Inyectar en el request
    req.localId = localId;
    req.staffActual = staff;
    req.userId = session.user.id;
  });
};

// fp() hace que el plugin no cree un scope cerrado (los hooks se aplican globalmente)
export const tenantContextPlugin = fp(tenantContextPlugin, {
  name: "tenant-context",
  fastify: "4.x",
});

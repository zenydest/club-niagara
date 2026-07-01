/**
 * Rutas de gestión de staff (crear, listar, activar/desactivar).
 * Solo accesibles por rol admin o encargado.
 * Prefix: /api/staff
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@niagara/db";
import type { RolStaff } from "@niagara/db";
import { auth } from "../lib/auth.js";

const crearStaffSchema = z.object({
  nombre: z.string().min(2),
  apellido: z.string().min(2),
  email: z.string().email(),
  rol: z.enum(["admin", "encargado", "cajero", "portero", "rrpp", "barman"]),
  password: z.string().min(8),
});

export const registrarRutasAuth: FastifyPluginAsync = async (app) => {
  // GET /api/staff/perfil — propio perfil, sin chequeo de rol ni x-local-id
  // El tenant plugin (modo bootstrap) ya resolvió el staff en req.staffActual
  app.get("/perfil", async (req) => {
    return { staff: req.staffActual };
  });

  // GET /api/staff — listar staff del local
  app.get("/", async (req, reply) => {
    const { localId } = req;

    // Solo admin y encargado pueden ver el staff completo
    if (!["admin", "encargado"].includes(req.staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const staff = await prisma.staff.findMany({
      where: { localId },
      include: { user: { select: { email: true, createdAt: true } } },
      orderBy: { nombre: "asc" },
    });

    return { staff };
  });

  // POST /api/staff — crear nuevo miembro de staff
  app.post("/", async (req, reply) => {
    const { localId } = req;

    if (req.staffActual.rol !== "admin") {
      return reply.status(403).send({ error: "Solo el admin puede crear staff" });
    }

    const body = crearStaffSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const { nombre, apellido, email, rol, password } = body.data;

    // Verificar email único
    const existente = await prisma.user.findUnique({ where: { email } });
    if (existente) {
      return reply.status(409).send({ error: "El email ya está registrado" });
    }

    // Crear usuario via Better Auth
    const userCreado = await auth.api.signUpEmail({
      body: { email, password, name: `${nombre} ${apellido}` },
    });

    if (!userCreado?.user) {
      return reply.status(500).send({ error: "Error al crear el usuario" });
    }

    // Crear staff vinculado al local
    const staff = await prisma.staff.create({
      data: {
        localId,
        userId: userCreado.user.id,
        nombre,
        apellido,
        email,
        rol: rol as RolStaff,
      },
    });

    return reply.status(201).send({ staff });
  });

  // PATCH /api/staff/:staffId — cambiar rol o activar/desactivar
  app.patch("/:staffId", async (req, reply) => {
    const { localId } = req;
    const { staffId } = req.params as { staffId: string };

    if (req.staffActual.rol !== "admin") {
      return reply.status(403).send({ error: "Solo el admin puede modificar staff" });
    }

    const schema = z.object({
      rol: z.enum(["admin", "encargado", "cajero", "portero", "rrpp", "barman"]).optional(),
      activo: z.boolean().optional(),
    });

    const body = schema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const staff = await prisma.staff.update({
      where: { id: staffId, localId },
      data: {
        ...(body.data.rol && { rol: body.data.rol as RolStaff }),
        ...(body.data.activo !== undefined && { activo: body.data.activo }),
      },
    });

    return { staff };
  });
};

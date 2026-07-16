/**
 * Cliente — App móvil del cliente final.
 * Prefix: /api/cliente
 *
 * Público (requiere x-local-id):
 *   POST  /registro      — crear cuenta + perfil de cliente
 *   POST  /login         — autenticar y devolver token de sesión
 *   GET   /eventos       — eventos activos del local
 *
 * Protegido (requiere Bearer token + x-local-id):
 *   GET   /perfil        — datos del cliente autenticado
 *   GET   /cashless      — tarjetas cashless del cliente con saldo
 *   GET   /entradas      — entradas compradas con datos QR
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "@niagara/db";
import { auth } from "../lib/auth.js";

// ── Schemas de validación ─────────────────────────────────────────

const schemaRegistro = z.object({
  nombre:   z.string().min(1),
  apellido: z.string().min(1),
  email:    z.string().email(),
  password: z.string().min(6),
  telefono: z.string().optional(),
});

const schemaLogin = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

// ── Helpers ───────────────────────────────────────────────────────

/** Lee el localId del header x-local-id. Aborta con 400 si falta. */
function getLocalId(req: FastifyRequest, reply: FastifyReply): string | null {
  const id = req.headers["x-local-id"];
  if (!id || typeof id !== "string") {
    reply.status(400).send({ error: "Header x-local-id requerido" });
    return null;
  }
  return id;
}

/** Valida el Bearer token y devuelve { userId, sessionToken }. */
async function autenticarCliente(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<{ userId: string } | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    reply.status(401).send({ error: "Token requerido" });
    return null;
  }
  const token = header.slice(7);

  const session = await prisma.session.findUnique({ where: { token } });
  if (!session || session.expiresAt < new Date()) {
    reply.status(401).send({ error: "Sesión inválida o expirada" });
    return null;
  }
  return { userId: session.userId };
}

// ── Plugin ────────────────────────────────────────────────────────

export const registrarRutasCliente: FastifyPluginAsync = async (app) => {

  // ══════════════════════════════════════════════════════════════
  // POST /api/cliente/registro
  // ══════════════════════════════════════════════════════════════
  app.post("/registro", async (req, reply) => {
    const localId = getLocalId(req, reply);
    if (!localId) return;

    const body = schemaRegistro.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Datos inválidos", detalle: body.error.flatten() });
    }
    const { nombre, apellido, email, password, telefono } = body.data;

    // Verificar que el local existe
    const local = await prisma.local.findUnique({ where: { id: localId } });
    if (!local) return reply.status(404).send({ error: "Local no encontrado" });

    // Crear usuario en Better Auth
    const respAuth = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name: `${nombre} ${apellido}`,
      },
      headers: new Headers({ "content-type": "application/json" }),
    });

    if (!respAuth.ok) {
      const err = await respAuth.json().catch(() => ({ message: "Error al registrar" })) as { message?: string };
      return reply.status(400).send({ error: err.message ?? "El email ya está registrado" });
    }

    const datosAuth = await respAuth.json() as { token: string; user: { id: string } };

    // Crear perfil de cliente
    const cliente = await prisma.cliente.create({
      data: {
        localId,
        userId: datosAuth.user.id,
        nombre,
        apellido,
        telefono,
      },
    });

    return reply.status(201).send({
      token:   datosAuth.token,
      cliente: {
        id:       cliente.id,
        nombre:   cliente.nombre,
        apellido: cliente.apellido,
        email,
        telefono: cliente.telefono,
      },
    });
  });

  // ══════════════════════════════════════════════════════════════
  // POST /api/cliente/login
  // ══════════════════════════════════════════════════════════════
  app.post("/login", async (req, reply) => {
    const localId = getLocalId(req, reply);
    if (!localId) return;

    const body = schemaLogin.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Datos inválidos" });
    }
    const { email, password } = body.data;

    // Autenticar con Better Auth
    const respAuth = await auth.api.signInEmail({
      body: { email, password },
      headers: new Headers({ "content-type": "application/json" }),
    });

    if (!respAuth.ok) {
      return reply.status(401).send({ error: "Credenciales inválidas" });
    }

    const datosAuth = await respAuth.json() as { token: string; user: { id: string } };

    // Buscar perfil de cliente en este local
    const cliente = await prisma.cliente.findUnique({
      where: {
        localId_userId: { localId, userId: datosAuth.user.id },
      },
    });

    if (!cliente) {
      return reply.status(403).send({ error: "Sin perfil en este local" });
    }

    return {
      token: datosAuth.token,
      cliente: {
        id:       cliente.id,
        nombre:   cliente.nombre,
        apellido: cliente.apellido,
        email,
        telefono: cliente.telefono,
      },
    };
  });

  // ══════════════════════════════════════════════════════════════
  // GET /api/cliente/eventos — públicos y en_vivo/preventa
  // ══════════════════════════════════════════════════════════════
  app.get("/eventos", async (req, reply) => {
    const localId = getLocalId(req, reply);
    if (!localId) return;

    const eventos = await prisma.evento.findMany({
      where: {
        localId,
        estado: { in: ["preventa", "en_vivo"] },
      },
      include: {
        entradasTipo: {
          where: { activo: true },
          orderBy: { precio: "asc" },
          select: {
            id: true,
            nombre: true,
            tipo: true,
            precio: true,
            cantidadTotal: true,
            cantidadVendida: true,
          },
        },
      },
      orderBy: { fechaInicio: "asc" },
    });

    return { eventos };
  });

  // ══════════════════════════════════════════════════════════════
  // GET /api/cliente/perfil (protegido)
  // ══════════════════════════════════════════════════════════════
  app.get("/perfil", async (req, reply) => {
    const localId = getLocalId(req, reply);
    if (!localId) return;

    const sesion = await autenticarCliente(req, reply);
    if (!sesion) return;

    const cliente = await prisma.cliente.findUnique({
      where: {
        localId_userId: { localId, userId: sesion.userId },
      },
      include: {
        user: { select: { email: true } },
        _count: {
          select: { tarjetas: true, entradas: true },
        },
      },
    });

    if (!cliente) return reply.status(404).send({ error: "Perfil no encontrado" });

    return {
      cliente: {
        id:       cliente.id,
        nombre:   cliente.nombre,
        apellido: cliente.apellido,
        email:    cliente.user.email,
        telefono: cliente.telefono,
        stats: {
          tarjetas: cliente._count.tarjetas,
          entradas: cliente._count.entradas,
        },
        creadoEn: cliente.createdAt,
      },
    };
  });

  // ══════════════════════════════════════════════════════════════
  // GET /api/cliente/cashless (protegido)
  // ══════════════════════════════════════════════════════════════
  app.get("/cashless", async (req, reply) => {
    const localId = getLocalId(req, reply);
    if (!localId) return;

    const sesion = await autenticarCliente(req, reply);
    if (!sesion) return;

    const cliente = await prisma.cliente.findUnique({
      where: { localId_userId: { localId, userId: sesion.userId } },
      select: { id: true },
    });
    if (!cliente) return reply.status(404).send({ error: "Perfil no encontrado" });

    const tarjetas = await prisma.tarjetaCashless.findMany({
      where: { localId, clienteId: cliente.id, activa: true },
      orderBy: { createdAt: "desc" },
      select: {
        id:        true,
        codigo:    true,
        saldo:     true,
        activa:    true,
        createdAt: true,
        recargas: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id:        true,
            monto:     true,
            metodoPago: true,
            createdAt: true,
          },
        },
      },
    });

    return { tarjetas };
  });

  // ══════════════════════════════════════════════════════════════
  // GET /api/cliente/entradas (protegido)
  // ══════════════════════════════════════════════════════════════
  app.get("/entradas", async (req, reply) => {
    const localId = getLocalId(req, reply);
    if (!localId) return;

    const sesion = await autenticarCliente(req, reply);
    if (!sesion) return;

    const cliente = await prisma.cliente.findUnique({
      where: { localId_userId: { localId, userId: sesion.userId } },
      select: { id: true },
    });
    if (!cliente) return reply.status(404).send({ error: "Perfil no encontrado" });

    const entradas = await prisma.entradaVendida.findMany({
      where: { localId, clienteId: cliente.id },
      orderBy: { createdAt: "desc" },
      include: {
        evento: {
          select: {
            id:          true,
            nombre:      true,
            fechaInicio: true,
            imagenUrl:   true,
            estado:      true,
          },
        },
        entradaTipo: {
          select: { nombre: true, tipo: true },
        },
      },
    });

    // El QR codifica: { tipo: "entrada", id: qrCode, localId }
    const resultado = entradas.map((e) => ({
      id:           e.id,
      qrCode:       e.qrCode,
      qrPayload:    JSON.stringify({ tipo: "entrada", id: e.qrCode, localId }),
      usada:        e.usada,
      precioPagado: e.precioPagado,
      createdAt:    e.createdAt,
      evento:       e.evento,
      tipoEntrada:  e.entradaTipo,
    }));

    return { entradas: resultado };
  });
};

/**
 * Personal — ABM de staff y comisiones RRPP.
 * Prefix: /api/personal
 *
 * Staff:
 *   GET    /                  — listar staff del local (activos e inactivos)
 *   POST   /                  — crear staff (crea user en Better Auth + registro staff)
 *   PATCH  /:id               — editar nombre, apellido, rol
 *   PATCH  /:id/estado        — activar / desactivar
 *
 * Comisiones RRPP:
 *   GET    /comisiones?eventoId=   — listar comisiones
 *   POST   /comisiones             — calcular y crear comisión para un RRPP en un evento
 *   PATCH  /comisiones/:id/pagar   — marcar comisión como pagada
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@niagara/db";
import type { RolStaff } from "@niagara/db";
import { auth } from "../lib/auth.js";

// ── Constantes ────────────────────────────────────────────────────

const ROLES_VALIDOS: RolStaff[] = ["admin", "encargado", "cajero", "portero", "rrpp", "barman"];

export const registrarRutasPersonal: FastifyPluginAsync = async (app) => {

  // ══════════════════════════════════════════════════════════════
  // STAFF
  // ══════════════════════════════════════════════════════════════

  // GET /api/personal — listar staff
  app.get("/", async (req) => {
    const { localId } = req;
    const { soloActivos } = req.query as { soloActivos?: string };

    const staff = await prisma.staff.findMany({
      where: {
        localId,
        ...(soloActivos === "true" && { activo: true }),
      },
      include: {
        user: { select: { email: true, createdAt: true } },
        _count: {
          select: {
            ventas: true,
            accesos: true,
          },
        },
      },
      orderBy: [{ activo: "desc" }, { rol: "asc" }, { nombre: "asc" }],
    });

    return { staff };
  });

  // POST /api/personal — crear staff
  app.post("/", async (req, reply) => {
    const { localId, staffActual } = req;

    if (staffActual.rol !== "admin") {
      return reply.status(403).send({ error: "Solo el admin puede crear staff" });
    }

    const body = z.object({
      email: z.string().email(),
      nombre: z.string().min(1).max(100),
      apellido: z.string().min(1).max(100),
      rol: z.enum(["admin", "encargado", "cajero", "portero", "rrpp", "barman"]),
      password: z.string().min(8).max(100),
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    // Verificar que el email no esté en uso
    const emailExistente = await prisma.user.findUnique({ where: { email: body.data.email } });
    if (emailExistente) {
      return reply.status(409).send({ error: "El email ya está registrado" });
    }

    // Crear usuario via Better Auth (para hasheo correcto de contraseña)
    let nuevoUser: { id: string };
    try {
      const resultado = await auth.api.signUpEmail({
        body: {
          email: body.data.email,
          password: body.data.password,
          name: `${body.data.nombre} ${body.data.apellido}`,
        },
        headers: new Headers({ "content-type": "application/json" }),
      });

      if (!resultado?.user) {
        return reply.status(500).send({ error: "Error al crear usuario en el sistema de auth" });
      }
      nuevoUser = resultado.user;
    } catch (err) {
      return reply.status(500).send({
        error: "Error al crear usuario",
        detalle: err instanceof Error ? err.message : String(err),
      });
    }

    // Crear registro de staff
    const staff = await prisma.staff.create({
      data: {
        localId,
        userId: nuevoUser.id,
        nombre: body.data.nombre,
        apellido: body.data.apellido,
        email: body.data.email,
        rol: body.data.rol as RolStaff,
        activo: true,
      },
      include: {
        user: { select: { email: true, createdAt: true } },
      },
    });

    return reply.status(201).send({ staff });
  });

  // PATCH /api/personal/:id — editar nombre, apellido, rol
  app.patch("/:id", async (req, reply) => {
    const { localId, staffActual } = req;
    const { id } = req.params as { id: string };

    // Solo admin puede cambiar roles; encargado puede editar datos básicos
    const esAdmin = staffActual.rol === "admin";
    const esEncargado = staffActual.rol === "encargado";
    if (!esAdmin && !esEncargado) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const body = z.object({
      nombre: z.string().min(1).max(100).optional(),
      apellido: z.string().min(1).max(100).optional(),
      rol: z.enum(["admin", "encargado", "cajero", "portero", "rrpp", "barman"]).optional(),
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    // Encargado no puede cambiar roles
    if (body.data.rol && !esAdmin) {
      return reply.status(403).send({ error: "Solo el admin puede cambiar roles" });
    }

    // No puede editar el propio rol si es el único admin
    if (body.data.rol && id === staffActual.id) {
      const cantAdmins = await prisma.staff.count({
        where: { localId, rol: "admin", activo: true },
      });
      if (cantAdmins <= 1 && body.data.rol !== "admin") {
        return reply.status(422).send({ error: "No podés cambiar el rol del único admin" });
      }
    }

    const staff = await prisma.staff.update({
      where: { id, localId },
      data: {
        ...(body.data.nombre && { nombre: body.data.nombre }),
        ...(body.data.apellido && { apellido: body.data.apellido }),
        ...(body.data.rol && { rol: body.data.rol as RolStaff }),
      },
      include: { user: { select: { email: true } } },
    });

    return { staff };
  });

  // PATCH /api/personal/:id/estado — activar / desactivar
  app.patch("/:id/estado", async (req, reply) => {
    const { localId, staffActual } = req;
    const { id } = req.params as { id: string };

    if (staffActual.rol !== "admin") {
      return reply.status(403).send({ error: "Solo el admin puede activar/desactivar staff" });
    }

    // No puede desactivarse a sí mismo
    if (id === staffActual.id) {
      return reply.status(422).send({ error: "No podés desactivar tu propia cuenta" });
    }

    const body = z.object({ activo: z.boolean() }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const staff = await prisma.staff.update({
      where: { id, localId },
      data: { activo: body.data.activo },
    });

    return { staff };
  });

  // ══════════════════════════════════════════════════════════════
  // COMISIONES RRPP
  // ══════════════════════════════════════════════════════════════

  // GET /api/personal/comisiones?eventoId=&staffId=&pagada=
  app.get("/comisiones", async (req) => {
    const { localId } = req;
    const { eventoId, staffId, pagada } = req.query as {
      eventoId?: string;
      staffId?: string;
      pagada?: string;
    };

    const comisiones = await prisma.comisionRrpp.findMany({
      where: {
        localId,
        ...(eventoId && { eventoId }),
        ...(staffId && { staffId }),
        ...(pagada !== undefined && { pagada: pagada === "true" }),
      },
      include: {
        staff: { select: { nombre: true, apellido: true, rol: true } },
        evento: { select: { nombre: true, fechaInicio: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      comisiones: comisiones.map((c) => ({
        ...c,
        montoTotalVentas: Number(c.montoTotalVentas),
        porcentajeComision: Number(c.porcentajeComision),
        montoComision: Number(c.montoComision),
      })),
    };
  });

  // POST /api/personal/comisiones — calcular comisión para RRPP en evento
  app.post("/comisiones", async (req, reply) => {
    const { localId, staffActual } = req;

    if (!["admin", "encargado"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const body = z.object({
      staffId: z.string().uuid(),
      eventoId: z.string().uuid(),
      porcentajeComision: z.number().min(0).max(100),
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    // Verificar que el staff sea RRPP del local
    const staffRrpp = await prisma.staff.findUnique({
      where: { id: body.data.staffId, localId },
    });
    if (!staffRrpp) return reply.status(404).send({ error: "Staff no encontrado" });
    if (staffRrpp.rol !== "rrpp") {
      return reply.status(422).send({ error: "El staff no tiene rol RRPP" });
    }

    // Calcular entradas vendidas por este RRPP en el evento
    const entradasVendidas = await prisma.entradaVendida.findMany({
      where: { localId, eventoId: body.data.eventoId, rrppId: body.data.staffId },
      select: { precioPagado: true },
    });

    const montoTotalVentas = entradasVendidas.reduce((acc, e) => acc + Number(e.precioPagado), 0);
    const montoComision = (montoTotalVentas * body.data.porcentajeComision) / 100;

    // Upsert — si ya existe la comisión para este par staff/evento, actualizar
    const comision = await prisma.comisionRrpp.upsert({
      where: {
        staffId_eventoId: {
          staffId: body.data.staffId,
          eventoId: body.data.eventoId,
        },
      },
      update: {
        entradasVendidas: entradasVendidas.length,
        montoTotalVentas,
        porcentajeComision: body.data.porcentajeComision,
        montoComision,
      },
      create: {
        localId,
        staffId: body.data.staffId,
        eventoId: body.data.eventoId,
        entradasVendidas: entradasVendidas.length,
        montoTotalVentas,
        porcentajeComision: body.data.porcentajeComision,
        montoComision,
        pagada: false,
      },
      include: {
        staff: { select: { nombre: true, apellido: true } },
        evento: { select: { nombre: true } },
      },
    });

    return reply.status(201).send({
      comision: {
        ...comision,
        montoTotalVentas: Number(comision.montoTotalVentas),
        porcentajeComision: Number(comision.porcentajeComision),
        montoComision: Number(comision.montoComision),
      },
    });
  });

  // PATCH /api/personal/comisiones/:id/pagar
  app.patch("/comisiones/:id/pagar", async (req, reply) => {
    const { localId, staffActual } = req;
    const { id } = req.params as { id: string };

    if (!["admin", "encargado"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const comision = await prisma.comisionRrpp.findUnique({ where: { id, localId } });
    if (!comision) return reply.status(404).send({ error: "Comisión no encontrada" });
    if (comision.pagada) return reply.status(409).send({ error: "La comisión ya fue pagada" });

    const actualizada = await prisma.comisionRrpp.update({
      where: { id },
      data: { pagada: true },
      include: {
        staff: { select: { nombre: true, apellido: true } },
        evento: { select: { nombre: true } },
      },
    });

    return {
      comision: {
        ...actualizada,
        montoTotalVentas: Number(actualizada.montoTotalVentas),
        porcentajeComision: Number(actualizada.porcentajeComision),
        montoComision: Number(actualizada.montoComision),
      },
    };
  });
};

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
import { io } from "../index.js";
import { generarSecretoQR } from "../lib/qrRotativo.js";
import { randomUUID } from "node:crypto";
import { crearPreferenciaEntradas } from "../lib/mpCheckout.js";

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

    // Crear usuario en Better Auth (auth.api.* devuelve objeto tipado, no Response)
    let datosAuth: { token: string | null; user: { id: string } };
    try {
      datosAuth = await auth.api.signUpEmail({
        body: {
          email,
          password,
          name: `${nombre} ${apellido}`,
        },
        headers: new Headers({ "content-type": "application/json" }),
      });
    } catch {
      return reply.status(400).send({ error: "El email ya está registrado" });
    }

    if (!datosAuth.token) {
      return reply.status(400).send({ error: "Verificá tu email para activar la cuenta" });
    }

    // Crear perfil de cliente
    const cliente = await prisma.cliente.create({
      data: {
        localId,
        userId: datosAuth.user.id,
        nombre,
        apellido,
        // Columna nullable: Prisma espera `null`, no `undefined`
        telefono: telefono ?? null,
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

    // Autenticar con Better Auth (auth.api.* devuelve objeto tipado, no Response)
    let datosAuth: { token: string; user: { id: string } };
    try {
      datosAuth = await auth.api.signInEmail({
        body: { email, password },
        headers: new Headers({ "content-type": "application/json" }),
      });
    } catch {
      return reply.status(401).send({ error: "Credenciales inválidas" });
    }

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
  // POST /api/cliente/comprar (protegido)
  //
  // Crea las entradas del cliente. Según `modalidad`:
  //   - "puerta": quedan sin pagar; se cobran al ingresar.
  //   - "online": quedan sin pagar y se devuelve el link de Checkout Pro;
  //     el webhook de MP las marca pagadas.
  //
  // En los dos casos la entrada nace en `pagada: false`. Es a propósito: que
  // exista la entrada no significa que haya entrado la plata, y mezclar esas
  // dos cosas es la forma más rápida de descuadrar la caja.
  // ══════════════════════════════════════════════════════════════
  app.post("/comprar", async (req, reply) => {
    const localId = getLocalId(req, reply);
    if (!localId) return;

    const sesion = await autenticarCliente(req, reply);
    if (!sesion) return;

    const schema = z.object({
      entradaTipoId: z.string().uuid(),
      cantidad: z.number().int().positive().max(10).default(1),
      modalidad: z.enum(["puerta", "online"]),
    });

    const body = schema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const { entradaTipoId, cantidad, modalidad } = body.data;

    const cliente = await prisma.cliente.findUnique({
      where: { localId_userId: { localId, userId: sesion.userId } },
      include: { user: { select: { email: true } } },
    });
    if (!cliente) return reply.status(404).send({ error: "Perfil no encontrado" });

    const tipo = await prisma.entradaTipo.findFirst({
      where: { id: entradaTipoId, localId, activo: true },
      include: {
        evento: { select: { id: true, nombre: true, estado: true } },
        _count: { select: { entradasVendidas: true } },
      },
    });

    if (!tipo) {
      return reply.status(404).send({ error: "Tipo de entrada no disponible" });
    }

    if (!["preventa", "en_vivo"].includes(tipo.evento.estado)) {
      return reply.status(409).send({ error: "El evento no está a la venta" });
    }

    // Mismo control de cupo que la venta del panel.
    if (tipo.cantidadTotal !== null) {
      const vendidas = tipo._count.entradasVendidas;
      if (vendidas + cantidad > tipo.cantidadTotal) {
        return reply.status(422).send({
          error: "Sin cupo disponible",
          disponibles: Math.max(0, tipo.cantidadTotal - vendidas),
        });
      }
    }

    const precio = Number(tipo.precio);

    /**
     * Identificador del grupo de entradas de esta compra.
     *
     * Viaja a MP como `external_reference` y se guarda en cada entrada. Es lo
     * único que después permite, cuando llega el webhook diciendo "se pagó",
     * saber qué entradas habilitar: el aviso de MP trae el pago, no las
     * entradas.
     */
    const referenciaCompra = randomUUID();

    const entradas = await Promise.all(
      Array.from({ length: cantidad }).map(() =>
        prisma.entradaVendida.create({
          data: {
            localId,
            eventoId: tipo.eventoId,
            entradaTipoId,
            clienteId: cliente.id,
            qrSecret: generarSecretoQR(),
            clienteNombre: `${cliente.nombre} ${cliente.apellido}`,
            clienteEmail: cliente.user.email,
            clienteTelefono: cliente.telefono,
            precioPagado: precio,
            // Provisorio: lo define el pago real. En "puerta" lo fija el
            // portero al cobrar; en "online" lo confirma el webhook.
            metodoPago: modalidad === "online" ? "qr_mp" : "efectivo",
            pagada: false,
            ...(modalidad === "online" && { mpPreferenceId: referenciaCompra }),
          },
        })
      )
    );

    await prisma.entradaTipo.update({
      where: { id: entradaTipoId },
      data: { cantidadVendida: { increment: cantidad } },
    });

    const total = precio * cantidad;

    io.to(`local:${localId}`).emit("entrada:vendida", {
      eventoId: tipo.eventoId,
      cantidad,
      total,
      metodoPago: modalidad === "online" ? "qr_mp" : "efectivo",
    });

    /**
     * El link de pago se genera después de crear las entradas, y si falla no
     * se tira abajo la compra: las entradas quedan reservadas y el cliente
     * puede pagar en la puerta. Perder la reserva porque MP no respondió sería
     * peor que ofrecer un camino alternativo.
     */
    let linkPago: string | null = null;
    let avisoPago: string | null = null;

    if (modalidad === "online") {
      try {
        const pref = await crearPreferenciaEntradas({
          referencia: referenciaCompra,
          descripcion: `${tipo.evento.nombre} — ${tipo.nombre}`,
          precioUnitario: precio,
          cantidad,
          emailComprador: cliente.user.email,
        });
        linkPago = pref.linkPago;
      } catch (err) {
        req.log.error({ err, referenciaCompra }, "No se pudo crear la preferencia de pago");
        avisoPago =
          "No se pudo abrir el pago online. Tu entrada quedó reservada: podés " +
          "pagarla en la puerta.";
      }
    }

    return reply.status(201).send({
      entradas: entradas.map((e) => ({
        id: e.id,
        qrCode: e.qrCode,
        pagada: e.pagada,
      })),
      cantidad,
      total,
      modalidad,
      linkPago,
      avisoPago,
    });
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

    // El QR ya no se arma acá: lo genera la app en el momento, porque incluye
    // un código rotativo que cambia cada 30 segundos.
    //
    // Por eso viaja el `qrSecret`. Solo se entrega al dueño autenticado de la
    // entrada: no aparece en ningún endpoint del panel ni en el listado de
    // vendidas, así que ni el staff puede reconstruir el código de un cliente.
    const resultado = entradas.map((e) => ({
      id:           e.id,
      qrCode:       e.qrCode,
      qrSecret:     e.qrSecret,
      localId,
      usada:        e.usada,
      precioPagado: e.precioPagado,
      createdAt:    e.createdAt,
      evento:       e.evento,
      tipoEntrada:  e.entradaTipo,
    }));

    return {
      entradas: resultado,
      // Reloj del servidor. La app calcula su desfasaje contra este valor y
      // genera el código rotativo con la hora corregida. Sin esto, un celular
      // con la hora mal puesta mostraría códigos que la puerta rechaza siempre.
      serverTime: Date.now(),
    };
  });
};

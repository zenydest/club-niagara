/**
 * Club Niágara — API Server
 * Fastify + Better Auth + Socket.io + Prisma
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";

import { prisma } from "@niagara/db";
import { auth } from "./lib/auth.js";
import { tenantContextPlugin } from "./plugins/tenantContext.js";
import { registrarRutasAuth } from "./routes/auth.js";
import { registrarRutasDashboard } from "./routes/dashboard.js";
import { registrarRutasEventos } from "./routes/eventos.js";
import { registrarRutasVentas } from "./routes/ventas.js";
import { registrarRutasAccesos } from "./routes/accesos.js";
import { registrarRutasProductos } from "./routes/productos.js";
import { registrarRutasBarras } from "./routes/barras.js";
import { iniciarSocketIO } from "./socket/index.js";

const PORT = Number(process.env["PORT"] ?? 3001);
const HOST = process.env["HOST"] ?? "0.0.0.0";
const FRONTEND_URLS = (process.env["FRONTEND_URLS"] ?? "http://localhost:5173").split(",");

// ── HTTP server nativo (compartido entre Fastify y Socket.io) ─
const httpServer = createServer();

// ── Socket.io se conecta al mismo HTTP server ─────────────────
export const io = new SocketServer(httpServer, {
  cors: {
    origin: FRONTEND_URLS,
    credentials: true,
  },
});

// ── Fastify reutiliza el HTTP server vía serverFactory ────────
const app = Fastify({
  logger: {
    level: process.env["NODE_ENV"] === "production" ? "warn" : "info",
    transport:
      process.env["NODE_ENV"] !== "production"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  },
  serverFactory: (handler) => {
    // Socket.io ya escucha en httpServer para /socket.io/*
    // Le pasamos a Fastify solo los requests que NO son de Socket.io
    httpServer.on("request", (req, res) => {
      if (req.url?.startsWith("/socket.io/")) return;
      handler(req, res);
    });
    return httpServer;
  },
});

// ── Plugins globales ─────────────────────────────────────────
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cookie);
await app.register(cors, {
  origin: FRONTEND_URLS,
  credentials: true,
  // Necesario para que el preflight permita el header custom x-local-id
  allowedHeaders: ["Content-Type", "Authorization", "x-local-id"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});
await app.register(rateLimit, {
  max: 200,
  timeWindow: "1 minute",
});

// ── Health check ─────────────────────────────────────────────
app.get("/health", async () => ({ status: "ok", ts: new Date().toISOString() }));

// ── Better Auth — manejar todas las rutas /api/auth/* ────────
app.all("/api/auth/*", async (req, reply) => {
  // Convertir request de Node.js a Web API Request para Better Auth
  const protocol = "https";
  const host = req.headers["host"] ?? "localhost";
  const url = `${protocol}://${host}${req.url}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const webRequest = new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? JSON.stringify(req.body) : undefined,
  });

  const response = await auth.handler(webRequest);
  reply.status(response.status);
  for (const [key, value] of response.headers.entries()) {
    void reply.header(key, value);
  }
  const body = await response.text();
  return reply.send(body);
});

// ── Plugin de contexto tenant (inyecta localId en req) ───────
await app.register(tenantContextPlugin);

// ── Rutas de dominio ─────────────────────────────────────────
await app.register(registrarRutasDashboard, { prefix: "/api/dashboard" });
await app.register(registrarRutasEventos, { prefix: "/api/eventos" });
await app.register(registrarRutasVentas, { prefix: "/api/ventas" });
await app.register(registrarRutasAccesos, { prefix: "/api/accesos" });
await app.register(registrarRutasProductos, { prefix: "/api/productos" });
await app.register(registrarRutasBarras, { prefix: "/api/barras" });
await app.register(registrarRutasAuth, { prefix: "/api/staff" });

// ── Socket.io handlers ───────────────────────────────────────
iniciarSocketIO(io);

// ── Arranque ─────────────────────────────────────────────────
try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`🎉 Club Niágara API corriendo en http://${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  await prisma.$disconnect();
  process.exit(1);
}

// ── Cierre limpio ────────────────────────────────────────────
const shutdown = async () => {
  console.log("\n⏳ Cerrando servidor...");
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

/**
 * Compra desde la app del cliente (POST /comprar).
 *
 * Es el tercer camino que reserva lugares, junto con la venta pública y la del
 * panel. La reserva en sí se prueba en `lib/reservarCupo.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type * as ReservarCupo from "../lib/reservarCupo.js";

const mocks = vi.hoisted(() => {
  const emit = vi.fn();

  return {
    emit,
    prisma: {
      session: { findUnique: vi.fn() },
      cliente: { findUnique: vi.fn() },
      entradaTipo: { findFirst: vi.fn() },
      $transaction: vi.fn(),
    },
    io: { to: vi.fn(() => ({ emit })) },
    crearPreferenciaEntradas: vi.fn(),
    reservarCupo: vi.fn(),
    tx: { entradaVendida: { create: vi.fn() } },
  };
});

vi.mock("@niagara/db", () => ({ prisma: mocks.prisma }));
vi.mock("../index.js", () => ({ io: mocks.io }));
vi.mock("../lib/auth.js", () => ({ auth: {} }));
vi.mock("../lib/qrRotativo.js", () => ({
  generarSecretoQR: vi.fn(() => "secreto"),
  codigoValido: vi.fn(() => true),
}));
vi.mock("../lib/mpCheckout.js", () => ({
  crearPreferenciaEntradas: mocks.crearPreferenciaEntradas,
}));
vi.mock("../lib/cancelarEntrada.js", () => ({
  cancelarEntrada: vi.fn(),
  mensajeRechazo: vi.fn(() => "rechazado"),
}));
vi.mock("../lib/reservarCupo.js", async (importOriginal) => ({
  ...(await importOriginal<typeof ReservarCupo>()),
  reservarCupo: mocks.reservarCupo,
}));

const { registrarRutasCliente } = await import("./cliente.js");

const ENTRADA_TIPO_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

const CABECERAS = {
  "x-local-id": "local-1",
  authorization: "Bearer token-valido",
};

function tanda(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ENTRADA_TIPO_ID,
    localId: "local-1",
    eventoId: "evento-1",
    nombre: "Prioridad",
    precio: 3000,
    cantidadTotal: null,
    cantidadVendida: 0,
    evento: { id: "evento-1", nombre: "Apertura", estado: "preventa" },
    ...overrides,
  };
}

async function construirApp() {
  const app = Fastify();
  await app.register(registrarRutasCliente);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();

  // Sesión válida por una hora.
  mocks.prisma.session.findUnique.mockResolvedValue({
    token: "token-valido",
    userId: "user-1",
    expiresAt: new Date(Date.now() + 3600_000),
  });
  mocks.prisma.cliente.findUnique.mockResolvedValue({
    id: "cliente-1",
    nombre: "Ana",
    apellido: "Pérez",
    telefono: "1122334455",
    user: { email: "ana@example.com" },
  });
  mocks.prisma.$transaction.mockImplementation(
    async (cb: (tx: typeof mocks.tx) => Promise<unknown>) => cb(mocks.tx)
  );
  mocks.tx.entradaVendida.create.mockResolvedValue({
    id: "entrada-1",
    qrCode: "qr-1",
    pagada: false,
  });
  mocks.crearPreferenciaEntradas.mockResolvedValue({ linkPago: "https://mp/checkout" });
  mocks.reservarCupo.mockResolvedValue({ ok: true });
});

describe("POST /comprar (app del cliente)", () => {
  it("crea una entrada por unidad y devuelve el link de pago", async () => {
    mocks.prisma.entradaTipo.findFirst.mockResolvedValue(tanda());

    const app = await construirApp();
    const res = await app.inject({
      method: "POST",
      url: "/comprar",
      headers: CABECERAS,
      payload: { entradaTipoId: ENTRADA_TIPO_ID, cantidad: 2, modalidad: "online" },
    });

    expect(res.statusCode).toBe(201);
    expect(mocks.tx.entradaVendida.create).toHaveBeenCalledTimes(2);
    expect(res.json()).toMatchObject({ linkPago: "https://mp/checkout", total: 6000 });
    expect(mocks.reservarCupo).toHaveBeenCalledWith(mocks.tx, ENTRADA_TIPO_ID, 2);
  });

  it("no crea ninguna entrada si el salón se llenó", async () => {
    mocks.prisma.entradaTipo.findFirst.mockResolvedValue(tanda());
    mocks.reservarCupo.mockResolvedValue({
      ok: false,
      motivo: "evento_lleno",
      disponibles: 3,
    });

    const app = await construirApp();
    const res = await app.inject({
      method: "POST",
      url: "/comprar",
      headers: CABECERAS,
      payload: { entradaTipoId: ENTRADA_TIPO_ID, cantidad: 5, modalidad: "puerta" },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      error: "Quedan solo 3 lugares para este evento",
      motivo: "evento_lleno",
      disponibles: 3,
    });
    expect(mocks.tx.entradaVendida.create).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it("corta antes de pedir lugar si el tipo ya estaba agotado", async () => {
    mocks.prisma.entradaTipo.findFirst.mockResolvedValue(
      tanda({ cantidadTotal: 20, cantidadVendida: 20 })
    );

    const app = await construirApp();
    const res = await app.inject({
      method: "POST",
      url: "/comprar",
      headers: CABECERAS,
      payload: { entradaTipoId: ENTRADA_TIPO_ID, cantidad: 1, modalidad: "puerta" },
    });

    expect(res.statusCode).toBe(422);
    expect(mocks.reservarCupo).not.toHaveBeenCalled();
  });
});

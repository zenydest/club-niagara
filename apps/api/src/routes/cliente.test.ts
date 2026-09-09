/**
 * Reserva de cupo en la compra desde la app del cliente (POST /comprar).
 *
 * Es el tercer camino que escribe `cantidad_vendida`, junto con la venta
 * pública y la del panel. Antes de la transacción, este era el peor de los
 * tres: creaba las entradas y recién después incrementaba el contador, en dos
 * queries sueltas.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";

const mocks = vi.hoisted(() => {
  const emit = vi.fn();

  return {
    emit,
    prisma: {
      session: { findUnique: vi.fn() },
      cliente: { findUnique: vi.fn() },
      entradaTipo: { findFirst: vi.fn(), findUnique: vi.fn() },
      $transaction: vi.fn(),
    },
    io: { to: vi.fn(() => ({ emit })) },
    crearPreferenciaEntradas: vi.fn(),
    tx: {
      $executeRaw: vi.fn(),
      entradaVendida: { create: vi.fn() },
    },
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
    nombre: "General",
    precio: 15000,
    cantidadTotal: 100,
    cantidadVendida: 0,
    evento: { id: "evento-1", nombre: "Sábado", estado: "preventa" },
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
});

describe("POST /comprar (app del cliente) — reserva de cupo", () => {
  it("no crea ninguna entrada si el cupo se acabó entre el chequeo y el UPDATE", async () => {
    mocks.prisma.entradaTipo.findFirst.mockResolvedValue(
      tanda({ cantidadTotal: 100, cantidadVendida: 99 })
    );
    mocks.tx.$executeRaw.mockResolvedValue(0);
    mocks.prisma.entradaTipo.findUnique.mockResolvedValue({
      cantidadTotal: 100,
      cantidadVendida: 100,
    });

    const app = await construirApp();
    const res = await app.inject({
      method: "POST",
      url: "/comprar",
      headers: CABECERAS,
      payload: { entradaTipoId: ENTRADA_TIPO_ID, cantidad: 1, modalidad: "puerta" },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: "Sin cupo disponible", disponibles: 0 });
    expect(mocks.tx.entradaVendida.create).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it("crea una entrada por unidad y devuelve el link de pago", async () => {
    mocks.prisma.entradaTipo.findFirst.mockResolvedValue(tanda());
    mocks.tx.$executeRaw.mockResolvedValue(1);

    const app = await construirApp();
    const res = await app.inject({
      method: "POST",
      url: "/comprar",
      headers: CABECERAS,
      payload: { entradaTipoId: ENTRADA_TIPO_ID, cantidad: 2, modalidad: "online" },
    });

    expect(res.statusCode).toBe(201);
    expect(mocks.tx.entradaVendida.create).toHaveBeenCalledTimes(2);
    expect(res.json()).toMatchObject({ linkPago: "https://mp/checkout", total: 30000 });
  });

  it("manda al UPDATE la cantidad pedida y el id de la tanda", async () => {
    mocks.prisma.entradaTipo.findFirst.mockResolvedValue(tanda());
    mocks.tx.$executeRaw.mockResolvedValue(1);

    const app = await construirApp();
    await app.inject({
      method: "POST",
      url: "/comprar",
      headers: CABECERAS,
      payload: { entradaTipoId: ENTRADA_TIPO_ID, cantidad: 3, modalidad: "puerta" },
    });

    const [, ...valores] = mocks.tx.$executeRaw.mock.calls[0] as unknown[];
    expect(valores).toEqual([3, ENTRADA_TIPO_ID, 3]);
  });

  it("corta antes de abrir la transacción si ya estaba agotada", async () => {
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
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});

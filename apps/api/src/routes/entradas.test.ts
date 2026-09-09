/**
 * Venta de entradas desde el panel (POST /vender).
 *
 * La reserva del cupo se prueba en `lib/reservarCupo.test.ts`. Acá se prueba lo
 * que hace la ruta con el resultado, con staff autenticado.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type * as ReservarCupo from "../lib/reservarCupo.js";

const mocks = vi.hoisted(() => {
  const emit = vi.fn();

  return {
    emit,
    prisma: {
      entradaTipo: { findUnique: vi.fn() },
      cliente: { findFirst: vi.fn() },
      $transaction: vi.fn(),
    },
    io: { to: vi.fn(() => ({ emit })) },
    reservarCupo: vi.fn(),
    tx: { entradaVendida: { create: vi.fn() } },
  };
});

vi.mock("@niagara/db", () => ({ prisma: mocks.prisma }));
vi.mock("../index.js", () => ({ io: mocks.io }));
vi.mock("../lib/qrRotativo.js", () => ({
  codigoValido: vi.fn(() => true),
  generarSecretoQR: vi.fn(() => "secreto"),
}));
vi.mock("../lib/cancelarEntrada.js", () => ({
  cancelarEntrada: vi.fn(),
  mensajeRechazo: vi.fn(() => "rechazado"),
}));
vi.mock("../lib/reservarCupo.js", async (importOriginal) => ({
  ...(await importOriginal<typeof ReservarCupo>()),
  reservarCupo: mocks.reservarCupo,
}));

const { registrarRutasEntradas } = await import("./entradas.js");

const EVENTO_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const ENTRADA_TIPO_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3302";

function tanda(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ENTRADA_TIPO_ID,
    activo: true,
    cantidadTotal: null,
    cantidadVendida: 0,
    ...overrides,
  };
}

function cuerpoVenta(cantidad = 1) {
  return {
    eventoId: EVENTO_ID,
    entradaTipoId: ENTRADA_TIPO_ID,
    clienteNombre: "Ana Pérez",
    metodoPago: "efectivo",
    precioPagado: 3000,
    cantidad,
  };
}

/** App con el staff ya resuelto, como lo dejaría el hook de auth de `index.ts`. */
async function construirApp(): Promise<FastifyInstance> {
  const app = Fastify();

  app.addHook("onRequest", (req, _reply, done) => {
    // La ruta solo lee `id` y `rol`; el resto del registro de staff no hace
    // falta para probar el cupo.
    Object.assign(req, {
      localId: "local-1",
      staffActual: { id: "staff-1", rol: "cajero" },
    });
    done();
  });

  await app.register(registrarRutasEntradas);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.prisma.cliente.findFirst.mockResolvedValue(null);
  mocks.prisma.$transaction.mockImplementation(
    async (cb: (tx: typeof mocks.tx) => Promise<unknown>) => cb(mocks.tx)
  );
  mocks.tx.entradaVendida.create.mockResolvedValue({
    id: "entrada-1",
    precioPagado: 3000,
  });
  mocks.reservarCupo.mockResolvedValue({ ok: true });
});

describe("POST /vender", () => {
  it("crea una entrada por unidad cuando hay lugar", async () => {
    mocks.prisma.entradaTipo.findUnique.mockResolvedValue(tanda());

    const app = await construirApp();
    const res = await app.inject({
      method: "POST",
      url: "/vender",
      payload: cuerpoVenta(2),
    });

    expect(res.statusCode).toBe(201);
    expect(mocks.tx.entradaVendida.create).toHaveBeenCalledTimes(2);
    expect(res.json()).toMatchObject({ cantidad: 2, total: 6000 });
    expect(mocks.reservarCupo).toHaveBeenCalledWith(mocks.tx, ENTRADA_TIPO_ID, 2);
  });

  it("no crea ninguna entrada si el salón se llenó", async () => {
    mocks.prisma.entradaTipo.findUnique.mockResolvedValue(tanda());
    mocks.reservarCupo.mockResolvedValue({
      ok: false,
      motivo: "evento_lleno",
      disponibles: 0,
    });

    const app = await construirApp();
    const res = await app.inject({
      method: "POST",
      url: "/vender",
      payload: cuerpoVenta(1),
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      error: "No quedan lugares para este evento",
      motivo: "evento_lleno",
    });
    expect(mocks.tx.entradaVendida.create).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it("mide el tope del tipo con cantidadVendida y no contando canceladas", async () => {
    // 100 de tope con 90 netas: cancelar devuelve el lugar, así que quedan 10.
    // Contando filas esto daba "agotado" con la tanda a medio vender.
    mocks.prisma.entradaTipo.findUnique.mockResolvedValue(
      tanda({ cantidadTotal: 100, cantidadVendida: 90 })
    );

    const app = await construirApp();
    const res = await app.inject({
      method: "POST",
      url: "/vender",
      payload: cuerpoVenta(5),
    });

    expect(res.statusCode).toBe(201);
  });

  it("corta antes de pedir lugar si el tipo ya estaba agotado", async () => {
    mocks.prisma.entradaTipo.findUnique.mockResolvedValue(
      tanda({ cantidadTotal: 50, cantidadVendida: 50 })
    );

    const app = await construirApp();
    const res = await app.inject({
      method: "POST",
      url: "/vender",
      payload: cuerpoVenta(1),
    });

    expect(res.statusCode).toBe(422);
    expect(mocks.reservarCupo).not.toHaveBeenCalled();
  });
});

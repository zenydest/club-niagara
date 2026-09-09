/**
 * Reserva de cupo en la venta desde el panel (POST /vender).
 *
 * Mismo control que la venta pública, con la diferencia de que acá hay staff
 * autenticado. Igual que en `publico.test.ts`, esto prueba el control de flujo:
 * la atomicidad la garantiza Postgres y no se puede ver con Prisma mockeado.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

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
    tx: {
      $executeRaw: vi.fn(),
      entradaVendida: { create: vi.fn() },
    },
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

const { registrarRutasEntradas } = await import("./entradas.js");

const EVENTO_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const ENTRADA_TIPO_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3302";

function tanda(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ENTRADA_TIPO_ID,
    activo: true,
    cantidadTotal: 100,
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
    precioPagado: 15000,
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
    precioPagado: 15000,
  });
});

describe("POST /vender — reserva de cupo", () => {
  it("no crea ninguna entrada si el cupo se acabó entre el chequeo y el UPDATE", async () => {
    mocks.prisma.entradaTipo.findUnique.mockResolvedValue(
      tanda({ cantidadTotal: 100, cantidadVendida: 99 })
    );
    mocks.tx.$executeRaw.mockResolvedValue(0);

    const app = await construirApp();
    const res = await app.inject({
      method: "POST",
      url: "/vender",
      payload: cuerpoVenta(1),
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: "Sin cupo disponible" });
    expect(mocks.tx.entradaVendida.create).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it("crea una entrada por unidad cuando el cupo alcanza", async () => {
    mocks.prisma.entradaTipo.findUnique.mockResolvedValue(tanda());
    mocks.tx.$executeRaw.mockResolvedValue(1);

    const app = await construirApp();
    const res = await app.inject({
      method: "POST",
      url: "/vender",
      payload: cuerpoVenta(2),
    });

    expect(res.statusCode).toBe(201);
    expect(mocks.tx.entradaVendida.create).toHaveBeenCalledTimes(2);
    expect(res.json()).toMatchObject({ cantidad: 2, total: 30000 });
  });

  it("mide el cupo con cantidadVendida y no contando entradas canceladas", async () => {
    // 100 de tope, 100 filas creadas pero 10 canceladas: quedan 10 lugares.
    // Contando filas esto daba "agotado" con la tanda a medio vender.
    mocks.prisma.entradaTipo.findUnique.mockResolvedValue(
      tanda({ cantidadTotal: 100, cantidadVendida: 90 })
    );
    mocks.tx.$executeRaw.mockResolvedValue(1);

    const app = await construirApp();
    const res = await app.inject({
      method: "POST",
      url: "/vender",
      payload: cuerpoVenta(5),
    });

    expect(res.statusCode).toBe(201);
  });

  it("corta antes de abrir la transacción si ya estaba agotada", async () => {
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
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});

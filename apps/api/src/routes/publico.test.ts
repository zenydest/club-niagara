/**
 * Venta pública de entradas.
 *
 * La reserva del cupo en sí se prueba en `lib/reservarCupo.test.ts`. Acá se
 * prueba lo que hace la ruta con el resultado: que sin lugar no cree entradas
 * ni avise al panel, y que el lugar se pida adentro de la misma transacción en
 * la que se crean.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type * as ReservarCupo from "../lib/reservarCupo.js";

const mocks = vi.hoisted(() => {
  const emit = vi.fn();

  return {
    emit,
    prisma: {
      entradaTipo: { findFirst: vi.fn() },
      staff: { findFirst: vi.fn() },
      $transaction: vi.fn(),
    },
    io: { to: vi.fn(() => ({ emit })) },
    crearPreferenciaEntradas: vi.fn(),
    reservarCupo: vi.fn(),
    tx: { entradaVendida: { create: vi.fn() } },
  };
});

vi.mock("@niagara/db", () => ({ prisma: mocks.prisma }));
// `index.ts` levanta el servidor HTTP al importarse; acá solo hace falta `io`.
vi.mock("../index.js", () => ({ io: mocks.io }));
vi.mock("../lib/mpCheckout.js", () => ({
  crearPreferenciaEntradas: mocks.crearPreferenciaEntradas,
}));
// Se mockea solo la reserva; el armado del mensaje es puro y se usa el real.
vi.mock("../lib/reservarCupo.js", async (importOriginal) => ({
  ...(await importOriginal<typeof ReservarCupo>()),
  reservarCupo: mocks.reservarCupo,
}));

const { registrarRutasPublico } = await import("./publico.js");

const ENTRADA_TIPO_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

function tandaConCupo(overrides: Partial<Record<string, unknown>> = {}) {
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

function cuerpoCompra(cantidad = 1) {
  return {
    entradaTipoId: ENTRADA_TIPO_ID,
    cantidad,
    nombre: "Ana Pérez",
    email: "ana@example.com",
  };
}

async function construirApp() {
  const app = Fastify();
  await app.register(registrarRutasPublico);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.prisma.staff.findFirst.mockResolvedValue(null);
  mocks.prisma.$transaction.mockImplementation(
    async (cb: (tx: typeof mocks.tx) => Promise<unknown>) => cb(mocks.tx)
  );
  mocks.tx.entradaVendida.create.mockResolvedValue({ id: "entrada-1" });
  mocks.crearPreferenciaEntradas.mockResolvedValue({ linkPago: "https://mp/checkout" });
  mocks.reservarCupo.mockResolvedValue({ ok: true });
});

describe("POST /comprar", () => {
  it("crea una entrada por unidad cuando hay lugar", async () => {
    mocks.prisma.entradaTipo.findFirst.mockResolvedValue(tandaConCupo());

    const app = await construirApp();
    const res = await app.inject({
      method: "POST",
      url: "/comprar",
      payload: cuerpoCompra(3),
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ linkPago: "https://mp/checkout" });
    expect(mocks.tx.entradaVendida.create).toHaveBeenCalledTimes(3);
    expect(mocks.reservarCupo).toHaveBeenCalledWith(mocks.tx, ENTRADA_TIPO_ID, 3);
  });

  it("no crea ninguna entrada si el salón se llenó", async () => {
    mocks.prisma.entradaTipo.findFirst.mockResolvedValue(tandaConCupo());
    mocks.reservarCupo.mockResolvedValue({
      ok: false,
      motivo: "evento_lleno",
      disponibles: 0,
    });

    const app = await construirApp();
    const res = await app.inject({
      method: "POST",
      url: "/comprar",
      payload: cuerpoCompra(1),
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      error: "No quedan lugares para este evento",
      motivo: "evento_lleno",
    });
    expect(mocks.tx.entradaVendida.create).not.toHaveBeenCalled();
    // Sin entradas creadas tampoco hay que avisarle al panel.
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it("distingue el tipo agotado del salón lleno", async () => {
    mocks.prisma.entradaTipo.findFirst.mockResolvedValue(tandaConCupo());
    mocks.reservarCupo.mockResolvedValue({
      ok: false,
      motivo: "sin_cupo_en_el_tipo",
      disponibles: 2,
    });

    const app = await construirApp();
    const res = await app.inject({
      method: "POST",
      url: "/comprar",
      payload: cuerpoCompra(5),
    });

    expect(res.json()).toMatchObject({
      error: "Quedan solo 2",
      motivo: "sin_cupo_en_el_tipo",
      disponibles: 2,
    });
  });

  it("corta antes de pedir lugar si la tanda ya estaba agotada", async () => {
    mocks.prisma.entradaTipo.findFirst.mockResolvedValue(
      tandaConCupo({ cantidadTotal: 50, cantidadVendida: 50 })
    );

    const app = await construirApp();
    const res = await app.inject({
      method: "POST",
      url: "/comprar",
      payload: cuerpoCompra(1),
    });

    expect(res.statusCode).toBe(422);
    expect(mocks.reservarCupo).not.toHaveBeenCalled();
  });

  it("rechaza el evento que no está a la venta sin tocar el cupo", async () => {
    mocks.prisma.entradaTipo.findFirst.mockResolvedValue(
      tandaConCupo({ evento: { id: "evento-1", nombre: "Apertura", estado: "finalizado" } })
    );

    const app = await construirApp();
    const res = await app.inject({
      method: "POST",
      url: "/comprar",
      payload: cuerpoCompra(1),
    });

    expect(res.statusCode).toBe(409);
    expect(mocks.reservarCupo).not.toHaveBeenCalled();
  });
});

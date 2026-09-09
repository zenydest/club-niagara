/**
 * Borrado de eventos.
 *
 * Un evento con movimiento no se borra: esa información es la recaudación de
 * una noche. Lo que se prueba acá es que el "no" venga explicado, porque la
 * pantalla del evento solo muestra entradas vendidas y aforo: si lo que frena
 * el borrado son ventas de barra, los dos contadores visibles están en cero y
 * el sistema parece negarse porque sí.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

const mocks = vi.hoisted(() => ({
  prisma: {
    evento: { findFirst: vi.fn(), delete: vi.fn() },
    entradaTipo: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
  io: { to: vi.fn(() => ({ emit: vi.fn() })) },
}));

vi.mock("@niagara/db", () => ({ prisma: mocks.prisma }));
vi.mock("../index.js", () => ({ io: mocks.io }));
vi.mock("../lib/push.js", () => ({ avisarAClientes: vi.fn() }));

const { registrarRutasEventos } = await import("./eventos.js");

const EVENTO_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

function sinMovimiento(overrides: Partial<Record<string, number>> = {}) {
  return {
    id: EVENTO_ID,
    _count: {
      ventas: 0,
      entradasVendidas: 0,
      accesos: 0,
      reservas: 0,
      guardarropa: 0,
      ...overrides,
    },
  };
}

async function construirApp(rol = "admin"): Promise<FastifyInstance> {
  const app = Fastify();

  app.addHook("onRequest", (req, _reply, done) => {
    Object.assign(req, {
      localId: "local-1",
      staffActual: { id: "staff-1", rol },
    });
    done();
  });

  await app.register(registrarRutasEventos);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockResolvedValue([]);
});

describe("DELETE /:id", () => {
  it("borra el evento que no dejó rastro", async () => {
    mocks.prisma.evento.findFirst.mockResolvedValue(sinMovimiento());

    const app = await construirApp();
    const res = await app.inject({ method: "DELETE", url: `/${EVENTO_ID}` });

    expect(res.statusCode).toBe(204);
    expect(mocks.prisma.$transaction).toHaveBeenCalled();
  });

  it("dice que lo frenan las ventas de barra cuando es eso", async () => {
    // El caso real: 0 entradas vendidas y 0 de aforo en pantalla, pero quedaron
    // ventas del POS de cuando se probó el sistema.
    mocks.prisma.evento.findFirst.mockResolvedValue(sinMovimiento({ ventas: 12 }));

    const app = await construirApp();
    const res = await app.inject({ method: "DELETE", url: `/${EVENTO_ID}` });

    expect(res.statusCode).toBe(409);

    const cuerpo: { error: string; detalle: Record<string, number> } = res.json();
    expect(cuerpo.error).toContain("12 ventas de barra");
    expect(cuerpo.detalle).toMatchObject({ ventas: 12, entradasVendidas: 0 });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("enumera todo lo que lo frena, no solo lo primero", async () => {
    mocks.prisma.evento.findFirst.mockResolvedValue(
      sinMovimiento({ ventas: 2, entradasVendidas: 5, accesos: 1 })
    );

    const app = await construirApp();
    const res = await app.inject({ method: "DELETE", url: `/${EVENTO_ID}` });

    const { error }: { error: string } = res.json();
    expect(error).toContain("2 ventas de barra");
    expect(error).toContain("5 entradas vendidas");
    expect(error).toContain("1 ingreso");
  });

  it("no nombra lo que está en cero", async () => {
    mocks.prisma.evento.findFirst.mockResolvedValue(sinMovimiento({ reservas: 1 }));

    const app = await construirApp();
    const res = await app.inject({ method: "DELETE", url: `/${EVENTO_ID}` });

    const { error }: { error: string } = res.json();
    expect(error).toContain("1 reserva");
    expect(error).not.toContain("guardarropa");
    expect(error).not.toContain("ventas de barra");
  });

  it("solo el admin puede borrar", async () => {
    const app = await construirApp("encargado");
    const res = await app.inject({ method: "DELETE", url: `/${EVENTO_ID}` });

    expect(res.statusCode).toBe(403);
    expect(mocks.prisma.evento.findFirst).not.toHaveBeenCalled();
  });
});

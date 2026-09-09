/**
 * Corte de caja.
 *
 * El diseño separa dos cosas a propósito: el que cobró **arma** el corte y
 * gerencia **declara** el efectivo real. Ese control cruzado es lo que evita
 * que un faltante se tape poniendo el número que cierra.
 *
 * Lo que se prueba acá es la otra mitad: que el corte de un cajero cuente sus
 * ventas y no las de todo el local.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

const mocks = vi.hoisted(() => ({
  prisma: {
    venta: { groupBy: vi.fn() },
    corteCaja: { create: vi.fn() },
  },
}));

vi.mock("@niagara/db", () => ({ prisma: mocks.prisma }));
vi.mock("../index.js", () => ({ io: { to: vi.fn(() => ({ emit: vi.fn() })) } }));

const { registrarRutasReportes } = await import("./reportes.js");

async function construirApp(rol: string, staffId = "staff-1"): Promise<FastifyInstance> {
  const app = Fastify();

  app.addHook("onRequest", (req, _reply, done) => {
    Object.assign(req, {
      localId: "local-1",
      staffActual: { id: staffId, rol },
    });
    done();
  });

  await app.register(registrarRutasReportes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.prisma.venta.groupBy.mockResolvedValue([
    { metodoPago: "efectivo", _sum: { total: 50000 } },
    { metodoPago: "tarjeta", _sum: { total: 20000 } },
  ]);
  mocks.prisma.corteCaja.create.mockResolvedValue({
    id: "corte-1",
    efectivoEsperado: 50000,
    ventasEfectivo: 50000,
    ventasTarjeta: 20000,
    ventasCashless: 0,
    ventasQr: 0,
    ventasCortesia: 0,
    totalVentas: 70000,
    staff: { nombre: "Ana", apellido: "Pérez" },
    barra: null,
  });
});

describe("POST /cortes — de quién es la plata", () => {
  it("el corte del cajero cuenta solo sus ventas", async () => {
    const app = await construirApp("cajero", "cajero-1");
    const res = await app.inject({ method: "POST", url: "/cortes", payload: {} });

    expect(res.statusCode).toBe(201);

    // Sin este filtro, el cajero armaba su corte con la plata de las otras
    // barras adentro y el efectivo esperado no cerraba nunca.
    const [args] = mocks.prisma.venta.groupBy.mock.calls[0] as [
      { where: { staffId?: string } },
    ];
    expect(args.where.staffId).toBe("cajero-1");
  });

  it("el corte de gerencia sigue siendo de todo el local", async () => {
    const app = await construirApp("encargado");
    await app.inject({ method: "POST", url: "/cortes", payload: {} });

    const [args] = mocks.prisma.venta.groupBy.mock.calls[0] as [
      { where: { staffId?: string } },
    ];
    expect(args.where.staffId).toBeUndefined();
  });

  it("el cajero no puede cortar la caja de otro", async () => {
    const app = await construirApp("cajero", "cajero-1");
    await app.inject({
      method: "POST",
      url: "/cortes",
      payload: { staffId: "cajero-2" },
    });

    const [args] = mocks.prisma.venta.groupBy.mock.calls[0] as [
      { where: { staffId?: string } },
    ];
    expect(args.where.staffId).toBe("cajero-1");
  });

  it("sin fechas cubre las últimas 12 horas, no desde medianoche", async () => {
    const app = await construirApp("cajero", "cajero-1");
    const antes = Date.now();
    await app.inject({ method: "POST", url: "/cortes", payload: {} });

    const [args] = mocks.prisma.venta.groupBy.mock.calls[0] as [
      { where: { createdAt: { gte: Date } } },
    ];
    const desde = args.where.createdAt.gte.getTime();

    // Una noche cruza la medianoche: con el día calendario, un corte a las 4 AM
    // dejaba afuera todo lo vendido antes de las 12.
    const horasAtras = (antes - desde) / (60 * 60 * 1000);
    expect(horasAtras).toBeGreaterThan(11.9);
    expect(horasAtras).toBeLessThan(12.1);
  });

  it("respeta las fechas cuando se las pasan", async () => {
    const app = await construirApp("encargado");
    await app.inject({
      method: "POST",
      url: "/cortes",
      payload: { fechaDesde: "2026-09-11T22:00:00.000Z" },
    });

    const [args] = mocks.prisma.venta.groupBy.mock.calls[0] as [
      { where: { createdAt: { gte: Date } } },
    ];
    expect(args.where.createdAt.gte.toISOString()).toBe("2026-09-11T22:00:00.000Z");
  });

  it("el portero no arma cortes", async () => {
    const app = await construirApp("portero");
    const res = await app.inject({ method: "POST", url: "/cortes", payload: {} });

    expect(res.statusCode).toBe(403);
    expect(mocks.prisma.corteCaja.create).not.toHaveBeenCalled();
  });
});

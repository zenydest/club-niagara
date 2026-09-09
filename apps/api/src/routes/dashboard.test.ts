/**
 * Permisos del dashboard.
 *
 * Son la razón de que existan dos dashboards: los KPIs incluyen la recaudación
 * de la noche y un RRPP entrando al panel la veía en la primera pantalla. Que
 * el sidebar esconda la sección no alcanza — la respuesta viaja igual si
 * alguien pega el endpoint a mano.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

const mocks = vi.hoisted(() => ({
  prisma: {
    evento: { findFirst: vi.fn() },
    ventaItem: { findMany: vi.fn() },
    acceso: { count: vi.fn() },
    venta: { aggregate: vi.fn(), groupBy: vi.fn() },
    entradaVendida: { aggregate: vi.fn() },
  },
}));

vi.mock("@niagara/db", () => ({ prisma: mocks.prisma }));

const { registrarRutasDashboard } = await import("./dashboard.js");

/** App con el staff ya resuelto, como lo dejaría el hook de auth de `index.ts`. */
async function construirApp(rol: string, staffId = "staff-1"): Promise<FastifyInstance> {
  const app = Fastify();

  app.addHook("onRequest", (req, _reply, done) => {
    Object.assign(req, {
      localId: "local-1",
      staffActual: { id: staffId, rol },
    });
    done();
  });

  await app.register(registrarRutasDashboard);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.prisma.evento.findFirst.mockResolvedValue(null);
  mocks.prisma.ventaItem.findMany.mockResolvedValue([]);
});

describe("GET /mi-consumo — quién puede entrar", () => {
  it.each(["cajero", "barman", "admin"])("deja entrar al %s", async (rol) => {
    const app = await construirApp(rol);
    const res = await app.inject({ method: "GET", url: "/mi-consumo" });

    expect(res.statusCode).toBe(200);
  });

  it.each(["encargado", "portero", "rrpp"])("le cierra la puerta al %s", async (rol) => {
    const app = await construirApp(rol);
    const res = await app.inject({ method: "GET", url: "/mi-consumo" });

    expect(res.statusCode).toBe(403);
    expect(mocks.prisma.ventaItem.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /mi-consumo — de quién son las ventas", () => {
  it("filtra siempre por quien pregunta, aunque manden otro staffId", async () => {
    const app = await construirApp("cajero", "cajero-propio");
    const res = await app.inject({
      method: "GET",
      url: "/mi-consumo?staffId=cajero-ajeno",
    });

    expect(res.statusCode).toBe(200);

    const [args] = mocks.prisma.ventaItem.findMany.mock.calls[0] as [
      { where: { venta: { staffId: string } } },
    ];
    expect(args.where.venta.staffId).toBe("cajero-propio");
  });

  it("no devuelve ningún total en plata", async () => {
    mocks.prisma.evento.findFirst.mockResolvedValue({ id: "evento-1", nombre: "Sábado" });
    mocks.prisma.ventaItem.findMany.mockResolvedValue([
      {
        cantidad: 2,
        ventaId: "venta-1",
        producto: { nombre: "Fernet", categoria: "Tragos", precio: 8000 },
      },
    ]);

    const app = await construirApp("barman");
    const res = await app.inject({ method: "GET", url: "/mi-consumo" });

    const cuerpo: Record<string, unknown> = res.json();

    // Unidades y ventas cerradas sí; recaudación no. Si alguna vez aparece un
    // total acá, se filtró justo lo que estas dos pantallas separan.
    expect(cuerpo).toMatchObject({ totalUnidades: 2, cantidadVentas: 1 });
    expect(cuerpo).not.toHaveProperty("total");
    expect(cuerpo).not.toHaveProperty("recaudacion");
    expect(JSON.stringify(cuerpo)).not.toContain("recaudacion");
  });
});

describe("GET /kpis — recaudación de la noche", () => {
  it.each(["encargado", "cajero", "barman", "portero", "rrpp"])(
    "no se la muestra al %s",
    async (rol) => {
      const app = await construirApp(rol);
      const res = await app.inject({ method: "GET", url: "/kpis" });

      expect(res.statusCode).toBe(403);
    }
  );
});

/**
 * Reserva de cupo en la venta pública de entradas.
 *
 * Lo que se prueba acá es el control de flujo: que sin cupo no se cree ninguna
 * entrada, que el guard SQL salga con los parámetros correctos y que el corte
 * temprano no abra una transacción al pedo.
 *
 * Lo que **no** se prueba acá es la atomicidad: que dos compras simultáneas se
 * serialicen es una propiedad de Postgres, y con Prisma mockeado el `$executeRaw`
 * es una función que devuelve lo que le digamos. Eso necesita una base de verdad.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";

const mocks = vi.hoisted(() => {
  const emit = vi.fn();

  return {
    emit,
    prisma: {
      entradaTipo: { findFirst: vi.fn(), findUnique: vi.fn() },
      staff: { findFirst: vi.fn() },
      $transaction: vi.fn(),
    },
    io: { to: vi.fn(() => ({ emit })) },
    crearPreferenciaEntradas: vi.fn(),
    // El cliente de transacción que recibe el callback de `$transaction`.
    tx: {
      $executeRaw: vi.fn(),
      entradaVendida: { create: vi.fn() },
    },
  };
});

vi.mock("@niagara/db", () => ({ prisma: mocks.prisma }));
// `index.ts` levanta el servidor HTTP al importarse; acá solo hace falta `io`.
vi.mock("../index.js", () => ({ io: mocks.io }));
vi.mock("../lib/mpCheckout.js", () => ({
  crearPreferenciaEntradas: mocks.crearPreferenciaEntradas,
}));

const { registrarRutasPublico } = await import("./publico.js");

const ENTRADA_TIPO_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

/** Tanda de entradas con cupo, tal como la devuelve el `findFirst` de la ruta. */
function tandaConCupo(overrides: Partial<Record<string, unknown>> = {}) {
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
});

describe("POST /comprar — reserva de cupo", () => {
  it("no crea ninguna entrada si otra compra se llevó el último lugar", async () => {
    // El pre-chequeo ve cupo, pero para cuando corre el UPDATE ya no queda:
    // es exactamente la ventana donde antes se sobrevendía.
    mocks.prisma.entradaTipo.findFirst.mockResolvedValue(
      tandaConCupo({ cantidadTotal: 100, cantidadVendida: 99 })
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
      payload: cuerpoCompra(1),
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: "Se agotaron", disponibles: 0 });
    expect(mocks.tx.entradaVendida.create).not.toHaveBeenCalled();
    // Sin entradas creadas tampoco hay que avisarle al panel.
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it("crea una entrada por unidad cuando el cupo alcanza", async () => {
    mocks.prisma.entradaTipo.findFirst.mockResolvedValue(tandaConCupo());
    mocks.tx.$executeRaw.mockResolvedValue(1);

    const app = await construirApp();
    const res = await app.inject({
      method: "POST",
      url: "/comprar",
      payload: cuerpoCompra(3),
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ linkPago: "https://mp/checkout" });
    expect(mocks.tx.entradaVendida.create).toHaveBeenCalledTimes(3);
  });

  it("deja pasar la compra cuando la tanda no tiene tope", async () => {
    mocks.prisma.entradaTipo.findFirst.mockResolvedValue(
      tandaConCupo({ cantidadTotal: null, cantidadVendida: 5000 })
    );
    mocks.tx.$executeRaw.mockResolvedValue(1);

    const app = await construirApp();
    const res = await app.inject({
      method: "POST",
      url: "/comprar",
      payload: cuerpoCompra(2),
    });

    expect(res.statusCode).toBe(201);
    expect(mocks.tx.entradaVendida.create).toHaveBeenCalledTimes(2);
  });

  it("corta antes de abrir la transacción si la tanda ya estaba agotada", async () => {
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
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("manda al UPDATE la cantidad pedida y el id de la tanda", async () => {
    mocks.prisma.entradaTipo.findFirst.mockResolvedValue(tandaConCupo());
    mocks.tx.$executeRaw.mockResolvedValue(1);

    const app = await construirApp();
    await app.inject({ method: "POST", url: "/comprar", payload: cuerpoCompra(4) });

    // `$executeRaw` es un template tag: (strings, ...valores). El orden de los
    // valores es el del SQL: incremento, id, y el mismo incremento en el AND.
    const [, ...valores] = mocks.tx.$executeRaw.mock.calls[0] as unknown[];
    expect(valores).toEqual([4, ENTRADA_TIPO_ID, 4]);
  });

  it("rechaza el evento que no está a la venta sin tocar el cupo", async () => {
    mocks.prisma.entradaTipo.findFirst.mockResolvedValue(
      tandaConCupo({ evento: { id: "evento-1", nombre: "Sábado", estado: "finalizado" } })
    );

    const app = await construirApp();
    const res = await app.inject({
      method: "POST",
      url: "/comprar",
      payload: cuerpoCompra(1),
    });

    expect(res.statusCode).toBe(409);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});

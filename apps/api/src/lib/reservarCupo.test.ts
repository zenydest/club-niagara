/**
 * Reserva de lugares.
 *
 * Se prueba la orquestación: que bloquee el evento cuando corresponde, que no
 * lo bloquee cuando no, y que explique bien por qué rechazó. Que el UPDATE sea
 * atómico es de Postgres y no se ve con Prisma mockeado.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    entradaTipo: { findUnique: vi.fn(), aggregate: vi.fn() },
  },
}));

vi.mock("@niagara/db", () => ({ prisma: mocks.prisma }));

const { reservarCupo, mensajeRechazoCupo } = await import("./reservarCupo.js");

const TIPO_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const EVENTO_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3302";

function crearTx(ocupaLugar = true) {
  return {
    entradaTipo: {
      findUnique: vi.fn().mockResolvedValue({ eventoId: EVENTO_ID, ocupaLugar }),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ id: EVENTO_ID }]),
    $executeRaw: vi.fn(),
  };
}

type Tx = ReturnType<typeof crearTx>;

/** `reservarCupo` recibe un TransactionClient de Prisma; acá alcanza el doble. */
function comoTx(tx: Tx) {
  return tx as unknown as Parameters<typeof reservarCupo>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reservarCupo", () => {
  it("reserva cuando hay lugar", async () => {
    const tx = crearTx();
    tx.$executeRaw.mockResolvedValue(1);

    const res = await reservarCupo(comoTx(tx), TIPO_ID, 2);

    expect(res.ok).toBe(true);
  });

  it("bloquea la fila del evento cuando el tipo ocupa lugar", async () => {
    const tx = crearTx(true);
    tx.$executeRaw.mockResolvedValue(1);

    await reservarCupo(comoTx(tx), TIPO_ID, 1);

    // Sin este lock, dos compras de tipos distintos leen la misma suma de
    // ocupados y pasan las dos: la capacidad compartida se sobrevende.
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = (tx.$queryRaw.mock.calls[0]?.[0] as string[]).join("");
    expect(sql).toContain("FOR UPDATE");
  });

  it("no bloquea el evento cuando el tipo no ocupa lugar", async () => {
    const tx = crearTx(false);
    tx.$executeRaw.mockResolvedValue(1);

    await reservarCupo(comoTx(tx), TIPO_ID, 1);

    // El transporte se vende aunque el salón esté lleno: no tiene por qué
    // hacer cola detrás de las ventas de entradas.
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it("manda al UPDATE la cantidad y el id del tipo", async () => {
    const tx = crearTx();
    tx.$executeRaw.mockResolvedValue(1);

    await reservarCupo(comoTx(tx), TIPO_ID, 4);

    const [, ...valores] = tx.$executeRaw.mock.calls[0] as unknown[];
    expect(valores).toEqual([4, TIPO_ID, 4, 4]);
  });

  it("cuando se llenó el tipo, lo dice y devuelve lo que queda en el tipo", async () => {
    const tx = crearTx();
    tx.$executeRaw.mockResolvedValue(0);
    mocks.prisma.entradaTipo.findUnique.mockResolvedValue({
      cantidadTotal: 100,
      cantidadVendida: 98,
      ocupaLugar: true,
      eventoId: EVENTO_ID,
      evento: { capacidad: 300 },
    });

    const res = await reservarCupo(comoTx(tx), TIPO_ID, 5);

    expect(res).toEqual({ ok: false, motivo: "sin_cupo_en_el_tipo", disponibles: 2 });
    expect(mensajeRechazoCupo({ motivo: "sin_cupo_en_el_tipo", disponibles: 2 })).toBe(
      "Quedan solo 2"
    );
  });

  it("cuando el tipo tiene lugar pero el salón no, culpa al salón", async () => {
    const tx = crearTx();
    tx.$executeRaw.mockResolvedValue(0);
    // El tipo tiene 200 de tope y vendió 10: por su cuenta entraría.
    mocks.prisma.entradaTipo.findUnique.mockResolvedValue({
      cantidadTotal: 200,
      cantidadVendida: 10,
      ocupaLugar: true,
      eventoId: EVENTO_ID,
      evento: { capacidad: 300 },
    });
    // Pero entre todos los tipos que ocupan lugar ya hay 298 de 300.
    mocks.prisma.entradaTipo.aggregate.mockResolvedValue({
      _sum: { cantidadVendida: 298 },
    });

    const res = await reservarCupo(comoTx(tx), TIPO_ID, 5);

    expect(res).toEqual({ ok: false, motivo: "evento_lleno", disponibles: 2 });
    expect(mensajeRechazoCupo({ motivo: "evento_lleno", disponibles: 2 })).toBe(
      "Quedan solo 2 lugares para este evento"
    );
  });

  it("con el salón lleno del todo avisa que no quedan lugares", async () => {
    const tx = crearTx();
    tx.$executeRaw.mockResolvedValue(0);
    mocks.prisma.entradaTipo.findUnique.mockResolvedValue({
      cantidadTotal: null,
      cantidadVendida: 150,
      ocupaLugar: true,
      eventoId: EVENTO_ID,
      evento: { capacidad: 300 },
    });
    mocks.prisma.entradaTipo.aggregate.mockResolvedValue({
      _sum: { cantidadVendida: 300 },
    });

    const res = await reservarCupo(comoTx(tx), TIPO_ID, 1);

    expect(res).toEqual({ ok: false, motivo: "evento_lleno", disponibles: 0 });
    expect(mensajeRechazoCupo({ motivo: "evento_lleno", disponibles: 0 })).toBe(
      "No quedan lugares para este evento"
    );
  });
});

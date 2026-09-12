/**
 * Webhook de pagos de Mercado Pago.
 *
 * Es lo que convierte "alguien pagó" en "esta entrada vale". Si falla, la
 * persona paga, el dinero entra, y en la puerta la entrada figura impaga.
 *
 * Los modos de falla que se cubren acá son los silenciosos: que se marquen
 * entradas por un pago que no fue aprobado, que un reintento de MP vuelva a
 * tocar entradas ya confirmadas, y que sin token configurado el webhook no
 * haga nada sin decirlo.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { createHmac } from "node:crypto";

const SECRETO = "secreto-webhook";
const PAYMENT_ID = "123456789";
const REQUEST_ID = "req-abc";
const REFERENCIA = "ref-de-la-compra";

const mocks = vi.hoisted(() => ({
  prisma: {
    entradaVendida: { updateMany: vi.fn() },
  },
  consultarPago: vi.fn(),
  tokenMP: vi.fn(),
  envLimpio: vi.fn(),
}));

vi.mock("@niagara/db", () => ({ prisma: mocks.prisma }));
vi.mock("../lib/env.js", () => ({
  tokenMP: mocks.tokenMP,
  envLimpio: mocks.envLimpio,
}));
vi.mock("../lib/mpCheckout.js", () => ({
  consultarPago: mocks.consultarPago,
  crearPreferenciaMP: vi.fn(),
}));

const { registrarRutasMP } = await import("./mp.js");

function firmar(ts: string, dataId = PAYMENT_ID, requestId = REQUEST_ID): string {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  return createHmac("sha256", SECRETO).update(manifest).digest("hex");
}

async function construirApp() {
  const app = Fastify();
  await app.register(registrarRutasMP);
  return app;
}

/** Notificación de pago tal como la manda MP, con firma válida. */
async function notificar(
  app: Awaited<ReturnType<typeof construirApp>>,
  opciones: { firma?: string; tipo?: string } = {}
) {
  const ts = "1704908010";

  return app.inject({
    method: "POST",
    url: "/webhook",
    headers: {
      "x-signature": opciones.firma ?? `ts=${ts},v1=${firmar(ts)}`,
      "x-request-id": REQUEST_ID,
    },
    payload: { type: opciones.tipo ?? "payment", data: { id: PAYMENT_ID } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.tokenMP.mockReturnValue("APP_USR-token");
  mocks.envLimpio.mockReturnValue(SECRETO);
  mocks.prisma.entradaVendida.updateMany.mockResolvedValue({ count: 2 });
  mocks.consultarPago.mockResolvedValue({
    status: "approved",
    external_reference: REFERENCIA,
  });
});

describe("POST /webhook", () => {
  it("habilita las entradas cuando el pago está aprobado", async () => {
    const app = await construirApp();
    const res = await notificar(app);

    expect(res.statusCode).toBe(200);

    const [args] = mocks.prisma.entradaVendida.updateMany.mock.calls[0] as [
      { where: Record<string, unknown>; data: Record<string, unknown> },
    ];
    expect(args.where).toMatchObject({ mpPreferenceId: REFERENCIA, pagada: false });
    expect(args.data).toMatchObject({ pagada: true, mpPaymentId: PAYMENT_ID });
  });

  it("solo toca entradas impagas, para que el reintento de MP no haga nada", async () => {
    // MP reintenta los webhooks. Sin `pagada: false` en el where, cada reintento
    // volvería a escribir sobre entradas ya confirmadas.
    const app = await construirApp();
    await notificar(app);

    const [args] = mocks.prisma.entradaVendida.updateMany.mock.calls[0] as [
      { where: { pagada: boolean } },
    ];
    expect(args.where.pagada).toBe(false);
  });

  it("no habilita nada si el pago no fue aprobado", async () => {
    mocks.consultarPago.mockResolvedValue({
      status: "rejected",
      external_reference: REFERENCIA,
    });

    const app = await construirApp();
    const res = await notificar(app);

    expect(res.statusCode).toBe(200);
    expect(mocks.prisma.entradaVendida.updateMany).not.toHaveBeenCalled();
  });

  it("no le cree al payload: le vuelve a preguntar a MP", async () => {
    // El cuerpo del webhook no dice si el pago se aprobó; se consulta aparte.
    const app = await construirApp();
    await notificar(app);

    expect(mocks.consultarPago).toHaveBeenCalledWith(PAYMENT_ID);
  });

  it("rechaza la notificación con firma inválida", async () => {
    const app = await construirApp();
    const res = await notificar(app, { firma: "ts=1704908010,v1=firmafalsa" });

    expect(res.statusCode).toBe(401);
    expect(mocks.consultarPago).not.toHaveBeenCalled();
    expect(mocks.prisma.entradaVendida.updateMany).not.toHaveBeenCalled();
  });

  it("ignora las notificaciones que no son de pago", async () => {
    const app = await construirApp();
    const res = await notificar(app, { tipo: "plan" });

    expect(res.statusCode).toBe(200);
    expect(mocks.consultarPago).not.toHaveBeenCalled();
  });

  it("sin MP_ACCESS_TOKEN no habilita nada", async () => {
    /**
     * `modoReal()` es `tokenMP() !== undefined`. Sin token el webhook responde
     * 200 y no hace nada: para MP la notificación quedó entregada, y las
     * entradas siguen impagas para siempre. Es el modo de falla más peligroso
     * porque no deja rastro de error.
     */
    mocks.tokenMP.mockReturnValue(undefined);

    const app = await construirApp();
    const res = await notificar(app);

    expect(res.statusCode).toBe(200);
    expect(mocks.prisma.entradaVendida.updateMany).not.toHaveBeenCalled();
  });

  it("sigue respondiendo 200 si falla la consulta a MP", async () => {
    // Si se respondiera un error, MP reintenta en loop. El error se loguea.
    mocks.consultarPago.mockRejectedValue(new Error("MP caído"));

    const app = await construirApp();
    const res = await notificar(app);

    expect(res.statusCode).toBe(200);
  });
});

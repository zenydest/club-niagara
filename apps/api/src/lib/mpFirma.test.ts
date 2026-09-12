/**
 * Firma de los webhooks de Mercado Pago.
 *
 * Es el punto que falla callado: si el manifest se arma distinto de como lo
 * firma MP, las notificaciones reales llegan bien y la API las rechaza todas
 * con 401. Nadie ve un error — simplemente ninguna entrada se marca pagada, y
 * el problema aparece en la puerta con el comprobante de pago en la mano.
 *
 * Por eso el manifest se escribe a mano en cada test en vez de pedírselo a la
 * implementación: si alguien cambia el formato, estos tests fallan. Calcularlo
 * con la misma función que se está probando no demostraría nada.
 */

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { firmaValida } from "./mpFirma.js";

const SECRETO = "un-secreto-de-webhook";
const DATA_ID = "123456789";
const REQUEST_ID = "bc3f6e2a-0c2f-4a1b-9d2e-1f0a5c8e7b3d";
const TS = "1704908010";

/** El manifest tal como lo documenta MP, escrito literal a propósito. */
function firmar(
  secreto: string,
  dataId: string,
  requestId: string,
  ts: string
): string {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  return createHmac("sha256", secreto).update(manifest).digest("hex");
}

function cabeceras(v1: string, ts = TS, requestId: string | undefined = REQUEST_ID) {
  return { signature: `ts=${ts},v1=${v1}`, requestId };
}

describe("firmaValida", () => {
  it("acepta la firma que arma Mercado Pago", () => {
    const v1 = firmar(SECRETO, DATA_ID, REQUEST_ID, TS);

    expect(firmaValida(SECRETO, cabeceras(v1), DATA_ID)).toBe(true);
  });

  it("rechaza la firma hecha con otro secreto", () => {
    const v1 = firmar("secreto-de-otro", DATA_ID, REQUEST_ID, TS);

    expect(firmaValida(SECRETO, cabeceras(v1), DATA_ID)).toBe(false);
  });

  it("rechaza si el pago no es el que se firmó", () => {
    // Sin esto, una notificación firmada para un pago sirve para confirmar
    // cualquier otro.
    const v1 = firmar(SECRETO, DATA_ID, REQUEST_ID, TS);

    expect(firmaValida(SECRETO, cabeceras(v1), "987654321")).toBe(false);
  });

  it("rechaza si cambia el timestamp", () => {
    const v1 = firmar(SECRETO, DATA_ID, REQUEST_ID, TS);

    expect(firmaValida(SECRETO, cabeceras(v1, "1704908099"), DATA_ID)).toBe(false);
  });

  it("rechaza si cambia el request-id", () => {
    const v1 = firmar(SECRETO, DATA_ID, REQUEST_ID, TS);

    expect(firmaValida(SECRETO, cabeceras(v1, TS, "otro-request-id"), DATA_ID)).toBe(
      false
    );
  });

  it("sin header de firma no valida", () => {
    expect(
      firmaValida(SECRETO, { signature: undefined, requestId: REQUEST_ID }, DATA_ID)
    ).toBe(false);
  });

  it("con un header sin v1 no valida", () => {
    expect(
      firmaValida(SECRETO, { signature: `ts=${TS}`, requestId: REQUEST_ID }, DATA_ID)
    ).toBe(false);
  });

  it("con un header con basura no valida", () => {
    expect(
      firmaValida(SECRETO, { signature: "cualquier cosa", requestId: REQUEST_ID }, DATA_ID)
    ).toBe(false);
  });

  it("tolera espacios alrededor de los valores", () => {
    // MP manda "ts=..., v1=..." con un espacio después de la coma.
    const v1 = firmar(SECRETO, DATA_ID, REQUEST_ID, TS);

    expect(
      firmaValida(SECRETO, { signature: `ts=${TS}, v1=${v1}`, requestId: REQUEST_ID }, DATA_ID)
    ).toBe(true);
  });

  it("sin x-request-id firma con el segmento vacío", () => {
    /**
     * Documenta el comportamiento actual, que es el riesgo real: si alguna
     * notificación llegara sin `x-request-id`, acá se firma `request-id:;` y
     * MP —que arma el manifest sin ese segmento— no coincidiría.
     *
     * En la práctica MP siempre manda el header. Si algún día aparece un 401
     * inexplicable en los logs, este es el primer lugar donde mirar.
     */
    const conSegmentoVacio = firmar(SECRETO, DATA_ID, "", TS);

    expect(
      firmaValida(SECRETO, { signature: `ts=${TS},v1=${conSegmentoVacio}`, requestId: undefined }, DATA_ID)
    ).toBe(true);
  });
});

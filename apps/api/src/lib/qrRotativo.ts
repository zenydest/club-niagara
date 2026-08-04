/**
 * Cálculo y validación del código rotativo del QR, lado servidor.
 * La lógica compartida con la app vive en `@niagara/core` (carpeta qr).
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  codigoDesdeHash,
  materialParaHash,
  ventanasAceptables,
} from "@niagara/core";

/** Secreto nuevo para una entrada. 32 bytes en hex. */
export function generarSecretoQR(): string {
  return randomBytes(32).toString("hex");
}

/** Código rotativo para una ventana concreta. */
export function codigoParaVentana(secreto: string, ventana: number): string {
  const hash = createHash("sha256")
    .update(materialParaHash(ventana, secreto))
    .digest("hex");

  return codigoDesdeHash(hash);
}

/**
 * ¿El código presentado es válido ahora?
 *
 * Se prueban las ventanas aceptables y se compara en tiempo constante, para no
 * filtrar información por cuánto tarda la comparación.
 */
export function codigoValido(
  secreto: string,
  codigoPresentado: string,
  ahora: number = Date.now()
): boolean {
  const presentado = Buffer.from(codigoPresentado.trim().toLowerCase(), "utf8");

  return ventanasAceptables(ahora).some((ventana) => {
    const esperado = Buffer.from(codigoParaVentana(secreto, ventana), "utf8");
    return (
      esperado.length === presentado.length && timingSafeEqual(esperado, presentado)
    );
  });
}

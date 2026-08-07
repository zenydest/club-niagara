/**
 * Verificación de la firma `x-signature` de los webhooks de Mercado Pago.
 *
 * Vive acá y no dentro de una ruta porque hay dos endpoints que reciben
 * notificaciones —Point y pagos— y los dos tienen que validar igual. Cuando
 * esto estaba duplicado, uno validaba y el otro no.
 *
 * Sin verificación, un webhook de pagos es un endpoint público: cualquiera que
 * conozca la URL puede avisar que un cobro se aprobó.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface CabecerasFirma {
  // `| undefined` explícito: los headers de Fastify pueden faltar y con
  // exactOptionalPropertyTypes omitir la clave no es lo mismo que pasarla vacía.
  signature: string | undefined;
  requestId: string | undefined;
}

/**
 * El manifest que MP firma es `id:<dataId>;request-id:<xRequestId>;ts:<ts>;`
 * con HMAC-SHA256 y el secreto del webhook.
 */
export function firmaValida(
  secreto: string,
  cabeceras: CabecerasFirma,
  dataId: string
): boolean {
  if (!cabeceras.signature) return false;

  // Formato: "ts=1704908010,v1=618c85345248dd820d5fd456117c2ab2ef8c1aa1..."
  const partes = new Map<string, string>(
    cabeceras.signature.split(",").map((p): [string, string] => {
      const [k, v] = p.split("=");
      return [k?.trim() ?? "", v?.trim() ?? ""];
    })
  );

  const ts = partes.get("ts");
  const v1 = partes.get("v1");
  if (!ts || !v1) return false;

  const manifest = `id:${dataId};request-id:${cabeceras.requestId ?? ""};ts:${ts};`;
  const esperado = createHmac("sha256", secreto).update(manifest).digest("hex");

  // Comparación de tiempo constante: comparar con `===` filtra información
  // sobre el hash esperado a través de cuánto tarda en fallar.
  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(v1, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Lee el secreto del webhook, limpio de comillas y espacios. */
export function secretoWebhook(): string | undefined {
  const crudo = process.env["MP_WEBHOOK_SECRET"]?.trim().replace(/^["']|["']$/g, "");
  return crudo ? crudo : undefined;
}

/**
 * Checkout Pro — pago online de entradas desde la app.
 *
 * El cliente elige su entrada, se le abre el checkout de Mercado Pago en el
 * navegador y paga. La entrada se crea antes, impaga; recién cuando MP avisa
 * por webhook que el pago se aprobó, se marca como pagada.
 *
 * Ese orden es a propósito: que exista la entrada no significa que la plata
 * haya entrado. Si se marcaran pagadas al crearlas, cualquiera que abriera el
 * checkout y lo cerrara entraría gratis.
 */

import { randomUUID } from "node:crypto";

const MP_BASE_URL = "https://api.mercadopago.com";

export class MPCheckoutError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "MPCheckoutError";
  }
}

function tokenMP(): string | undefined {
  const crudo = process.env["MP_ACCESS_TOKEN"]?.trim().replace(/^["']|["']$/g, "");
  return crudo ? crudo : undefined;
}

export function checkoutConfigurado(): boolean {
  return tokenMP() !== undefined;
}

/** Primera URL de FRONTEND_URLS: es a donde vuelve el cliente al terminar. */
function urlFrontend(): string | null {
  const urls = process.env["FRONTEND_URLS"]?.split(",").map((u) => u.trim());
  return urls?.[0] ?? null;
}

interface PreferenciaMP {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
}

/**
 * Crea la preferencia de pago y devuelve el link para abrir el checkout.
 *
 * `referencia` viaja como `external_reference` y es lo que después permite,
 * desde el webhook, encontrar qué entradas corresponden a este pago. Sin eso,
 * llega el aviso de que se pagó y no hay forma de saber qué habilitar.
 */
export async function crearPreferenciaEntradas(input: {
  referencia: string;
  descripcion: string;
  precioUnitario: number;
  cantidad: number;
  emailComprador?: string;
}): Promise<{ preferenciaId: string; linkPago: string }> {
  const token = tokenMP();
  if (!token) {
    throw new MPCheckoutError("MP_ACCESS_TOKEN no configurado", 503);
  }

  const frontend = urlFrontend();

  const res = await fetch(`${MP_BASE_URL}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      // Evita duplicar la preferencia si el cliente toca dos veces.
      "X-Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify({
      items: [
        {
          title: input.descripcion,
          quantity: input.cantidad,
          currency_id: "ARS",
          unit_price: input.precioUnitario,
        },
      ],
      external_reference: input.referencia,
      ...(input.emailComprador && { payer: { email: input.emailComprador } }),
      ...(frontend && {
        back_urls: {
          success: `${frontend}/pago-ok`,
          failure: `${frontend}/pago-error`,
          pending: `${frontend}/pago-pendiente`,
        },
      }),
      // La entrada se habilita por webhook, no por la vuelta del navegador: si
      // el cliente cierra la pestaña antes de volver, el pago igual se procesa.
      binary_mode: true,
    }),
  });

  const texto = await res.text();

  let cuerpo: unknown = null;
  if (texto) {
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      cuerpo = null;
    }
  }

  if (!res.ok) {
    const detalle =
      typeof cuerpo === "object" && cuerpo !== null && "message" in cuerpo
        ? String(cuerpo.message)
        : texto.slice(0, 300);

    // El caso más habitual la primera vez: la aplicación de MP se creó como
    // "pagos presenciales" (Point) y no tiene habilitado el checkout online.
    const ayuda =
      res.status === 400 || res.status === 403
        ? " — puede que la aplicación de Mercado Pago no tenga habilitado el " +
          "checkout online. Se configura en Tus integraciones."
        : "";

    throw new MPCheckoutError(`MP ${res.status}: ${detalle}${ayuda}`, res.status);
  }

  const pref = cuerpo as PreferenciaMP;
  const link = pref.init_point ?? pref.sandbox_init_point;

  if (!link) {
    throw new MPCheckoutError("Mercado Pago no devolvió el link de pago", 502);
  }

  return { preferenciaId: pref.id, linkPago: link };
}

/** Consulta un pago para saber su estado real, sin confiar en el webhook. */
export async function consultarPago(paymentId: string): Promise<{
  status?: string;
  external_reference?: string;
  transaction_amount?: number;
}> {
  const token = tokenMP();
  if (!token) throw new MPCheckoutError("MP_ACCESS_TOKEN no configurado", 503);

  const res = await fetch(`${MP_BASE_URL}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new MPCheckoutError(`MP ${res.status} al consultar el pago`, res.status);
  }

  return (await res.json()) as {
    status?: string;
    external_reference?: string;
    transaction_amount?: number;
  };
}

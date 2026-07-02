/**
 * Integración con Mercado Pago.
 * Prefix: /api/mp
 *
 * MODO ACTUAL: placeholder — simula la respuesta de MP.
 * Para activar MP real, setear la variable de entorno:
 *   MP_ACCESS_TOKEN=APP_USR-...
 *
 * Docs MP: https://www.mercadopago.com.ar/developers/es/docs/qr-code/integration-configuration/qr-dynamic/integration
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const MP_ACCESS_TOKEN = process.env["MP_ACCESS_TOKEN"];
const MP_MODO_REAL = Boolean(MP_ACCESS_TOKEN);

// ── Schemas ──────────────────────────────────────────────────────

const preferenciaSchema = z.object({
  monto: z.number().positive(),
  descripcion: z.string().min(1).max(200).default("Consumición Club Niágara"),
  referencia: z.string().optional(), // ID interno (ventaId, recargaId)
});

// ── Helper: crear preferencia de pago en MP ───────────────────────

interface MPPreferenciaResponse {
  id: string;
  init_point?: string;
  qr_data?: string;
  simulado?: boolean;
}

async function crearPreferenciaMP(monto: number, descripcion: string, referencia?: string): Promise<MPPreferenciaResponse> {
  if (!MP_MODO_REAL) {
    // Respuesta simulada para desarrollo
    return {
      id: `MOCK-${Date.now()}`,
      init_point: `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=MOCK`,
      // QR Data: en MP real esto sería un string para generar el QR
      qr_data: `00020101021243650016COM.MERCADOLIBRE020130https://mpago.la/MOCK-${Date.now()}5204000053032065802AR5909Club Nig6009BSAS630457D4`,
      simulado: true,
    };
  }

  // Llamada real a la API de MP
  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": referencia ?? `niagara-${Date.now()}`,
    },
    body: JSON.stringify({
      items: [
        {
          title: descripcion,
          quantity: 1,
          currency_id: "ARS",
          unit_price: monto,
        },
      ],
      external_reference: referencia,
      back_urls: {
        success: `${process.env["FRONTEND_URLS"]?.split(",")[0] ?? ""}/cashless?estado=ok`,
        failure: `${process.env["FRONTEND_URLS"]?.split(",")[0] ?? ""}/cashless?estado=error`,
      },
      auto_return: "approved",
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as unknown;
    throw new Error(`Error MP: ${JSON.stringify(err)}`);
  }

  return response.json() as Promise<MPPreferenciaResponse>;
}

// ── Rutas ────────────────────────────────────────────────────────

export const registrarRutasMP: FastifyPluginAsync = async (app) => {

  // GET /api/mp/estado — info sobre la integración MP
  app.get("/estado", async () => {
    return {
      configurado: MP_MODO_REAL,
      modo: MP_MODO_REAL ? "produccion" : "simulado",
      mensaje: MP_MODO_REAL
        ? "Mercado Pago configurado y listo"
        : "MP en modo simulado. Configurar MP_ACCESS_TOKEN para pagos reales.",
    };
  });

  // POST /api/mp/preferencia — crear preferencia y obtener datos para QR
  app.post("/preferencia", async (req, reply) => {
    const { staffActual } = req;

    // Solo roles que pueden cobrar
    if (!["admin", "encargado", "cajero", "barman"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos" });
    }

    const body = preferenciaSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    try {
      const preferencia = await crearPreferenciaMP(
        body.data.monto,
        body.data.descripcion,
        body.data.referencia
      );

      return {
        preferenciaId: preferencia.id,
        qrData: preferencia.qr_data ?? null,
        initPoint: preferencia.init_point ?? null,
        simulado: preferencia.simulado ?? false,
      };
    } catch (err) {
      return reply.status(502).send({
        error: "Error al crear preferencia de pago",
        detalle: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // POST /api/mp/webhook — notificaciones de pago de MP (IPN)
  // MP llama a esta URL cuando un pago es aprobado/rechazado
  app.post("/webhook", async (req, reply) => {
    const body = req.body as {
      type?: string;
      data?: { id?: string };
      action?: string;
    };

    app.log.info({ webhook: body }, "Webhook MP recibido");

    // Solo procesar pagos aprobados
    if (body.type !== "payment" && body.action !== "payment.created") {
      return reply.status(200).send({ ok: true });
    }

    const paymentId = body.data?.id;
    if (!paymentId) {
      return reply.status(200).send({ ok: true });
    }

    if (MP_MODO_REAL) {
      try {
        // Consultar el pago en MP para verificar estado
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
        });
        const pago = await mpRes.json() as {
          status?: string;
          external_reference?: string;
          transaction_amount?: number;
        };

        app.log.info({ pago }, "Pago MP consultado");

        if (pago.status === "approved") {
          // TODO: actualizar recarga/venta con mpPaymentId y marcar como synced
          // La lógica depende del external_reference (ventaId o recargaId)
          app.log.info({ paymentId, ref: pago.external_reference }, "Pago aprobado");
        }
      } catch (err) {
        app.log.error({ err }, "Error consultando pago MP");
      }
    }

    // MP espera 200 para confirmar recepción del webhook
    return reply.status(200).send({ ok: true });
  });
};

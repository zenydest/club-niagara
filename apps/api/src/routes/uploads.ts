/**
 * Subida de imágenes — firma para Cloudinary.
 * Prefix: /api/uploads
 *
 *   GET /firma?carpeta=eventos   — datos firmados para subir desde el navegador
 *   GET /estado                  — si las credenciales están cargadas
 *
 * El archivo NO pasa por esta API: el navegador lo manda directo a Cloudinary.
 * La API solo firma el pedido. Dos razones:
 *
 *   1. El API secret nunca sale del servidor. Si firmáramos desde el frontend
 *      habría que exponerlo, y con eso cualquiera sube lo que quiera a la
 *      cuenta del cliente.
 *   2. Render en plan free tiene poca memoria. Proxear archivos de varios MB
 *      por la API es la forma más rápida de tumbarla.
 */

import type { FastifyPluginAsync } from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";

/** Carpetas permitidas. Es una lista blanca a propósito: el nombre de la
 *  carpeta va firmado, así que si lo dejáramos libre el cliente podría
 *  escribir en cualquier lado de la cuenta de Cloudinary. */
const CARPETAS = {
  eventos: "club-niagara/eventos",
  productos: "club-niagara/productos",
} as const;

type Carpeta = keyof typeof CARPETAS;

interface CredencialesCloudinary {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

function leerCredenciales(): CredencialesCloudinary | null {
  const cloudName = process.env["CLOUDINARY_CLOUD_NAME"];
  const apiKey = process.env["CLOUDINARY_API_KEY"];
  const apiSecret = process.env["CLOUDINARY_API_SECRET"];

  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret };
}

/**
 * Firma al estilo Cloudinary: los parámetros que se van a enviar, ordenados
 * alfabéticamente por clave, unidos con `&` como querystring, con el api_secret
 * pegado al final, y todo eso en SHA-1.
 *
 * `file` y `api_key` quedan afuera porque Cloudinary no los incluye en la
 * firma. Si se agrega algún parámetro nuevo al upload (por ejemplo `eager`),
 * también tiene que entrar acá o Cloudinary rechaza el pedido con 401.
 */
function firmar(params: Record<string, string>, apiSecret: string): string {
  const aFirmar = Object.keys(params)
    .sort()
    .map((clave) => `${clave}=${params[clave]}`)
    .join("&");

  return createHash("sha1").update(aFirmar + apiSecret).digest("hex");
}

export const registrarRutasUploads: FastifyPluginAsync = async (app) => {

  /** GET /api/uploads/estado — para que el panel sepa si ofrecer la subida. */
  app.get("/estado", async () => {
    return { configurado: leerCredenciales() !== null };
  });

  /**
   * GET /api/uploads/firma?carpeta=eventos
   *
   * Devuelve todo lo que el navegador necesita para hacer el POST a Cloudinary.
   * La firma vale un rato corto: Cloudinary rechaza timestamps viejos, así que
   * hay que pedirla justo antes de subir y no guardarla.
   */
  app.get("/firma", async (req, reply) => {
    const { staffActual } = req;

    if (!["admin", "encargado"].includes(staffActual.rol)) {
      return reply.status(403).send({ error: "Sin permisos para subir imágenes" });
    }

    const credenciales = leerCredenciales();
    if (!credenciales) {
      return reply.status(503).send({
        error:
          "Cloudinary no está configurado. Cargá CLOUDINARY_CLOUD_NAME, " +
          "CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en el servidor. " +
          "Mientras tanto se puede pegar la URL de una imagen.",
      });
    }

    const query = z.object({
      carpeta: z.enum(Object.keys(CARPETAS) as [Carpeta, ...Carpeta[]]).default("eventos"),
    }).safeParse(req.query);

    if (!query.success) {
      return reply.status(400).send({ error: "Carpeta inválida" });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = CARPETAS[query.data.carpeta];

    const params: Record<string, string> = {
      folder,
      timestamp: String(timestamp),
    };

    return {
      cloudName: credenciales.cloudName,
      apiKey: credenciales.apiKey,
      timestamp,
      folder,
      firma: firmar(params, credenciales.apiSecret),
    };
  });
};

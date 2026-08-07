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

function limpiar(valor: string | undefined): string | undefined {
  const crudo = valor?.trim().replace(/^["']|["']$/g, "");
  return crudo ? crudo : undefined;
}

/**
 * Lee `CLOUDINARY_URL`, que es el formato que da el panel de Cloudinary:
 *
 *   cloudinary://API_KEY:API_SECRET@CLOUD_NAME
 *
 * Se prefiere sobre las tres variables sueltas porque viene de una sola pieza:
 * copiando esa línea es imposible mezclar la key de una credencial con el
 * secret de otra, que es justo el error que hace fallar la firma con un
 * "Invalid Signature" que parece un bug del código.
 */
function credencialesDesdeUrl(): CredencialesCloudinary | null {
  const url = limpiar(process.env["CLOUDINARY_URL"]);
  if (!url) return null;

  const match = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url);
  if (!match) return null;

  const [, apiKey, apiSecret, cloudName] = match;
  if (!apiKey || !apiSecret || !cloudName) return null;

  return { cloudName, apiKey, apiSecret };
}

function leerCredenciales(): CredencialesCloudinary | null {
  const desdeUrl = credencialesDesdeUrl();
  if (desdeUrl) return desdeUrl;

  const cloudName = limpiar(process.env["CLOUDINARY_CLOUD_NAME"]);
  const apiKey = limpiar(process.env["CLOUDINARY_API_KEY"]);
  const apiSecret = limpiar(process.env["CLOUDINARY_API_SECRET"]);

  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret };
}

/**
 * El cloud name va en la URL de subida, así que no puede tener espacios ni
 * mayúsculas: Cloudinary lo genera en minúscula y sin separadores (algo como
 * `wsersg4p`).
 *
 * Se valida porque es fácil confundirlo con el nombre de la API Key o con el
 * del negocio. Cuando pasa, la subida falla con un 401 y un "Invalid
 * Signature" que manda a revisar el secreto, que es justamente lo que está
 * bien.
 */
function cloudNameSospechoso(cloudName: string): boolean {
  return /[\s]/.test(cloudName) || cloudName !== cloudName.toLowerCase();
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

/**
 * Le pregunta a Cloudinary si el par key/secret es válido.
 *
 * El resultado se cachea unos minutos: esto se llama cada vez que se abre el
 * formulario de evento y no tiene sentido gastar una llamada por cada apertura
 * para algo que cambia una vez cada varios meses.
 */
let cacheVerificacion: { valido: boolean; hasta: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

async function credencialesFuncionan(cred: CredencialesCloudinary): Promise<boolean> {
  if (cacheVerificacion && Date.now() < cacheVerificacion.hasta) {
    return cacheVerificacion.valido;
  }

  try {
    const auth = Buffer.from(`${cred.apiKey}:${cred.apiSecret}`).toString("base64");
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cred.cloudName}/ping`, {
      headers: { Authorization: `Basic ${auth}` },
    });

    cacheVerificacion = { valido: res.ok, hasta: Date.now() + CACHE_MS };
    return res.ok;
  } catch {
    // Un problema de red no es lo mismo que credenciales malas: se asume que
    // sirven y que el error real, si lo hay, aparecerá al subir.
    return true;
  }
}

export const registrarRutasUploads: FastifyPluginAsync = async (app) => {

  /**
   * GET /api/uploads/estado — si el panel puede ofrecer la subida.
   *
   * Además de mirar que las variables existan, le pregunta a Cloudinary si el
   * par key/secret sirve. Sin esto, tener las tres variables cargadas parecía
   * suficiente y el error recién aparecía al subir, como un "Invalid
   * Signature" que apunta al código en vez de a las credenciales.
   */
  app.get("/estado", async () => {
    const credenciales = leerCredenciales();
    if (!credenciales) return { configurado: false, credencialesValidas: false };

    if (cloudNameSospechoso(credenciales.cloudName)) {
      return {
        configurado: false,
        credencialesValidas: false,
        detalle:
          `"${credenciales.cloudName}" no parece un Cloud name: van en minúscula ` +
          "y sin espacios. Es el “Product Environment” del panel de Cloudinary.",
      };
    }

    const validas = await credencialesFuncionan(credenciales);

    /**
     * `configurado` NO depende del ping.
     *
     * El ping es de la Admin API y necesita permisos que una key pensada solo
     * para subir puede no tener. Usarlo como condición para habilitar la
     * subida dejaba afuera credenciales que funcionan perfecto — bloquear algo
     * que anda es peor que dejar pasar un error que se va a ver igual al subir.
     *
     * Queda como advertencia: si el ping falla, lo más común sigue siendo que
     * la key y el secret no sean del mismo par.
     */
    return {
      configurado: true,
      credencialesValidas: validas,
      ...(validas
        ? {}
        : {
            advertencia:
              "No se pudo verificar las credenciales con Cloudinary. Si la subida " +
              "falla, revisá que la API Key y el API Secret sean del mismo par " +
              "(en Settings → API Keys cada key tiene el suyo).",
          }),
    };
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

    if (cloudNameSospechoso(credenciales.cloudName)) {
      return reply.status(503).send({
        error:
          `"${credenciales.cloudName}" no parece un Cloud name válido: van en ` +
          "minúscula y sin espacios. Fijate el valor de “Product Environment” " +
          "en el panel de Cloudinary — no es el nombre de la API Key ni el del negocio.",
      });
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

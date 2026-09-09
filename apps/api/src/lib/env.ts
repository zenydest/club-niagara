/**
 * Lectura de variables de entorno que llegan "sucias".
 *
 * Copiadas y pegadas en los paneles de Render o Vercel, es común que queden con
 * comillas alrededor o con espacios al principio. Y una variable seteada pero
 * vacía es lo mismo que no tenerla: si se devolviera `""`, `checkoutConfigurado()`
 * diría que hay credenciales y las llamadas a Mercado Pago fallarían con 401 en
 * vez de avisar que falta configurar.
 */

/** Normaliza un valor suelto: sin comillas, sin espacios, vacío es `undefined`. */
function limpiarValor(valor: string | undefined): string | undefined {
  const crudo = valor?.trim().replace(/^["']|["']$/g, "");
  return crudo === "" ? undefined : crudo;
}

/** Igual que `limpiarValor`, pero leyendo de `process.env`. */
export function envLimpio(nombre: string): string | undefined {
  return limpiarValor(process.env[nombre]);
}

/**
 * Token de Mercado Pago.
 *
 * Vive acá porque lo leen tres módulos —checkout, Point y las rutas de
 * `/api/mp`— y tenerlo copiado en cada uno significaba que arreglar el parseo
 * en uno dejaba los otros dos como estaban.
 */
export function tokenMP(): string | undefined {
  return envLimpio("MP_ACCESS_TOKEN");
}

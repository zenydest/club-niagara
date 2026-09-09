/**
 * Normaliza los textos opcionales que van a la base.
 *
 * Cadena vacía y "sin valor" son lo mismo para columnas como `imagenUrl` o
 * `descripcion`: guardar las dos formas obliga a chequear las dos en cada
 * lectura, y tarde o temprano alguna se olvida. En la base va `null`.
 */
export function textoONull(valor: string | null | undefined): string | null {
  return valor === undefined || valor === null || valor === "" ? null : valor;
}

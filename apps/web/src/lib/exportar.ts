/**
 * Exportación de tablas a archivo.
 *
 * Genera CSV y no XLSX a propósito: Excel, Google Sheets y LibreOffice lo
 * abren igual, y no hace falta sumar una librería de 400 KB al panel para algo
 * que se usa una vez por mes.
 *
 * El archivo se arma en el navegador con los datos que la pantalla ya tiene.
 * Pedirle a la API que genere el archivo obligaría a mantener dos versiones de
 * cada reporte, y en Render plan free armar planillas grandes es justo lo que
 * no conviene hacer.
 */

/** Columna de la exportación: de dónde sale el dato y cómo se titula. */
export interface Columna<T> {
  titulo: string;
  valor: (fila: T) => string | number | null | undefined;
}

/**
 * Escapa un valor para CSV.
 *
 * Las comillas se duplican y el campo se encierra si tiene coma, comillas o
 * salto de línea. Sin esto, un producto llamado `Fernet 1/2, con Coca` parte
 * la fila en dos columnas.
 */
function escapar(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return "";

  const texto = String(valor);
  if (/[",\n\r]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

export function exportarCSV<T>(input: {
  nombre: string;
  columnas: Columna<T>[];
  filas: T[];
}): void {
  const encabezado = input.columnas.map((c) => escapar(c.titulo)).join(",");

  const cuerpo = input.filas
    .map((fila) => input.columnas.map((c) => escapar(c.valor(fila))).join(","))
    .join("\n");

  /**
   * El BOM al principio es lo que hace que Excel en Windows reconozca UTF-8.
   * Sin él, "Cortesía" se abre como "CortesÃ­a" y el cliente cree que el
   * sistema guarda mal los datos.
   */
  // Escrito como escape y no como carácter literal: invisible en el editor, es
  // imposible darse cuenta de que está si alguien lo borra sin querer.
  const contenido = `\uFEFF${encabezado}\n${cuerpo}`;

  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const fecha = new Date().toISOString().slice(0, 10);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `${input.nombre}-${fecha}.csv`;
  enlace.click();

  // Sin esto el blob queda en memoria hasta que se recarga la página.
  URL.revokeObjectURL(url);
}

/** Formato de fecha y hora para las planillas, corto y ordenable de un vistazo. */
export function fechaParaExcel(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Exportación a XLSX con formato.
 *
 * Convive con `exportar.ts`, que sigue haciendo CSV: para mirar números en la
 * compu el CSV alcanza y no pesa nada. Esto es para las planillas que se usan
 * **en la puerta**, donde hace falta que se lea de un vistazo y que se pueda
 * ir tildando quién entró.
 *
 * `exceljs` pesa cerca de un mega, así que se carga con `import()` dinámico:
 * el chunk baja recién cuando alguien aprieta el botón, y el panel arranca
 * igual de liviano que antes.
 */

// Import de tipo: se borra al compilar, así que no arrastra la librería al
// bundle. El código real entra por el `import()` de abajo.
import type { Workbook } from "exceljs";

/** Columna de la planilla: de dónde sale el dato y cómo se titula. */
export interface ColumnaExcel<T> {
  titulo: string;
  /** Ancho en caracteres. Sin esto Excel corta el texto con `####`. */
  ancho?: number;
  /** El índice sirve para numerar las filas, que ayuda a cantar en voz alta. */
  valor: (fila: T, indice: number) => string | number | null | undefined;
}

/**
 * Columna vacía para completar a mano, con desplegable.
 *
 * Es el respaldo de la puerta: si se cae el wifi o el escáner no lee, el
 * portero tilda acá y la lista sigue sirviendo.
 */
export interface ColumnaManual {
  titulo: string;
  /**
   * Opciones del desplegable. Sin esto la columna queda de texto libre, que es
   * lo que sirve para anotar un nombre en la puerta.
   */
  opciones?: string[];
  ancho?: number;
}

export interface OpcionesExcel<T> {
  /** Nombre del archivo, sin extensión. */
  nombre: string;
  /** Nombre de la pestaña. */
  hoja: string;
  /** Título grande arriba de todo. */
  titulo: string;
  /** Líneas de contexto debajo del título: evento, horario, quién la reparte. */
  contexto?: string[];
  columnas: ColumnaExcel<T>[];
  filas: T[];
  columnasManuales?: ColumnaManual[];
  /**
   * Pinta la fila cuando esta columna tiene este valor. Se usa para dejar en
   * gris las cortesías que el sistema ya sabe usadas.
   */
  resaltarCuando?: { titulo: string; valor: string };
}

const VERDE = "FF2F5233";
const GRIS = "FFEDEDED";
const NEGRO = "FF14161A";
const LIMA = "FFC2FF00";

export async function exportarExcel<T>(opciones: OpcionesExcel<T>): Promise<void> {
  const { Workbook } = await import("exceljs");

  const libro = new Workbook();
  libro.creator = "Club Niágara";
  libro.created = new Date();

  const hoja = libro.addWorksheet(opciones.hoja, {
    views: [{ state: "frozen", ySplit: 0 }],
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1 },
  });

  const manuales = opciones.columnasManuales ?? [];
  const totalColumnas = opciones.columnas.length + manuales.length;
  const ultimaLetra = letraColumna(totalColumnas);

  // ── Encabezado ────────────────────────────────────────────────
  hoja.mergeCells(`A1:${ultimaLetra}1`);
  const celdaTitulo = hoja.getCell("A1");
  celdaTitulo.value = opciones.titulo;
  celdaTitulo.font = { size: 16, bold: true, color: { argb: NEGRO } };
  celdaTitulo.alignment = { vertical: "middle" };
  hoja.getRow(1).height = 26;

  let filaActual = 2;
  for (const linea of opciones.contexto ?? []) {
    hoja.mergeCells(`A${filaActual}:${ultimaLetra}${filaActual}`);
    const celda = hoja.getCell(`A${filaActual}`);
    celda.value = linea;
    celda.font = { size: 10, color: { argb: "FF666666" } };
    filaActual++;
  }

  filaActual++; // una fila en blanco antes de la tabla

  // ── Cabecera de la tabla ──────────────────────────────────────
  const filaCabecera = filaActual;
  const titulos = [
    ...opciones.columnas.map((c) => c.titulo),
    ...manuales.map((m) => m.titulo),
  ];

  const cabecera = hoja.getRow(filaCabecera);
  cabecera.values = titulos;
  cabecera.height = 20;
  cabecera.eachCell((celda) => {
    celda.font = { bold: true, color: { argb: LIMA } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NEGRO } };
    celda.alignment = { vertical: "middle", horizontal: "left" };
    celda.border = { bottom: { style: "thin", color: { argb: "FF000000" } } };
  });

  opciones.columnas.forEach((c, i) => {
    hoja.getColumn(i + 1).width = c.ancho ?? 18;
  });
  manuales.forEach((m, i) => {
    hoja.getColumn(opciones.columnas.length + i + 1).width = m.ancho ?? 14;
  });

  // ── Filas ─────────────────────────────────────────────────────
  const indiceResaltar = opciones.resaltarCuando
    ? opciones.columnas.findIndex((c) => c.titulo === opciones.resaltarCuando?.titulo)
    : -1;

  opciones.filas.forEach((fila, indice) => {
    const valores = opciones.columnas.map((c) => c.valor(fila, indice) ?? "");
    const nueva = hoja.addRow([...valores, ...manuales.map(() => "")]);

    const yaUsada =
      indiceResaltar >= 0 && valores[indiceResaltar] === opciones.resaltarCuando?.valor;

    nueva.eachCell({ includeEmpty: true }, (celda) => {
      celda.border = { bottom: { style: "hair", color: { argb: "FFCCCCCC" } } };
      if (yaUsada) {
        celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
        celda.font = { color: { argb: "FF888888" }, strike: true };
      }
    });
  });

  const ultimaFila = filaCabecera + opciones.filas.length;

  // ── Filtro y panel congelado ──────────────────────────────────
  if (opciones.filas.length > 0) {
    hoja.autoFilter = {
      from: { row: filaCabecera, column: 1 },
      to: { row: ultimaFila, column: totalColumnas },
    };
  }

  // La cabecera queda fija al scrollear: con 200 cortesías, si no, a mitad de
  // lista ya no se sabe qué columna es cuál.
  hoja.views = [{ state: "frozen", xSplit: 0, ySplit: filaCabecera }];

  // ── Desplegables de las columnas manuales ─────────────────────
  manuales.forEach((manual, i) => {
    const columna = opciones.columnas.length + i + 1;
    const letra = letraColumna(columna);

    if (manual.opciones !== undefined) {
      for (let fila = filaCabecera + 1; fila <= ultimaFila; fila++) {
        hoja.getCell(`${letra}${fila}`).dataValidation = {
          type: "list",
          allowBlank: true,
          // Las comillas dobles alrededor son parte del formato de Excel.
          formulae: [`"${manual.opciones.join(",")}"`],
          showErrorMessage: true,
          errorTitle: "Valor no válido",
          error: `Elegí una opción de la lista: ${manual.opciones.join(", ")}.`,
        };
      }
    }

    // Lo tildado a mano se pinta solo, para que se vea de un vistazo cuánto
    // falta. Va como formato condicional y no fijo, porque el valor lo escribe
    // el portero después de que el archivo se generó.
    if (opciones.filas.length > 0 && manual.opciones !== undefined) {
      const primeraOpcion = manual.opciones[0];
      if (primeraOpcion !== undefined) {
        hoja.addConditionalFormatting({
          ref: `A${filaCabecera + 1}:${ultimaLetra}${ultimaFila}`,
          rules: [
            {
              type: "expression",
              formulae: [`$${letra}${filaCabecera + 1}="${primeraOpcion}"`],
              priority: 1,
              style: {
                fill: {
                  type: "pattern",
                  pattern: "solid",
                  bgColor: { argb: "FFD8F5C8" },
                },
                font: { color: { argb: VERDE } },
              },
            },
          ],
        });
      }
    }
  });

  await descargar(libro, opciones.nombre);
}

/** Número de columna a letra de Excel: 1 → A, 27 → AA. */
function letraColumna(numero: number): string {
  let resto = numero;
  let letra = "";

  while (resto > 0) {
    const modulo = (resto - 1) % 26;
    letra = String.fromCharCode(65 + modulo) + letra;
    resto = Math.floor((resto - modulo) / 26);
  }

  return letra;
}

async function descargar(libro: Workbook, nombre: string): Promise<void> {
  const buffer = await libro.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const fecha = new Date().toISOString().slice(0, 10);
  const enlace = document.createElement("a");

  enlace.href = url;
  enlace.download = `${nombre}-${fecha}.xlsx`;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);

  URL.revokeObjectURL(url);
}

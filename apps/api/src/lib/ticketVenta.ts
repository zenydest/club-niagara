/**
 * Ticket de consumo para imprimir en la terminal Point.
 *
 * Se usa en dos casos: cuando el cobro **no** pasa por la terminal —efectivo,
 * cashless, cortesía— pero el cliente igual quiere su comprobante, y cuando
 * hay que reimprimir el ticket de cualquier venta ya registrada.
 *
 * No es un comprobante fiscal: es el detalle de lo que consumió, para que
 * pueda revisar que le cobraron bien.
 */

import { TAGS_IMPRESION as T } from "./mpPoint.js";

const ARS = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);

/**
 * Cuántos ítems se listan uno por uno antes de resumir el resto.
 *
 * Cada ítem ocupa unos 90 caracteres con los tags incluidos; con el encabezado
 * y el pie, 30 deja margen cómodo contra el tope de 4096 de MP.
 */
const MAX_ITEMS_DETALLADOS = 30;

/**
 * Cómo se lee cada método en el papel.
 *
 * El nombre técnico no sirve acá: "QR_MP" no le dice nada a quien recibe el
 * ticket. Lo que no esté mapeado sale en mayúsculas tal cual.
 */
const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "EFECTIVO",
  tarjeta: "TARJETA",
  cashless: "TARJETA CASHLESS",
  qr_mp: "QR MERCADO PAGO",
  cortesia: "CORTESÍA",
};

export interface ItemTicket {
  nombre: string;
  cantidad: number;
  subtotal: number;
}

/**
 * Arma el contenido con los tags que entiende la impresora de la terminal.
 *
 * El ancho útil es angosto, así que los nombres largos se recortan: una línea
 * que se parte a la mitad hace el ticket ilegible.
 */
export function armarTicket(input: {
  local: string;
  items: ItemTicket[];
  total: number;
  metodoPago: string;
  fecha?: Date;
  cajero?: string;
  nota?: string;
  /**
   * Marca el papel como copia.
   *
   * Importa más de lo que parece: dos tickets idénticos del mismo consumo se
   * pueden presentar como dos consumos distintos. La aclaración es lo que
   * separa un comprobante de una copia.
   */
  reimpresion?: boolean;
}): string {
  const fecha = input.fecha ?? new Date();
  const lineas: string[] = [];

  lineas.push(T.centrado(T.negrita(T.grande(input.local))));
  lineas.push(T.salto);

  if (input.reimpresion) {
    lineas.push(T.centrado(T.negrita("* * REIMPRESION * *")));
    lineas.push(T.salto);
  }

  lineas.push(
    T.centrado(
      T.chica(
        fecha.toLocaleString("es-AR", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        })
      )
    )
  );
  lineas.push(T.salto);
  lineas.push(T.centrado(T.chica("- - - - - - - - - - - -")));
  lineas.push(T.salto);

  // MP corta las impresiones en 4096 caracteres contando los tags. Una ronda
  // enorme llegaría al límite y no se imprimiría nada; mejor un ticket
  // completo en el total y resumido en el detalle que ningún ticket.
  const detallados = input.items.slice(0, MAX_ITEMS_DETALLADOS);
  const restantes = input.items.slice(MAX_ITEMS_DETALLADOS);

  for (const item of detallados) {
    // 22 caracteres es lo que entra cómodo en el papel de la Point.
    const nombre =
      item.nombre.length > 22 ? `${item.nombre.slice(0, 21)}.` : item.nombre;

    lineas.push(T.izquierda(`${item.cantidad}x ${nombre}`));
    lineas.push(T.salto);
    lineas.push(T.izquierda(T.chica(`   ${ARS(item.subtotal)}`)));
    lineas.push(T.salto);
  }

  if (restantes.length > 0) {
    const unidades = restantes.reduce((acc, i) => acc + i.cantidad, 0);
    const monto = restantes.reduce((acc, i) => acc + i.subtotal, 0);

    lineas.push(T.izquierda(`+ ${unidades} ítem${unidades === 1 ? "" : "s"} más`));
    lineas.push(T.salto);
    lineas.push(T.izquierda(T.chica(`   ${ARS(monto)}`)));
    lineas.push(T.salto);
  }

  lineas.push(T.centrado(T.chica("- - - - - - - - - - - -")));
  lineas.push(T.salto);
  lineas.push(T.centrado(T.negrita(T.grande(`TOTAL ${ARS(input.total)}`))));
  lineas.push(T.salto);
  lineas.push(
    T.centrado(ETIQUETA_METODO[input.metodoPago] ?? input.metodoPago.toUpperCase())
  );
  lineas.push(T.salto);

  if (input.cajero) {
    lineas.push(T.centrado(T.chica(`Atendió: ${input.cajero}`)));
    lineas.push(T.salto);
  }

  if (input.nota) {
    // La nota viene de la base y no tiene tope ahí; se recorta para que un
    // texto largo no empuje el ticket contra el límite de MP.
    lineas.push(T.centrado(T.chica(input.nota.slice(0, 80))));
    lineas.push(T.salto);
  }

  lineas.push(T.salto);
  lineas.push(T.centrado(T.chica("No válido como factura")));
  lineas.push(T.salto);
  lineas.push(T.centrado(T.chica("¡Gracias!")));

  return lineas.join("");
}

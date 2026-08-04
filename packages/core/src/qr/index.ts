/**
 * Código rotativo del QR de entrada.
 *
 * Problema que resuelve: un QR estático se puede fotografiar y compartir. El
 * quemado atómico ya impide que entren dos personas con el mismo código, pero
 * no impide que el primero en llegar sea el que recibió la captura y no el que
 * compró.
 *
 * Solución: además del `qrCode` fijo, el QR lleva un código derivado de un
 * secreto por entrada y de la ventana de tiempo actual. Cambia cada 30
 * segundos, así que una captura sirve —como mucho— hasta que termina la
 * ventana.
 *
 * ── Sobre el algoritmo ────────────────────────────────────────────
 * Se usa SHA-256 sobre `"<ventana>:<secreto>"`, con el secreto **al final**.
 *
 * Lo habitual sería HMAC, pero React Native no tiene HMAC nativo y armarlo
 * sobre el SHA-256 de expo-crypto exige manipular bytes, lo que es fácil de
 * hacer mal. Poner el secreto como sufijo evita el ataque de extensión de
 * longitud, que es la razón por la que SHA-256 "con secreto al principio" se
 * considera inseguro. Para este caso de uso —un código corto, de vida breve,
 * contra un atacante que nunca ve el secreto— es suficiente.
 *
 * Las dos puntas calculan lo mismo a partir de un string, sin binarios de por
 * medio: el servidor con `node:crypto`, la app con `expo-crypto`.
 */

/** Duración de cada ventana, en segundos. */
export const QR_VENTANA_SEGUNDOS = 30;

/**
 * Cuántas ventanas hacia atrás y hacia adelante se aceptan al validar.
 *
 * Cubre dos cosas reales: el reloj del celular desfasado respecto del servidor,
 * y el tiempo entre que el portero apunta la cámara y el server procesa. Con 1
 * la tolerancia efectiva es de 30 a 90 segundos.
 */
export const QR_TOLERANCIA_VENTANAS = 1;

/** Cantidad de caracteres hex del código. 8 hex = 32 bits. */
export const QR_LARGO_CODIGO = 8;

/** Ventana de tiempo actual. */
export function ventanaActual(ahora: number = Date.now()): number {
  return Math.floor(ahora / 1000 / QR_VENTANA_SEGUNDOS);
}

/** Texto exacto que se hashea. Tiene que ser idéntico en servidor y app. */
export function materialParaHash(ventana: number, secreto: string): string {
  return `${ventana}:${secreto}`;
}

/** Recorta el hash hex al largo del código. */
export function codigoDesdeHash(hashHex: string): string {
  return hashHex.slice(0, QR_LARGO_CODIGO).toLowerCase();
}

/** Ventanas aceptables al validar, ordenadas de más a menos probable. */
export function ventanasAceptables(ahora: number = Date.now()): number[] {
  const actual = ventanaActual(ahora);
  const ventanas: number[] = [actual];

  for (let i = 1; i <= QR_TOLERANCIA_VENTANAS; i++) {
    ventanas.push(actual - i, actual + i);
  }

  return ventanas;
}

/** Segundos que le quedan a la ventana actual — para el contador de la app. */
export function segundosRestantes(ahora: number = Date.now()): number {
  const transcurridos = Math.floor(ahora / 1000) % QR_VENTANA_SEGUNDOS;
  return QR_VENTANA_SEGUNDOS - transcurridos;
}

/** Contenido que se codifica en el QR. */
export interface PayloadQR {
  tipo: "entrada";
  /** Identificador estable de la entrada */
  id: string;
  /** Local, para que la puerta rechace QR de otro boliche */
  localId: string;
  /** Código rotativo. Ausente en entradas viejas, sin secreto. */
  codigo?: string;
}

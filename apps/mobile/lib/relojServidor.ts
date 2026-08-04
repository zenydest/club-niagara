/**
 * Reloj sincronizado con el servidor.
 *
 * El código rotativo del QR depende de la hora. Si el celular tiene la hora
 * desfasada —manual, zona horaria rara, batería agotada— generaría códigos de
 * una ventana equivocada y la puerta los rechazaría siempre, dejando afuera a
 * alguien que pagó su entrada.
 *
 * Para evitarlo se guarda el desfasaje contra el reloj del servidor, que llega
 * en cada respuesta de `/api/cliente/entradas`, y se usa la hora corregida para
 * calcular el código.
 *
 * Gracias a esto la tolerancia de validación puede ser corta: solo tiene que
 * cubrir la latencia del escaneo, no el estado del reloj del dispositivo.
 */

let desfasajeMs = 0;

/**
 * Registra la hora del servidor.
 *
 * `recibidoEn` permite descontar el viaje de red: se toma la mitad del
 * round-trip como aproximación del tiempo de ida.
 */
export function sincronizarConServidor(serverTime: number, enviadoEn: number): void {
  const ahoraLocal = Date.now();
  const mitadDelViaje = (ahoraLocal - enviadoEn) / 2;
  desfasajeMs = serverTime + mitadDelViaje - ahoraLocal;
}

/** Hora actual corregida con el desfasaje del servidor. */
export function ahoraServidor(): number {
  return Date.now() + desfasajeMs;
}

/** Desfasaje detectado, en segundos. Útil para depurar. */
export function desfasajeSegundos(): number {
  return Math.round(desfasajeMs / 1000);
}

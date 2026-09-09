/**
 * Reserva de lugares al vender una entrada.
 *
 * Hay tres caminos que venden entradas —la página pública, el panel y la app
 * del cliente— y los tres tienen que aplicar exactamente las mismas dos reglas.
 * Cuando el SQL estaba copiado en cada uno, arreglar el control de cupo en uno
 * dejaba los otros dos como estaban.
 *
 * Las dos reglas:
 *
 *   1. El tope del tipo (`cantidad_total`), si tiene. Nunca se venden 301
 *      Prioridad si el tope son 300.
 *
 *   2. La capacidad del evento, compartida entre todos los tipos que ocupan
 *      lugar. Con 300 de capacidad da igual cómo se repartan entre Prioridad y
 *      VIP: entre los dos no pasan de 300. Así no hay que adivinar de antemano
 *      cuántos va a querer cada uno, que era el problema de poner topes fijos.
 *
 * Los tipos con `ocupa_lugar = false` —el transporte— se saltean la regla 2:
 * son un servicio aparte y se venden aunque el salón esté lleno.
 */

import { prisma, type Prisma } from "@niagara/db";

export type MotivoRechazo = "sin_cupo_en_el_tipo" | "evento_lleno";

export type ResultadoReserva =
  | { ok: true }
  | { ok: false; motivo: MotivoRechazo; disponibles: number };

/**
 * Descuenta `cantidad` lugares del tipo indicado, o falla sin escribir nada.
 *
 * Tiene que llamarse adentro de una transacción, con el mismo `tx` con el que
 * después se crean las entradas: si la creación falla, la reserva se deshace.
 */
export async function reservarCupo(
  tx: Prisma.TransactionClient,
  entradaTipoId: string,
  cantidad: number
): Promise<ResultadoReserva> {
  const tipo = await tx.entradaTipo.findUnique({
    where: { id: entradaTipoId },
    select: { eventoId: true, ocupaLugar: true },
  });

  if (!tipo) return { ok: false, motivo: "sin_cupo_en_el_tipo", disponibles: 0 };

  /**
   * Se bloquea la fila del evento antes de mirar nada.
   *
   * El tope por tipo se puede controlar en el propio UPDATE, porque toca la
   * misma fila que compara. La capacidad compartida no: hay que sumar lo
   * vendido en los *otros* tipos, y dos compras de tipos distintos leerían esa
   * suma al mismo tiempo y pasarían las dos. Bloquear el evento las pone en
   * fila.
   *
   * Serializa las ventas de un evento, no las de todo el local. Para un boliche
   * —cientos de ventas en una noche, no miles por segundo— no se nota.
   */
  if (tipo.ocupaLugar) {
    await tx.$queryRaw`SELECT id FROM eventos WHERE id = ${tipo.eventoId}::uuid FOR UPDATE`;
  }

  const filas = await tx.$executeRaw`
    UPDATE entradas_tipo AS t
       SET cantidad_vendida = t.cantidad_vendida + ${cantidad}
     WHERE t.id = ${entradaTipoId}::uuid
       AND (t.cantidad_total IS NULL
            OR t.cantidad_vendida + ${cantidad} <= t.cantidad_total)
       AND (
         NOT t.ocupa_lugar
         OR (
           SELECT COALESCE(SUM(t2.cantidad_vendida), 0)
             FROM entradas_tipo t2
            WHERE t2.evento_id = t.evento_id
              AND t2.ocupa_lugar
         ) + ${cantidad} <= (SELECT e.capacidad FROM eventos e WHERE e.id = t.evento_id)
       )
  `;

  if (filas > 0) return { ok: true };

  return diagnosticar(entradaTipoId, cantidad);
}

/**
 * Por qué no entró.
 *
 * Se averigua después de fallar y no antes, para no pagar dos consultas en la
 * venta que sí funciona. Los números son los del momento de preguntar: entre el
 * intento y la respuesta el cupo puede haber cambiado otra vez, pero para el
 * mensaje que ve el comprador alcanza.
 */
async function diagnosticar(
  entradaTipoId: string,
  cantidad: number
): Promise<ResultadoReserva> {
  const tipo = await prisma.entradaTipo.findUnique({
    where: { id: entradaTipoId },
    select: {
      cantidadTotal: true,
      cantidadVendida: true,
      ocupaLugar: true,
      evento: { select: { capacidad: true } },
      eventoId: true,
    },
  });

  if (!tipo) return { ok: false, motivo: "sin_cupo_en_el_tipo", disponibles: 0 };

  if (tipo.cantidadTotal !== null) {
    const enElTipo = tipo.cantidadTotal - tipo.cantidadVendida;
    if (enElTipo < cantidad) {
      return {
        ok: false,
        motivo: "sin_cupo_en_el_tipo",
        disponibles: Math.max(0, enElTipo),
      };
    }
  }

  const ocupados = await prisma.entradaTipo.aggregate({
    where: { eventoId: tipo.eventoId, ocupaLugar: true },
    _sum: { cantidadVendida: true },
  });

  const enElSalon = tipo.evento.capacidad - (ocupados._sum.cantidadVendida ?? 0);

  return {
    ok: false,
    motivo: "evento_lleno",
    disponibles: Math.max(0, enElSalon),
  };
}

/** Mensaje para el comprador, según por qué se rechazó. */
export function mensajeRechazoCupo(resultado: {
  motivo: MotivoRechazo;
  disponibles: number;
}): string {
  if (resultado.motivo === "evento_lleno") {
    return resultado.disponibles <= 0
      ? "No quedan lugares para este evento"
      : `Quedan solo ${resultado.disponibles} lugares para este evento`;
  }

  return resultado.disponibles <= 0
    ? "Se agotaron"
    : `Quedan solo ${resultado.disponibles}`;
}

/**
 * Cancelación de entradas.
 *
 * Vive acá porque cancelan dos lados con las mismas reglas: el cliente desde
 * la app y el staff desde el panel. Duplicar esto era garantizar que en algún
 * momento uno permitiera algo que el otro no.
 *
 * Reglas:
 *
 *   - Una entrada **usada** no se cancela. Ya entró.
 *   - Una entrada **vencida** tampoco: el vencimiento es el inicio del evento.
 *     Después de esa hora el boliche ya contó con esa venta.
 *   - Una entrada **paga** que se cancela queda marcada para devolución. El
 *     reembolso se hace a mano desde Mercado Pago.
 *
 * La entrada no se borra: se marca. Si estaba paga, borrarla haría desaparecer
 * el rastro de una plata que hay que devolver.
 */

import { prisma } from "@niagara/db";

export type MotivoRechazo =
  | "no_encontrada"
  | "ya_usada"
  | "ya_cancelada"
  | "vencida";

export interface ResultadoCancelacion {
  ok: boolean;
  motivo?: MotivoRechazo;
  /** Cuando se cancela una entrada paga: hay que devolver esta plata. */
  reembolsoPendiente?: boolean;
  monto?: number;
}

const MENSAJES: Record<MotivoRechazo, string> = {
  no_encontrada: "La entrada no existe",
  ya_usada: "La entrada ya se usó para ingresar y no se puede cancelar",
  ya_cancelada: "La entrada ya estaba cancelada",
  vencida: "El evento ya empezó: la entrada no se puede cancelar",
};

export function mensajeRechazo(motivo: MotivoRechazo): string {
  return MENSAJES[motivo];
}

export async function cancelarEntrada(input: {
  entradaId: string;
  localId: string;
  /** "cliente" si canceló desde la app, o el id del staff que la canceló. */
  canceladaPor: string;
  /**
   * El staff puede cancelar después de que arrancó el evento; el cliente no.
   * Sirve para arreglar a mano un caso puntual sin abrirle la puerta a que
   * cualquiera cancele a las 3 de la mañana.
   */
  ignorarVencimiento?: boolean;
}): Promise<ResultadoCancelacion> {
  const entrada = await prisma.entradaVendida.findFirst({
    where: { id: input.entradaId, localId: input.localId },
    include: { evento: { select: { fechaInicio: true } } },
  });

  if (!entrada) return { ok: false, motivo: "no_encontrada" };
  if (entrada.usada) return { ok: false, motivo: "ya_usada" };
  if (entrada.canceladaAt) return { ok: false, motivo: "ya_cancelada" };

  if (!input.ignorarVencimiento && entrada.evento.fechaInicio <= new Date()) {
    return { ok: false, motivo: "vencida" };
  }

  const debeReembolso = entrada.pagada;

  /**
   * Marcar la entrada y devolver el cupo van juntos: si se marcara cancelada
   * sin liberar el lugar, ese cupo quedaría perdido para siempre.
   */
  await prisma.$transaction([
    prisma.entradaVendida.update({
      where: { id: entrada.id },
      data: {
        canceladaAt: new Date(),
        canceladaPor: input.canceladaPor,
        reembolsoPendiente: debeReembolso,
      },
    }),
    prisma.entradaTipo.update({
      where: { id: entrada.entradaTipoId },
      data: { cantidadVendida: { decrement: 1 } },
    }),
  ]);

  return {
    ok: true,
    reembolsoPendiente: debeReembolso,
    monto: Number(entrada.precioPagado),
  };
}

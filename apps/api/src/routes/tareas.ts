/**
 * Tareas programadas.
 * Prefix: /api/tareas
 *
 * No las dispara un usuario: las llama un workflow de GitHub Actions cada
 * hora. Render en plan free no tiene cron propio, y Actions ya se usa para el
 * backup, así que no agrega infraestructura nueva.
 *
 * Van fuera del contexto de local (no hay sesión ni `x-local-id`) y se
 * protegen con un secreto compartido en el header.
 */

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@niagara/db";
import { avisarAClientes } from "../lib/push.js";

/** Cuántas horas antes del evento se manda el recordatorio. */
const HORAS_ANTES = 4;

function secretoTareas(): string | undefined {
  const crudo = process.env["TAREAS_SECRETO"]?.trim().replace(/^["']|["']$/g, "");
  return crudo ? crudo : undefined;
}

export const registrarRutasTareas: FastifyPluginAsync = async (app) => {
  /**
   * POST /api/tareas/recordatorios
   *
   * Avisa a los clientes de los eventos que arrancan dentro de las próximas
   * horas. Se llama seguido y es idempotente: cada evento se marca al avisar,
   * así que llamarla de más no molesta a nadie.
   */
  app.post("/recordatorios", async (req, reply) => {
    const secreto = secretoTareas();

    // Sin secreto configurado el endpoint queda cerrado, no abierto: si
    // alguien despliega sin la variable, es mejor que las tareas no corran a
    // que corran para cualquiera.
    if (!secreto) {
      app.log.warn("TAREAS_SECRETO sin configurar: /api/tareas está deshabilitado");
      return reply.status(503).send({ error: "Tareas no configuradas" });
    }

    if (req.headers["x-tarea-secreto"] !== secreto) {
      return reply.status(401).send({ error: "No autorizado" });
    }

    const ahora = new Date();
    const limite = new Date(ahora.getTime() + HORAS_ANTES * 60 * 60 * 1000);

    const eventos = await prisma.evento.findMany({
      where: {
        estado: { in: ["preventa", "en_vivo"] },
        recordatorioAt: null,
        // Entre ahora y el límite: los que ya arrancaron no se avisan, y los
        // que faltan mucho tampoco.
        fechaInicio: { gt: ahora, lte: limite },
      },
      select: { id: true, localId: true, nombre: true, fechaInicio: true },
    });

    let avisados = 0;

    for (const evento of eventos) {
      const hora = new Date(evento.fechaInicio).toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      const res = await avisarAClientes({
        localId: evento.localId,
        titulo: `Hoy: ${evento.nombre}`,
        cuerpo: `Arranca a las ${hora}. Tené el QR a mano.`,
        datos: { tipo: "recordatorio", eventoId: evento.id },
      });

      // Se marca aunque no haya nadie con la app: el objetivo es no repetir el
      // intento cada hora hasta que empiece el evento.
      await prisma.evento.update({
        where: { id: evento.id },
        data: { recordatorioAt: new Date() },
      });

      avisados += res.enviados;
    }

    return { eventos: eventos.length, avisos: avisados };
  });
};

/**
 * Avisos push a la app de los clientes.
 *
 * Usa el servicio de Expo, que es gratis y no necesita credenciales de Firebase
 * ni de Apple: la app ya viene con un token de Expo por dispositivo.
 *
 * Los envíos nunca tiran abajo la operación que los dispara. Si un evento se
 * publica y el aviso falla, el evento igual queda publicado: perder una
 * notificación es molesto, no poder publicar es un problema.
 */

import { prisma } from "@niagara/db";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Expo acepta hasta 100 mensajes por request. */
const TAMANO_LOTE = 100;

interface MensajePush {
  to: string;
  title: string;
  body: string;
  /** Viaja con la notificación: la app lo usa para saber a dónde llevar al
   *  usuario cuando la toca. */
  data?: Record<string, string>;
  sound?: "default";
}

interface RespuestaExpo {
  data?: {
    status: "ok" | "error";
    id?: string;
    message?: string;
    details?: { error?: string };
  }[];
}

function enLotes<T>(items: T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) {
    lotes.push(items.slice(i, i + tamano));
  }
  return lotes;
}

/**
 * Manda un aviso a todos los clientes del local que tengan la app instalada.
 *
 * Devuelve cuántos se enviaron. Los tokens que Expo reporta como muertos —el
 * usuario desinstaló la app o cambió de celular— se borran acá mismo: si no,
 * la lista crece para siempre con destinatarios que no existen.
 */
export async function avisarAClientes(input: {
  localId: string;
  titulo: string;
  cuerpo: string;
  datos?: Record<string, string>;
}): Promise<{ enviados: number; eliminados: number }> {
  const dispositivos = await prisma.dispositivoPush.findMany({
    where: { localId: input.localId },
    select: { token: true },
  });

  if (dispositivos.length === 0) return { enviados: 0, eliminados: 0 };

  const mensajes: MensajePush[] = dispositivos.map((d) => ({
    to: d.token,
    title: input.titulo,
    body: input.cuerpo,
    sound: "default",
    ...(input.datos && { data: input.datos }),
  }));

  let enviados = 0;
  const tokensMuertos: string[] = [];

  for (const lote of enLotes(mensajes, TAMANO_LOTE)) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(lote),
      });

      if (!res.ok) continue;

      const cuerpo = (await res.json()) as RespuestaExpo;

      cuerpo.data?.forEach((r, i) => {
        if (r.status === "ok") {
          enviados += 1;
          return;
        }

        // `DeviceNotRegistered` es el único error que amerita borrar el token:
        // los demás son transitorios y el token puede volver a servir.
        if (r.details?.error === "DeviceNotRegistered") {
          const destinatario = lote[i]?.to;
          if (destinatario) tokensMuertos.push(destinatario);
        }
      });
    } catch {
      // Un lote que falla no corta los demás.
    }
  }

  if (tokensMuertos.length > 0) {
    await prisma.dispositivoPush.deleteMany({
      where: { token: { in: tokensMuertos } },
    });
  }

  return { enviados, eliminados: tokensMuertos.length };
}

/**
 * Cobro con terminal Mercado Pago Point desde la caja del panel.
 *
 * El ciclo es: se crea la orden apuntando a una terminal, la terminal la
 * levanta, el cliente paga ahí y acá se espera el resultado.
 *
 * Se resuelve con **polling** y no con Socket.io a propósito. La caja no puede
 * quedarse colgada porque se cayó un websocket, y preguntarle a la API cada dos
 * segundos durante el minuto que dura un cobro es barato. La API a su vez le
 * pregunta a MP solo si todavía no tiene un estado final.
 *
 * Es un port del store de `apps/pos`, adaptado al cliente HTTP y al authStore
 * del panel.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "@/lib/apiClient";
import { useAuthStore } from "@/stores/authStore";

/** Cada cuánto se consulta el estado del cobro */
const INTERVALO_POLLING_MS = 2000;

/** A los 3 minutos se corta: la orden en MP expira antes (PT2M) */
const TIMEOUT_COBRO_MS = 3 * 60 * 1000;

export type EstadoCobroPoint =
  | "inactivo"
  | "creando"
  | "esperando"
  | "pagado"
  | "rechazado"
  | "cancelado"
  | "error";

/** Estados que devuelve MP para una orden de Point. */
export type EstadoOrdenMP =
  | "created"
  | "at_terminal"
  | "action_required"
  | "processed"
  | "canceled"
  | "expired";

export interface OrdenPoint {
  id: string;
  referencia: string;
  estado: EstadoOrdenMP;
  monto: number;
  terminalId: string;
}

export interface TerminalCobro {
  id: string;
  nombre: string;
  activa: boolean;
  operatingMode: "PDV" | "STANDALONE" | "UNDEFINED";
  barraId: string | null;
}

interface CobroPointState {
  terminales: TerminalCobro[];
  terminalId: string | null;
  cargandoTerminales: boolean;

  estado: EstadoCobroPoint;
  referencia: string | null;
  orden: OrdenPoint | null;
  error: string | null;

  cargarTerminales: () => Promise<void>;
  setTerminal: (terminalId: string | null) => void;

  /** Arranca el cobro y no resuelve hasta que hay un resultado definitivo */
  cobrar: (input: {
    ventaId: string;
    monto: number;
    descripcion?: string;
  }) => Promise<{ ok: boolean; error?: string }>;

  cancelar: () => Promise<void>;
  reiniciar: () => void;
}

function localIdActual(): string | undefined {
  return useAuthStore.getState().staff?.localId;
}

let temporizador: ReturnType<typeof setTimeout> | null = null;

function detenerPolling() {
  if (temporizador) {
    clearTimeout(temporizador);
    temporizador = null;
  }
}

export const useCobroPointStore = create<CobroPointState>()(
  persist(
    (set, get) => ({
      terminales: [],
      terminalId: null,
      cargandoTerminales: false,
      estado: "inactivo",
      referencia: null,
      orden: null,
      error: null,

      cargarTerminales: async () => {
        const localId = localIdActual();
        if (!localId) return;

        set({ cargandoTerminales: true });
        try {
          const data = await api.get<{ terminales: TerminalCobro[] }>(
            "/point/terminales",
            localId
          );

          // Solo sirven las que están en PDV: las demás no reciben órdenes por
          // API, por más que estén vinculadas y prendidas.
          const usables = data.terminales.filter(
            (t) => t.activa && t.operatingMode === "PDV"
          );

          // Si la terminal guardada ya no existe o dejó de ser usable, se limpia
          // para que el cajero vuelva a elegir en vez de fallar al cobrar.
          const guardada = get().terminalId;
          const sigueValida = usables.some((t) => t.id === guardada);

          set({
            terminales: usables,
            cargandoTerminales: false,
            ...(!sigueValida && {
              terminalId: usables.length === 1 ? (usables[0]?.id ?? null) : null,
            }),
          });
        } catch (err) {
          set({
            cargandoTerminales: false,
            error:
              err instanceof Error ? err.message : "No se pudieron cargar las terminales",
          });
        }
      },

      setTerminal: (terminalId) => set({ terminalId }),

      cobrar: async ({ ventaId, monto, descripcion }) => {
        const localId = localIdActual();
        const terminalId = get().terminalId;

        if (!localId) return { ok: false, error: "Sin sesión activa" };
        if (!terminalId) return { ok: false, error: "Elegí una terminal para cobrar" };

        detenerPolling();
        set({ estado: "creando", referencia: ventaId, orden: null, error: null });

        try {
          const { orden } = await api.post<{ orden: OrdenPoint }>(
            "/point/cobros",
            {
              ventaId,
              terminalId,
              monto,
              ...(descripcion !== undefined && { descripcion }),
            },
            localId
          );

          set({ estado: "esperando", orden });

          return await esperarResultado(ventaId, localId, set);
        } catch (err) {
          const mensaje = err instanceof Error ? err.message : "No se pudo iniciar el cobro";
          set({ estado: "error", error: mensaje });
          return { ok: false, error: mensaje };
        }
      },

      cancelar: async () => {
        const localId = localIdActual();
        const referencia = get().referencia;
        detenerPolling();

        if (!localId || !referencia) {
          set({ estado: "inactivo", referencia: null, orden: null });
          return;
        }

        try {
          await api.post(`/point/cobros/${referencia}/cancelar`, {}, localId);
          set({ estado: "cancelado" });
        } catch (err) {
          // Si la terminal ya tomó la orden, MP no la deja cancelar por API y hay
          // que hacerlo en el equipo. Se le dice al cajero en vez de fallar mudo.
          set({
            estado: "error",
            error:
              err instanceof Error
                ? err.message
                : "No se pudo cancelar — cancelá desde la terminal",
          });
        }
      },

      reiniciar: () => {
        detenerPolling();
        set({ estado: "inactivo", referencia: null, orden: null, error: null });
      },
    }),
    {
      name: "niagara-panel-point",
      // Solo se recuerda la terminal elegida; el cobro en curso no debe
      // sobrevivir a un refresh.
      partialize: (s) => ({ terminalId: s.terminalId }),
    }
  )
);

type Set = (parcial: Partial<CobroPointState>) => void;

/**
 * Consulta el estado hasta que sea definitivo, se agote el tiempo o el cajero
 * cancele (que detiene el temporizador desde afuera).
 */
function esperarResultado(
  referencia: string,
  localId: string,
  set: Set
): Promise<{ ok: boolean; error?: string }> {
  const limite = Date.now() + TIMEOUT_COBRO_MS;

  return new Promise((resolve) => {
    const consultar = async () => {
      if (Date.now() > limite) {
        set({ estado: "error", error: "Se agotó el tiempo de espera del cobro" });
        resolve({ ok: false, error: "Tiempo de espera agotado" });
        return;
      }

      try {
        const { orden } = await api.get<{ orden: OrdenPoint }>(
          `/point/cobros/${referencia}?refrescar=true`,
          localId
        );

        set({ orden });

        if (orden.estado === "processed") {
          set({ estado: "pagado" });
          resolve({ ok: true });
          return;
        }

        if (orden.estado === "canceled" || orden.estado === "expired") {
          const cancelado = orden.estado === "canceled";
          set({
            estado: cancelado ? "cancelado" : "rechazado",
            error: cancelado ? null : "La orden expiró sin cobrarse",
          });
          resolve({
            ok: false,
            error: cancelado ? "Cobro cancelado" : "La orden expiró",
          });
          return;
        }

        // created / at_terminal / action_required → seguir esperando
        temporizador = setTimeout(() => void consultar(), INTERVALO_POLLING_MS);
      } catch {
        // Un error de red no cancela el cobro: la terminal puede seguir
        // cobrando igual, así que se reintenta hasta el timeout.
        temporizador = setTimeout(() => void consultar(), INTERVALO_POLLING_MS);
      }
    };

    temporizador = setTimeout(() => void consultar(), INTERVALO_POLLING_MS);
  });
}

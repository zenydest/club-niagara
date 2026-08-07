/**
 * Terminales Mercado Pago Point.
 *
 * Las terminales no se crean acá: el `id` lo asigna MP y se importan con
 * "sincronizar". Lo que sí se administra desde el panel es el alias, a qué barra
 * pertenece cada una, y el pasaje a modo PDV (el único que permite cobrar por
 * API).
 */

import { create } from "zustand";
import { api } from "@/lib/apiClient";
import { useAuthStore } from "@/stores/authStore";

export type ModoOperacion = "PDV" | "STANDALONE" | "UNDEFINED";

export interface Terminal {
  id: string;
  localId: string;
  barraId: string | null;
  nombre: string;
  posId: string;
  storeId: string;
  operatingMode: ModoOperacion;
  activa: boolean;
  barra?: { id: string; nombre: string } | null;
}

export interface EstadoPoint {
  configurado: boolean;
  webhookFirmado: boolean;
  terminales: number;
  terminalesEnPDV: number;
}

/**
 * Cobro aprobado en Mercado Pago que no tiene venta registrada.
 *
 * Pasa si el navegador se cierra o se corta internet entre que la terminal
 * aprueba el pago y que la caja alcanza a guardar la venta. La plata entró
 * igual, así que hay que poder verlo para cargarlo a mano.
 */
export interface CobroHuerfano {
  id: string;
  referencia: string;
  monto: string | number;
  estado: string;
  mpPaymentId: string | null;
  createdAt: string;
  terminal?: { nombre: string } | null;
}

interface TerminalesState {
  terminales: Terminal[];
  estadoPoint: EstadoPoint | null;
  huerfanos: CobroHuerfano[];
  cargando: boolean;
  sincronizando: boolean;
  procesando: boolean;
  error: string | null;
  aviso: string | null;

  cargar: () => Promise<void>;
  sincronizar: () => Promise<void>;
  actualizar: (
    id: string,
    cambios: {
      nombre?: string;
      barraId?: string | null;
      activa?: boolean;
      activarPDV?: boolean;
    }
  ) => Promise<boolean>;
  limpiarMensajes: () => void;
}

function localIdActual(): string | undefined {
  return useAuthStore.getState().staff?.localId;
}

export const useTerminalesStore = create<TerminalesState>((set, get) => ({
  terminales: [],
  estadoPoint: null,
  huerfanos: [],
  cargando: false,
  sincronizando: false,
  procesando: false,
  error: null,
  aviso: null,

  cargar: async () => {
    const localId = localIdActual();
    if (!localId) return;

    set({ cargando: true, error: null });
    try {
      // Los huérfanos van con `catch` propio: es información de control, y si
      // falla (por ejemplo, un cajero sin permiso de admin) no tiene que
      // tumbar la pantalla de terminales.
      const [lista, estado, huerfanos] = await Promise.all([
        api.get<{ terminales: Terminal[] }>("/point/terminales", localId),
        api.get<EstadoPoint>("/point/estado", localId),
        api
          .get<{ huerfanos: CobroHuerfano[] }>("/point/cobros/huerfanos", localId)
          .catch(() => ({ huerfanos: [] })),
      ]);

      set({
        terminales: lista.terminales,
        estadoPoint: estado,
        huerfanos: huerfanos.huerfanos,
        cargando: false,
      });
    } catch (err) {
      set({
        cargando: false,
        error: err instanceof Error ? err.message : "Error al cargar terminales",
      });
    }
  },

  sincronizar: async () => {
    const localId = localIdActual();
    if (!localId) return;

    set({ sincronizando: true, error: null, aviso: null });
    try {
      const res = await api.post<{ terminales: Terminal[]; encontradas: number }>(
        "/point/terminales/sincronizar",
        {},
        localId
      );
      set({
        sincronizando: false,
        aviso:
          res.encontradas === 0
            ? "Mercado Pago no devolvió ninguna terminal. Verificá que estén vinculadas a la cuenta."
            : `${res.encontradas} terminal${res.encontradas > 1 ? "es" : ""} sincronizada${res.encontradas > 1 ? "s" : ""}.`,
      });
      await get().cargar();
    } catch (err) {
      set({
        sincronizando: false,
        error: err instanceof Error ? err.message : "Error al sincronizar con Mercado Pago",
      });
    }
  },

  actualizar: async (id, cambios) => {
    const localId = localIdActual();
    if (!localId) return false;

    set({ procesando: true, error: null, aviso: null });
    try {
      const res = await api.patch<{ terminal: Terminal; avisoReinicio?: string }>(
        `/point/terminales/${id}`,
        cambios,
        localId
      );

      set((s) => ({
        procesando: false,
        terminales: s.terminales.map((t) =>
          t.id === id ? { ...t, ...res.terminal } : t
        ),
        aviso: res.avisoReinicio ?? null,
      }));

      // El contador de terminales en PDV cambia con `activarPDV`.
      if (cambios.activarPDV) await get().cargar();

      return true;
    } catch (err) {
      set({
        procesando: false,
        error: err instanceof Error ? err.message : "Error al actualizar la terminal",
      });
      return false;
    }
  },

  limpiarMensajes: () => set({ error: null, aviso: null }),
}));

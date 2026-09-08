/**
 * Cortesías — tandas de accesos gratuitos para repartir.
 *
 * El flujo: se genera una tanda, se copian los links y se le pasan al RRPP por
 * WhatsApp. Cada link abre una página con el QR, sin que quien lo recibe tenga
 * que instalar ni registrar nada.
 */

import { create } from "zustand";
import { api } from "@/lib/apiClient";
import { useAuthStore } from "@/stores/authStore";

export interface LoteCortesias {
  id: string;
  nombre: string;
  evento: string;
  rrpp: string | null;
  validaHasta: string;
  anulado: boolean;
  total: number;
  usadas: number;
  createdAt: string;
}

export interface CodigoCortesia {
  codigo: string;
  usada: boolean;
  usadaAt: string | null;
}

interface CortesiasState {
  lotes: LoteCortesias[];
  cargando: boolean;
  procesando: boolean;
  error: string | null;

  /** Códigos del lote abierto. Se piden aparte porque pueden ser cientos. */
  codigos: CodigoCortesia[];
  cargandoCodigos: boolean;

  cargarLotes: (eventoId?: string) => Promise<void>;
  crearLote: (datos: {
    eventoId: string;
    nombre: string;
    cantidad: number;
    validaHasta: string;
    rrppId?: string | null;
  }) => Promise<boolean>;
  cargarCodigos: (loteId: string) => Promise<void>;
  anularLote: (loteId: string) => Promise<boolean>;
  limpiarError: () => void;
}

function getLocalId(): string | undefined {
  return useAuthStore.getState().staff?.localId;
}

export const useCortesiasStore = create<CortesiasState>((set, get) => ({
  lotes: [],
  cargando: false,
  procesando: false,
  error: null,
  codigos: [],
  cargandoCodigos: false,

  cargarLotes: async (eventoId) => {
    const localId = getLocalId();
    set({ cargando: true, error: null });
    try {
      const qs = eventoId ? `?eventoId=${eventoId}` : "";
      const data = await api.get<{ lotes: LoteCortesias[] }>(
        `/cortesias/lotes${qs}`, localId
      );
      set({ lotes: data.lotes, cargando: false });
    } catch (err) {
      set({
        cargando: false,
        error: err instanceof Error ? err.message : "Error al cargar las tandas",
      });
    }
  },

  crearLote: async (datos) => {
    const localId = getLocalId();
    set({ procesando: true, error: null });
    try {
      await api.post("/cortesias/lotes", datos, localId);
      set({ procesando: false });
      await get().cargarLotes();
      return true;
    } catch (err) {
      set({
        procesando: false,
        error: err instanceof Error ? err.message : "No se pudo generar la tanda",
      });
      return false;
    }
  },

  cargarCodigos: async (loteId) => {
    const localId = getLocalId();
    set({ cargandoCodigos: true, codigos: [] });
    try {
      const data = await api.get<{ cortesias: CodigoCortesia[] }>(
        `/cortesias/lotes/${loteId}/codigos`, localId
      );
      set({ codigos: data.cortesias, cargandoCodigos: false });
    } catch (err) {
      set({
        cargandoCodigos: false,
        error: err instanceof Error ? err.message : "Error al cargar los códigos",
      });
    }
  },

  anularLote: async (loteId) => {
    const localId = getLocalId();
    set({ procesando: true, error: null });
    try {
      await api.post(`/cortesias/lotes/${loteId}/anular`, {}, localId);
      set({ procesando: false });
      await get().cargarLotes();
      return true;
    } catch (err) {
      set({
        procesando: false,
        error: err instanceof Error ? err.message : "No se pudo anular la tanda",
      });
      return false;
    }
  },

  limpiarError: () => set({ error: null }),
}));

/**
 * Link que se comparte por WhatsApp.
 *
 * Se arma con el origen actual: en producción sale el dominio de Vercel y en
 * desarrollo el localhost, sin tener que configurar nada aparte.
 */
export function linkCortesia(codigo: string): string {
  return `${window.location.origin}/free/${codigo}`;
}

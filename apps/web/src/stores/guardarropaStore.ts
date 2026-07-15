/**
 * Store de Guardarropa — tickets offline-first.
 * Cola en localStorage para sync cuando vuelve la conexión.
 */

import { create } from "zustand";
import { api } from "@/lib/apiClient";
import { useAuthStore } from "@/stores/authStore";

const COLA_KEY = "niagara:guardarropa:cola";

// ── Tipos ─────────────────────────────────────────────────────────

export interface TicketGuardarropa {
  id: string;
  localId: string;
  eventoId: string | null;
  numeroTicket: number;
  descripcion: string | null;
  clienteNombre: string | null;
  entregado: boolean;
  createdAt: string;
  staff?: { nombre: string; apellido: string } | null;
  // Campo local para items en cola offline
  _offline?: boolean;
}

interface ItemCola {
  localId: string;
  tempId: string; // UUID local
  numeroTicket: number;
  descripcion: string | null;
  clienteNombre: string | null;
  eventoId: string | null;
  createdAt: string;
}

// ── Estado ────────────────────────────────────────────────────────

interface GuardarropaState {
  tickets: TicketGuardarropa[];
  cola: ItemCola[];         // items pendientes de sync
  siguienteNumero: number;  // número auto-incrementado local
  cargando: boolean;
  procesando: boolean;
  error: string | null;
  online: boolean;

  // Acciones
  cargarTickets: (eventoId?: string) => Promise<void>;
  cargarSiguienteNumero: (eventoId?: string) => Promise<void>;
  registrarPrenda: (datos: {
    numeroTicket?: number;
    descripcion?: string | null;
    clienteNombre?: string | null;
    eventoId?: string | null;
  }) => Promise<void>;
  entregar: (id: string) => Promise<boolean>;
  cancelar: (id: string) => Promise<boolean>;
  sincronizarCola: () => Promise<void>;
  setOnline: (online: boolean) => void;
  limpiarError: () => void;
}

// ── Helpers offline ───────────────────────────────────────────────

function leerCola(): ItemCola[] {
  try {
    return JSON.parse(localStorage.getItem(COLA_KEY) ?? "[]") as ItemCola[];
  } catch {
    return [];
  }
}

function guardarCola(cola: ItemCola[]) {
  localStorage.setItem(COLA_KEY, JSON.stringify(cola));
}

function getLocalId() {
  return useAuthStore.getState().staff?.localId;
}

// ── Store ─────────────────────────────────────────────────────────

export const useGuardarropaStore = create<GuardarropaState>((set, get) => ({
  tickets: [],
  cola: leerCola(),
  siguienteNumero: 1,
  cargando: false,
  procesando: false,
  error: null,
  online: navigator.onLine,

  cargarTickets: async (eventoId) => {
    const localId = getLocalId();
    set({ cargando: true, error: null });
    try {
      const params = eventoId ? `?eventoId=${eventoId}` : "";
      const data = await api.get<{ tickets: TicketGuardarropa[] }>(
        `/guardarropa${params}`, localId
      );
      // Mezclar con items offline que aún no synced
      const cola = get().cola;
      const ticketsOffline: TicketGuardarropa[] = cola.map((item) => ({
        id: item.tempId,
        localId: item.localId,
        eventoId: item.eventoId,
        numeroTicket: item.numeroTicket,
        descripcion: item.descripcion,
        clienteNombre: item.clienteNombre,
        entregado: false,
        createdAt: item.createdAt,
        _offline: true,
      }));
      set({ tickets: [...ticketsOffline, ...data.tickets], cargando: false });
    } catch {
      // Offline: mostrar solo los de la cola
      const cola = get().cola;
      const ticketsOffline: TicketGuardarropa[] = cola.map((item) => ({
        id: item.tempId,
        localId: item.localId,
        eventoId: item.eventoId,
        numeroTicket: item.numeroTicket,
        descripcion: item.descripcion,
        clienteNombre: item.clienteNombre,
        entregado: false,
        createdAt: item.createdAt,
        _offline: true,
      }));
      set({ tickets: ticketsOffline, cargando: false });
    }
  },

  cargarSiguienteNumero: async (eventoId) => {
    const localId = getLocalId();
    try {
      const params = eventoId ? `?eventoId=${eventoId}` : "";
      const data = await api.get<{ siguiente: number }>(
        `/guardarropa/siguiente-numero${params}`, localId
      );
      // Tomar el máximo entre el servidor y el número local de la cola
      const cola = get().cola;
      const maxLocal = cola.length > 0 ? Math.max(...cola.map((i) => i.numeroTicket)) : 0;
      set({ siguienteNumero: Math.max(data.siguiente, maxLocal + 1) });
    } catch {
      // Offline: calcular desde la cola local
      const cola = get().cola;
      const maxLocal = cola.length > 0 ? Math.max(...cola.map((i) => i.numeroTicket)) : 0;
      set({ siguienteNumero: maxLocal + 1 });
    }
  },

  registrarPrenda: async (datos) => {
    const localId = getLocalId() ?? "";
    const { online, siguienteNumero } = get();
    const numero = datos.numeroTicket ?? siguienteNumero;

    set({ procesando: true, error: null });

    if (!online) {
      // Guardar en cola offline
      const item: ItemCola = {
        tempId: crypto.randomUUID(),
        localId,
        numeroTicket: numero,
        descripcion: datos.descripcion ?? null,
        clienteNombre: datos.clienteNombre ?? null,
        eventoId: datos.eventoId ?? null,
        createdAt: new Date().toISOString(),
      };
      const cola = [...get().cola, item];
      guardarCola(cola);
      const ticketOffline: TicketGuardarropa = {
        id: item.tempId,
        localId,
        eventoId: item.eventoId,
        numeroTicket: item.numeroTicket,
        descripcion: item.descripcion,
        clienteNombre: item.clienteNombre,
        entregado: false,
        createdAt: item.createdAt,
        _offline: true,
      };
      set((s) => ({
        tickets: [ticketOffline, ...s.tickets],
        cola,
        siguienteNumero: numero + 1,
        procesando: false,
      }));
      return;
    }

    try {
      const data = await api.post<{ ticket: TicketGuardarropa }>("/guardarropa", {
        numeroTicket: numero,
        descripcion: datos.descripcion ?? null,
        clienteNombre: datos.clienteNombre ?? null,
        eventoId: datos.eventoId ?? null,
      }, localId);
      set((s) => ({
        tickets: [data.ticket, ...s.tickets],
        siguienteNumero: numero + 1,
        procesando: false,
      }));
    } catch (err) {
      set({ procesando: false, error: err instanceof Error ? err.message : "Error al registrar prenda" });
    }
  },

  entregar: async (id) => {
    const localId = getLocalId();
    set({ procesando: true });
    try {
      await api.patch(`/guardarropa/${id}/entregar`, {}, localId);
      set((s) => ({
        tickets: s.tickets.map((t) => t.id === id ? { ...t, entregado: true } : t),
        procesando: false,
      }));
      return true;
    } catch (err) {
      set({ procesando: false, error: err instanceof Error ? err.message : "Error al entregar prenda" });
      return false;
    }
  },

  cancelar: async (id) => {
    const localId = getLocalId();
    // Si es offline, eliminar de la cola
    const cola = get().cola.filter((i) => i.tempId !== id);
    if (cola.length !== get().cola.length) {
      guardarCola(cola);
      set((s) => ({ tickets: s.tickets.filter((t) => t.id !== id), cola }));
      return true;
    }
    set({ procesando: true });
    try {
      await api.delete(`/guardarropa/${id}`, localId);
      set((s) => ({ tickets: s.tickets.filter((t) => t.id !== id), procesando: false }));
      return true;
    } catch (err) {
      set({ procesando: false, error: err instanceof Error ? err.message : "Error al cancelar ticket" });
      return false;
    }
  },

  sincronizarCola: async () => {
    const localId = getLocalId() ?? "";
    const cola = get().cola;
    if (cola.length === 0) return;

    const errores: ItemCola[] = [];
    for (const item of cola) {
      try {
        await api.post("/guardarropa", {
          numeroTicket: item.numeroTicket,
          descripcion: item.descripcion,
          clienteNombre: item.clienteNombre,
          eventoId: item.eventoId,
        }, localId);
      } catch {
        errores.push(item); // mantener los que fallaron
      }
    }

    guardarCola(errores);
    set({ cola: errores });
    // Recargar desde servidor
    await get().cargarTickets();
  },

  setOnline: (online) => {
    set({ online });
    if (online) void get().sincronizarCola();
  },

  limpiarError: () => set({ error: null }),
}));

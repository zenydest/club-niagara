/**
 * Store de VIP — mesas y reservas.
 * Cubre:
 *  - CRUD de mesas (con posición en el mapa)
 *  - CRUD de reservas (con seña, personas, notas)
 *  - Estado de mesas en tiempo real (Socket.io)
 */

import { create } from "zustand";
import { api } from "@/lib/apiClient";
import { useAuthStore } from "@/stores/authStore";

// ── Tipos ─────────────────────────────────────────────────────────

export type EstadoMesa = "libre" | "reservada" | "ocupada" | "bloqueada";
export type EstadoReserva = "pendiente" | "confirmada" | "cancelada" | "completada";

export interface MesaVip {
  id: string;
  localId: string;
  numero: string;
  sector: string | null;
  capacidad: number;
  estado: EstadoMesa;
  posX: number;
  posY: number;
  reservaActiva?: ReservaResumen | null;
}

export interface ReservaResumen {
  id: string;
  clienteNombre: string;
  clienteTelefono: string | null;
  cantidadPersonas: number;
  estado: EstadoReserva;
  montoSena: number | null;
  createdAt: string;
}

export interface Reserva {
  id: string;
  localId: string;
  eventoId: string | null;
  mesaVipId: string | null;
  clienteNombre: string;
  clienteEmail: string | null;
  clienteTelefono: string | null;
  cantidadPersonas: number;
  estado: EstadoReserva;
  nota: string | null;
  montoSena: number | null;
  createdAt: string;
  mesaVip?: { numero: string; sector: string | null; capacidad: number } | null;
  evento?: { nombre: string } | null;
}

// ── Estado ────────────────────────────────────────────────────────

interface VipState {
  mesas: MesaVip[];
  reservas: Reserva[];
  cargando: boolean;
  cargandoReservas: boolean;
  procesando: boolean;
  error: string | null;
  errorOperacion: string | null;

  // Acciones — mesas
  cargarMesas: (eventoId?: string) => Promise<void>;
  crearMesa: (datos: { numero: string; sector?: string | null; capacidad: number; posX?: number; posY?: number }) => Promise<MesaVip | null>;
  editarMesa: (id: string, datos: Partial<MesaVip>) => Promise<boolean>;
  moverMesa: (id: string, posX: number, posY: number) => Promise<void>;
  cambiarEstadoMesa: (id: string, estado: EstadoMesa) => Promise<boolean>;
  eliminarMesa: (id: string) => Promise<boolean>;

  // Acciones — reservas
  cargarReservas: (filtros?: { eventoId?: string; estado?: EstadoReserva; mesaVipId?: string }) => Promise<void>;
  crearReserva: (datos: {
    mesaVipId?: string | null;
    eventoId?: string | null;
    clienteNombre: string;
    clienteEmail?: string | null;
    clienteTelefono?: string | null;
    cantidadPersonas: number;
    nota?: string | null;
    montoSena?: number | null;
  }) => Promise<Reserva | null>;
  editarReserva: (id: string, datos: Partial<Reserva>) => Promise<boolean>;
  cambiarEstadoReserva: (id: string, estado: EstadoReserva) => Promise<boolean>;
  eliminarReserva: (id: string) => Promise<boolean>;

  // Actualización vía Socket.io (llamado desde authStore / socket)
  actualizarMesaSocket: (mesa: Partial<MesaVip> & { id: string }) => void;
  eliminarMesaSocket: (id: string) => void;

  limpiarError: () => void;
}

// ── Helper ────────────────────────────────────────────────────────

function getLocalId(): string | undefined {
  return useAuthStore.getState().staff?.localId;
}

// ── Store ─────────────────────────────────────────────────────────

export const useVipStore = create<VipState>((set, get) => ({
  mesas: [],
  reservas: [],
  cargando: false,
  cargandoReservas: false,
  procesando: false,
  error: null,
  errorOperacion: null,

  // ── Mesas ──────────────────────────────────────────────────

  cargarMesas: async (eventoId) => {
    const localId = getLocalId();
    set({ cargando: true, error: null });
    try {
      const params = eventoId ? `?eventoId=${eventoId}` : "";
      const data = await api.get<{ mesas: MesaVip[] }>(`/vip/mesas${params}`, localId);
      set({ mesas: data.mesas, cargando: false });
    } catch (err) {
      set({ cargando: false, error: err instanceof Error ? err.message : "Error al cargar mesas" });
    }
  },

  crearMesa: async (datos) => {
    const localId = getLocalId();
    set({ procesando: true, errorOperacion: null });
    try {
      const data = await api.post<{ mesa: MesaVip }>("/vip/mesas", datos, localId);
      set((s) => ({ mesas: [...s.mesas, data.mesa], procesando: false }));
      return data.mesa;
    } catch (err) {
      set({ procesando: false, errorOperacion: err instanceof Error ? err.message : "Error al crear mesa" });
      return null;
    }
  },

  editarMesa: async (id, datos) => {
    const localId = getLocalId();
    set({ procesando: true, errorOperacion: null });
    try {
      const data = await api.patch<{ mesa: MesaVip }>(`/vip/mesas/${id}`, datos, localId);
      set((s) => ({
        mesas: s.mesas.map((m) => (m.id === id ? { ...m, ...data.mesa } : m)),
        procesando: false,
      }));
      return true;
    } catch (err) {
      set({ procesando: false, errorOperacion: err instanceof Error ? err.message : "Error al editar mesa" });
      return false;
    }
  },

  // Actualización optimista de posición (drag & drop — sin spinner)
  moverMesa: async (id, posX, posY) => {
    const localId = getLocalId();
    // Actualizar local inmediatamente para UX fluida
    set((s) => ({
      mesas: s.mesas.map((m) => (m.id === id ? { ...m, posX, posY } : m)),
    }));
    try {
      await api.patch(`/vip/mesas/${id}`, { posX, posY }, localId);
    } catch {
      // Recargar si falla para revertir
      void get().cargarMesas();
    }
  },

  cambiarEstadoMesa: async (id, estado) => {
    const localId = getLocalId();
    try {
      await api.patch(`/vip/mesas/${id}/estado`, { estado }, localId);
      set((s) => ({
        mesas: s.mesas.map((m) => (m.id === id ? { ...m, estado } : m)),
      }));
      return true;
    } catch (err) {
      set({ errorOperacion: err instanceof Error ? err.message : "Error al cambiar estado" });
      return false;
    }
  },

  eliminarMesa: async (id) => {
    const localId = getLocalId();
    set({ procesando: true, errorOperacion: null });
    try {
      await api.delete(`/vip/mesas/${id}`, localId);
      set((s) => ({ mesas: s.mesas.filter((m) => m.id !== id), procesando: false }));
      return true;
    } catch (err) {
      set({ procesando: false, errorOperacion: err instanceof Error ? err.message : "Error al eliminar mesa" });
      return false;
    }
  },

  // ── Reservas ───────────────────────────────────────────────

  cargarReservas: async (filtros) => {
    const localId = getLocalId();
    set({ cargandoReservas: true });
    try {
      const params = new URLSearchParams();
      if (filtros?.eventoId) params.set("eventoId", filtros.eventoId);
      if (filtros?.estado) params.set("estado", filtros.estado);
      if (filtros?.mesaVipId) params.set("mesaVipId", filtros.mesaVipId);
      const qs = params.toString();
      const data = await api.get<{ reservas: Reserva[] }>(`/vip/reservas${qs ? `?${qs}` : ""}`, localId);
      set({ reservas: data.reservas, cargandoReservas: false });
    } catch {
      set({ cargandoReservas: false });
    }
  },

  crearReserva: async (datos) => {
    const localId = getLocalId();
    set({ procesando: true, errorOperacion: null });
    try {
      const data = await api.post<{ reserva: Reserva }>("/vip/reservas", datos, localId);
      set((s) => ({
        reservas: [data.reserva, ...s.reservas],
        // Actualizar estado de mesa si corresponde
        mesas: datos.mesaVipId
          ? s.mesas.map((m) => m.id === datos.mesaVipId ? { ...m, estado: "reservada" } : m)
          : s.mesas,
        procesando: false,
      }));
      return data.reserva;
    } catch (err) {
      set({ procesando: false, errorOperacion: err instanceof Error ? err.message : "Error al crear reserva" });
      return null;
    }
  },

  editarReserva: async (id, datos) => {
    const localId = getLocalId();
    set({ procesando: true, errorOperacion: null });
    try {
      const data = await api.patch<{ reserva: Reserva }>(`/vip/reservas/${id}`, datos, localId);
      set((s) => ({
        reservas: s.reservas.map((r) => (r.id === id ? data.reserva : r)),
        procesando: false,
      }));
      return true;
    } catch (err) {
      set({ procesando: false, errorOperacion: err instanceof Error ? err.message : "Error al editar reserva" });
      return false;
    }
  },

  cambiarEstadoReserva: async (id, estado) => {
    const localId = getLocalId();
    set({ procesando: true, errorOperacion: null });
    try {
      const data = await api.patch<{ reserva: Reserva }>(`/vip/reservas/${id}/estado`, { estado }, localId);
      set((s) => {
        // Liberar mesa si se cancela o completa
        const reservaAnterior = s.reservas.find((r) => r.id === id);
        const liberarMesa = ["cancelada", "completada"].includes(estado) && reservaAnterior?.mesaVipId;
        return {
          reservas: s.reservas.map((r) => (r.id === id ? data.reserva : r)),
          mesas: liberarMesa
            ? s.mesas.map((m) => m.id === reservaAnterior?.mesaVipId ? { ...m, estado: "libre" } : m)
            : s.mesas,
          procesando: false,
        };
      });
      return true;
    } catch (err) {
      set({ procesando: false, errorOperacion: err instanceof Error ? err.message : "Error al cambiar estado" });
      return false;
    }
  },

  eliminarReserva: async (id) => {
    const localId = getLocalId();
    set({ procesando: true, errorOperacion: null });
    try {
      const reserva = get().reservas.find((r) => r.id === id);
      await api.delete(`/vip/reservas/${id}`, localId);
      set((s) => ({
        reservas: s.reservas.filter((r) => r.id !== id),
        // Liberar mesa si tenía
        mesas: reserva?.mesaVipId
          ? s.mesas.map((m) => m.id === reserva.mesaVipId ? { ...m, estado: "libre" } : m)
          : s.mesas,
        procesando: false,
      }));
      return true;
    } catch (err) {
      set({ procesando: false, errorOperacion: err instanceof Error ? err.message : "Error al eliminar reserva" });
      return false;
    }
  },

  // ── Socket.io ─────────────────────────────────────────────

  actualizarMesaSocket: (mesa) => {
    set((s) => ({
      mesas: s.mesas.map((m) => (m.id === mesa.id ? { ...m, ...mesa } : m)),
    }));
  },

  eliminarMesaSocket: (id) => {
    set((s) => ({ mesas: s.mesas.filter((m) => m.id !== id) }));
  },

  limpiarError: () => set({ error: null, errorOperacion: null }),
}));

// ── Constantes de UI ───────────────────────────────────────────────

export const ESTADO_MESA_CONFIG: Record<EstadoMesa, {
  label: string;
  color: string;
  bg: string;
  border: string;
  dot: string;
}> = {
  libre:     { label: "Libre",     color: "text-green-400",        bg: "bg-green-500/10",    border: "border-green-500/30",  dot: "bg-green-400" },
  reservada: { label: "Reservada", color: "text-yellow-400",       bg: "bg-yellow-500/10",   border: "border-yellow-500/30", dot: "bg-yellow-400" },
  ocupada:   { label: "Ocupada",   color: "text-accent",           bg: "bg-accent/10",       border: "border-accent/30",     dot: "bg-accent" },
  bloqueada: { label: "Bloqueada", color: "text-text-secondary",   bg: "bg-surface-2",       border: "border-border",        dot: "bg-text-secondary" },
};

export const ESTADO_RESERVA_CONFIG: Record<EstadoReserva, {
  label: string;
  color: string;
  bg: string;
}> = {
  pendiente:   { label: "Pendiente",   color: "text-yellow-400", bg: "bg-yellow-500/10" },
  confirmada:  { label: "Confirmada",  color: "text-green-400",  bg: "bg-green-500/10" },
  cancelada:   { label: "Cancelada",   color: "text-danger",     bg: "bg-danger/10" },
  completada:  { label: "Completada",  color: "text-text-secondary", bg: "bg-surface-2" },
};

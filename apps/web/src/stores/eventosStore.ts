/**
 * Store de Eventos y Boletería.
 *
 * Cubre:
 *  - CRUD de eventos
 *  - Tipos de entrada por evento
 *  - Venta de entradas
 *  - Listado de entradas vendidas
 */

import { create } from "zustand";
import type { NombreIcono } from "@/components/Icono";
import { api } from "@/lib/apiClient";
import { useAuthStore } from "@/stores/authStore";

// ── Tipos ─────────────────────────────────────────────────────────

export interface Evento {
  id: string;
  localId: string;
  nombre: string;
  descripcion: string | null;
  fechaInicio: string;
  fechaFin: string | null;
  capacidad: number;
  aforoActual: number;
  estado: "borrador" | "preventa" | "en_vivo" | "cerrado" | "cancelado";
  imagenUrl: string | null;
  createdAt: string;
  updatedAt: string;
  entradasTipo?: TipoEntrada[];
  _count?: { accesos: number; ventas: number; entradasVendidas: number };
}

export interface TipoEntrada {
  id: string;
  eventoId: string;
  localId: string;
  nombre: string;
  tipo: "general" | "vip" | "rrpp" | "invitado" | "staff";
  precio: number;
  cantidadTotal: number | null;
  cantidadVendida: number;
  activo: boolean;
}

export interface EntradaVendida {
  id: string;
  localId: string;
  eventoId: string;
  entradaTipoId: string;
  qrCode: string;
  clienteNombre: string | null;
  clienteEmail: string | null;
  clienteTelefono: string | null;
  precioPagado: number;
  metodoPago: string;
  rrppId: string | null;
  usada: boolean;
  createdAt: string;
  entradaTipo?: { nombre: string; tipo: string };
  rrpp?: { nombre: string; apellido: string } | null;
}

export interface StaffRrpp {
  id: string;
  nombre: string;
  apellido: string;
}

// ── Estado ────────────────────────────────────────────────────────

interface EventosState {
  // Eventos
  eventos: Evento[];
  eventoActual: Evento | null;
  cargando: boolean;
  error: string | null;

  // Tipos de entrada del evento actual
  tipos: TipoEntrada[];
  cargandoTipos: boolean;

  // Entradas vendidas
  vendidas: EntradaVendida[];
  cargandoVendidas: boolean;

  // Staff RRPP disponibles para asignar
  staffRrpp: StaffRrpp[];

  // Operaciones
  procesando: boolean;
  errorOperacion: string | null;

  // Acciones — eventos
  cargarEventos: (estado?: string) => Promise<void>;
  cargarEvento: (id: string) => Promise<void>;
  crearEvento: (datos: Omit<Evento, "id" | "localId" | "aforoActual" | "estado" | "createdAt" | "updatedAt">) => Promise<Evento | null>;
  editarEvento: (id: string, datos: Partial<Evento>) => Promise<boolean>;
  /**
   * Solo funciona con eventos sin movimiento. Si ya tuvo ventas, entradas o
   * accesos, la API lo rechaza y el error explica por qué: esa información es
   * la recaudación de esa noche.
   */
  eliminarEvento: (id: string) => Promise<boolean>;
  cambiarEstado: (id: string, estado: Evento["estado"]) => Promise<boolean>;
  setEventoActual: (evento: Evento | null) => void;

  // Acciones — tipos de entrada
  cargarTipos: (eventoId: string) => Promise<void>;
  crearTipo: (datos: Omit<TipoEntrada, "id" | "localId" | "cantidadVendida" | "activo">) => Promise<TipoEntrada | null>;
  editarTipo: (id: string, datos: Partial<TipoEntrada>) => Promise<boolean>;
  eliminarTipo: (id: string) => Promise<boolean>;

  // Acciones — venta
  venderEntrada: (datos: {
    eventoId: string;
    entradaTipoId: string;
    clienteNombre: string;
    clienteEmail?: string | null;
    clienteTelefono?: string | null;
    metodoPago: string;
    precioPagado: number;
    rrppId?: string | null;
    cantidad?: number;
  }) => Promise<EntradaVendida[] | null>;

  // Acciones — listado vendidas
  cargarVendidas: (eventoId: string, filtros?: { busqueda?: string; usada?: boolean; entradaTipoId?: string }) => Promise<void>;
  marcarUsada: (id: string) => Promise<boolean>;

  // Utilidades
  limpiarError: () => void;
}

// ── Helper ────────────────────────────────────────────────────────

function getLocalId(): string | undefined {
  return useAuthStore.getState().staff?.localId;
}

// ── Store ─────────────────────────────────────────────────────────

export const useEventosStore = create<EventosState>((set) => ({
  eventos: [],
  eventoActual: null,
  cargando: false,
  error: null,

  tipos: [],
  cargandoTipos: false,

  vendidas: [],
  cargandoVendidas: false,

  staffRrpp: [],

  procesando: false,
  errorOperacion: null,

  // ── Eventos ────────────────────────────────────────────────

  cargarEventos: async (estado) => {
    const localId = getLocalId();
    set({ cargando: true, error: null });
    try {
      const params = estado ? `?estado=${estado}` : "";
      const data = await api.get<{ eventos: Evento[] }>(`/eventos${params}`, localId);
      set({ eventos: data.eventos, cargando: false });
    } catch (err) {
      set({ cargando: false, error: err instanceof Error ? err.message : "Error al cargar eventos" });
    }
  },

  cargarEvento: async (id) => {
    const localId = getLocalId();
    try {
      const data = await api.get<{ evento: Evento }>(`/eventos/${id}`, localId);
      set({ eventoActual: data.evento });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Error al cargar evento" });
    }
  },

  crearEvento: async (datos) => {
    const localId = getLocalId();
    set({ procesando: true, errorOperacion: null });
    try {
      const data = await api.post<{ evento: Evento }>("/eventos", {
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        fechaInicio: datos.fechaInicio,
        fechaFin: datos.fechaFin,
        capacidad: datos.capacidad,
        imagenUrl: datos.imagenUrl,
      }, localId);
      set((s) => ({ eventos: [data.evento, ...s.eventos], procesando: false }));
      return data.evento;
    } catch (err) {
      set({ procesando: false, errorOperacion: err instanceof Error ? err.message : "Error al crear evento" });
      return null;
    }
  },

  editarEvento: async (id, datos) => {
    const localId = getLocalId();
    set({ procesando: true, errorOperacion: null });
    try {
      const data = await api.patch<{ evento: Evento }>(`/eventos/${id}`, datos, localId);
      set((s) => ({
        eventos: s.eventos.map((e) => (e.id === id ? data.evento : e)),
        eventoActual: s.eventoActual?.id === id ? data.evento : s.eventoActual,
        procesando: false,
      }));
      return true;
    } catch (err) {
      set({ procesando: false, errorOperacion: err instanceof Error ? err.message : "Error al editar" });
      return false;
    }
  },

  eliminarEvento: async (id) => {
    const localId = getLocalId();
    set({ procesando: true, errorOperacion: null });
    try {
      await api.delete(`/eventos/${id}`, localId);
      set((s) => ({
        eventos: s.eventos.filter((e) => e.id !== id),
        eventoActual: s.eventoActual?.id === id ? null : s.eventoActual,
        procesando: false,
      }));
      return true;
    } catch (err) {
      set({
        procesando: false,
        errorOperacion: err instanceof Error ? err.message : "No se pudo eliminar el evento",
      });
      return false;
    }
  },

  cambiarEstado: async (id, estado) => {
    const localId = getLocalId();
    set({ procesando: true, errorOperacion: null });
    try {
      const data = await api.patch<{ evento: Evento }>(`/eventos/${id}/estado`, { estado }, localId);
      set((s) => ({
        eventos: s.eventos.map((e) => (e.id === id ? data.evento : e)),
        eventoActual: s.eventoActual?.id === id ? data.evento : s.eventoActual,
        procesando: false,
      }));
      return true;
    } catch (err) {
      set({ procesando: false, errorOperacion: err instanceof Error ? err.message : "Error al cambiar estado" });
      return false;
    }
  },

  setEventoActual: (evento) => set({ eventoActual: evento, tipos: [], vendidas: [] }),

  // ── Tipos de entrada ────────────────────────────────────────

  cargarTipos: async (eventoId) => {
    const localId = getLocalId();
    set({ cargandoTipos: true });
    try {
      const data = await api.get<{ tipos: TipoEntrada[] }>(`/entradas/tipos?eventoId=${eventoId}`, localId);
      set({ tipos: data.tipos, cargandoTipos: false });
    } catch {
      set({ cargandoTipos: false });
    }
  },

  crearTipo: async (datos) => {
    const localId = getLocalId();
    set({ procesando: true, errorOperacion: null });
    try {
      const data = await api.post<{ tipo: TipoEntrada }>("/entradas/tipos", datos, localId);
      set((s) => ({ tipos: [...s.tipos, data.tipo], procesando: false }));
      return data.tipo;
    } catch (err) {
      set({ procesando: false, errorOperacion: err instanceof Error ? err.message : "Error al crear tipo" });
      return null;
    }
  },

  editarTipo: async (id, datos) => {
    const localId = getLocalId();
    set({ procesando: true, errorOperacion: null });
    try {
      const data = await api.patch<{ tipo: TipoEntrada }>(`/entradas/tipos/${id}`, datos, localId);
      set((s) => ({ tipos: s.tipos.map((t) => (t.id === id ? data.tipo : t)), procesando: false }));
      return true;
    } catch (err) {
      set({ procesando: false, errorOperacion: err instanceof Error ? err.message : "Error al editar tipo" });
      return false;
    }
  },

  eliminarTipo: async (id) => {
    const localId = getLocalId();
    set({ procesando: true, errorOperacion: null });
    try {
      await api.delete(`/entradas/tipos/${id}`, localId);
      set((s) => ({ tipos: s.tipos.filter((t) => t.id !== id), procesando: false }));
      return true;
    } catch (err) {
      set({ procesando: false, errorOperacion: err instanceof Error ? err.message : "Error al eliminar tipo" });
      return false;
    }
  },

  // ── Venta ──────────────────────────────────────────────────

  venderEntrada: async (datos) => {
    const localId = getLocalId();
    set({ procesando: true, errorOperacion: null });
    try {
      const data = await api.post<{ entradas: EntradaVendida[]; cantidad: number }>(
        "/entradas/vender",
        datos,
        localId
      );
      // Agregar las nuevas entradas al listado local
      set((s) => ({
        vendidas: [...data.entradas, ...s.vendidas],
        procesando: false,
        // Actualizar cantidadVendida del tipo
        tipos: s.tipos.map((t) =>
          t.id === datos.entradaTipoId
            ? { ...t, cantidadVendida: t.cantidadVendida + (datos.cantidad ?? 1) }
            : t
        ),
      }));
      return data.entradas;
    } catch (err) {
      set({ procesando: false, errorOperacion: err instanceof Error ? err.message : "Error al vender entrada" });
      return null;
    }
  },

  // ── Vendidas ───────────────────────────────────────────────

  cargarVendidas: async (eventoId, filtros) => {
    const localId = getLocalId();
    set({ cargandoVendidas: true });
    try {
      const params = new URLSearchParams({ eventoId });
      if (filtros?.busqueda) params.set("busqueda", filtros.busqueda);
      if (filtros?.usada !== undefined) params.set("usada", String(filtros.usada));
      if (filtros?.entradaTipoId) params.set("entradaTipoId", filtros.entradaTipoId);

      const data = await api.get<{ vendidas: EntradaVendida[] }>(
        `/entradas/vendidas?${params.toString()}`,
        localId
      );
      set({ vendidas: data.vendidas, cargandoVendidas: false });
    } catch {
      set({ cargandoVendidas: false });
    }
  },

  marcarUsada: async (id) => {
    const localId = getLocalId();
    set({ procesando: true });
    try {
      await api.patch(`/entradas/vendidas/${id}/usar`, {}, localId);
      set((s) => ({
        vendidas: s.vendidas.map((v) => (v.id === id ? { ...v, usada: true } : v)),
        procesando: false,
      }));
      return true;
    } catch {
      set({ procesando: false });
      return false;
    }
  },

  limpiarError: () => set({ error: null, errorOperacion: null }),
}));

// ── Constantes de UI ───────────────────────────────────────────────

export const ESTADO_CONFIG = {
  borrador:  { label: "Borrador",  color: "text-text-secondary", bg: "bg-surface-2",       border: "border-border" },
  preventa:  { label: "Preventa",  color: "text-blue-400",       bg: "bg-blue-500/10",     border: "border-blue-500/30" },
  en_vivo:   { label: "En vivo",   color: "text-green-400",      bg: "bg-green-500/10",    border: "border-green-500/30" },
  cerrado:   { label: "Cerrado",   color: "text-text-secondary", bg: "bg-surface-2",       border: "border-border" },
  cancelado: { label: "Cancelado", color: "text-danger",         bg: "bg-danger/10",       border: "border-danger/30" },
} as const;

export const TIPO_ENTRADA_CONFIG: Record<
  TipoEntrada["tipo"],
  { label: string; icono: NombreIcono }
> = {
  general:  { label: "General",  icono: "entrada" },
  vip:      { label: "VIP",      icono: "reservas" },
  rrpp:     { label: "RRPP",     icono: "personal" },
  invitado: { label: "Invitado", icono: "cortesia" },
  staff:    { label: "Staff",    icono: "personal" },
} as const;

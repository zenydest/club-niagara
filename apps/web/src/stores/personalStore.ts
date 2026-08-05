/**
 * Store de Personal — staff y comisiones RRPP.
 */

import { create } from "zustand";
import type { NombreIcono } from "@/components/Icono";
import { api } from "@/lib/apiClient";
import { useAuthStore } from "@/stores/authStore";

// ── Tipos ─────────────────────────────────────────────────────────

export type RolStaff = "admin" | "encargado" | "cajero" | "portero" | "rrpp" | "barman";

export interface StaffMiembro {
  id: string;
  localId: string;
  nombre: string;
  apellido: string;
  email: string;
  rol: RolStaff;
  activo: boolean;
  createdAt: string;
  user: { email: string; createdAt: string };
  _count?: { ventas: number; accesos: number };
}

export interface ComisionRrpp {
  id: string;
  staffId: string;
  eventoId: string;
  entradasVendidas: number;
  montoTotalVentas: number;
  porcentajeComision: number;
  montoComision: number;
  pagada: boolean;
  createdAt: string;
  staff: { nombre: string; apellido: string; rol: string };
  evento: { nombre: string; fechaInicio: string };
}

// ── Estado ────────────────────────────────────────────────────────

interface PersonalState {
  staff: StaffMiembro[];
  comisiones: ComisionRrpp[];
  cargando: boolean;
  cargandoComisiones: boolean;
  procesando: boolean;
  error: string | null;

  cargarStaff: (soloActivos?: boolean) => Promise<void>;
  crearStaff: (datos: {
    email: string;
    nombre: string;
    apellido: string;
    rol: RolStaff;
    password: string;
  }) => Promise<StaffMiembro | null>;
  editarStaff: (id: string, datos: { nombre?: string; apellido?: string; rol?: RolStaff }) => Promise<boolean>;
  /**
   * Cambia email y/o contraseña. Devuelve `sesionesCerradas` en true cuando se
   * cambió la contraseña, para poder avisarle al admin que esa persona va a
   * tener que volver a iniciar sesión.
   */
  cambiarCredenciales: (
    id: string,
    datos: { email?: string; password?: string }
  ) => Promise<{ sesionesCerradas: boolean } | null>;
  cambiarEstado: (id: string, activo: boolean) => Promise<boolean>;

  cargarComisiones: (filtros?: { eventoId?: string; staffId?: string; pagada?: boolean }) => Promise<void>;
  calcularComision: (datos: { staffId: string; eventoId: string; porcentajeComision: number }) => Promise<ComisionRrpp | null>;
  pagarComision: (id: string) => Promise<boolean>;

  limpiarError: () => void;
}

function getLocalId() {
  return useAuthStore.getState().staff?.localId;
}

// ── Store ─────────────────────────────────────────────────────────

export const usePersonalStore = create<PersonalState>((set) => ({
  staff: [],
  comisiones: [],
  cargando: false,
  cargandoComisiones: false,
  procesando: false,
  error: null,

  cargarStaff: async (soloActivos = false) => {
    const localId = getLocalId();
    set({ cargando: true, error: null });
    try {
      const params = soloActivos ? "?soloActivos=true" : "";
      const data = await api.get<{ staff: StaffMiembro[] }>(`/personal${params}`, localId);
      set({ staff: data.staff, cargando: false });
    } catch (err) {
      set({ cargando: false, error: err instanceof Error ? err.message : "Error al cargar staff" });
    }
  },

  crearStaff: async (datos) => {
    const localId = getLocalId();
    set({ procesando: true, error: null });
    try {
      const data = await api.post<{ staff: StaffMiembro }>("/personal", datos, localId);
      set((s) => ({ staff: [data.staff, ...s.staff], procesando: false }));
      return data.staff;
    } catch (err) {
      set({ procesando: false, error: err instanceof Error ? err.message : "Error al crear staff" });
      return null;
    }
  },

  editarStaff: async (id, datos) => {
    const localId = getLocalId();
    set({ procesando: true, error: null });
    try {
      const data = await api.patch<{ staff: StaffMiembro }>(`/personal/${id}`, datos, localId);
      set((s) => ({
        staff: s.staff.map((m) => m.id === id ? data.staff : m),
        procesando: false,
      }));
      return true;
    } catch (err) {
      set({ procesando: false, error: err instanceof Error ? err.message : "Error al editar" });
      return false;
    }
  },

  cambiarCredenciales: async (id, datos) => {
    const localId = getLocalId();
    set({ procesando: true, error: null });
    try {
      const data = await api.patch<{ staff: StaffMiembro; sesionesCerradas: boolean }>(
        `/personal/${id}/credenciales`, datos, localId
      );
      set((s) => ({
        staff: s.staff.map((m) => m.id === id ? data.staff : m),
        procesando: false,
      }));
      return { sesionesCerradas: data.sesionesCerradas };
    } catch (err) {
      set({ procesando: false, error: err instanceof Error ? err.message : "Error al cambiar credenciales" });
      return null;
    }
  },

  cambiarEstado: async (id, activo) => {
    const localId = getLocalId();
    set({ procesando: true, error: null });
    try {
      await api.patch(`/personal/${id}/estado`, { activo }, localId);
      set((s) => ({
        staff: s.staff.map((m) => m.id === id ? { ...m, activo } : m),
        procesando: false,
      }));
      return true;
    } catch (err) {
      set({ procesando: false, error: err instanceof Error ? err.message : "Error al cambiar estado" });
      return false;
    }
  },

  cargarComisiones: async (filtros = {}) => {
    const localId = getLocalId();
    set({ cargandoComisiones: true });
    try {
      const params = new URLSearchParams();
      if (filtros.eventoId) params.set("eventoId", filtros.eventoId);
      if (filtros.staffId) params.set("staffId", filtros.staffId);
      if (filtros.pagada !== undefined) params.set("pagada", String(filtros.pagada));
      const qs = params.toString();
      const data = await api.get<{ comisiones: ComisionRrpp[] }>(
        `/personal/comisiones${qs ? `?${qs}` : ""}`, localId
      );
      set({ comisiones: data.comisiones, cargandoComisiones: false });
    } catch {
      set({ cargandoComisiones: false });
    }
  },

  calcularComision: async (datos) => {
    const localId = getLocalId();
    set({ procesando: true, error: null });
    try {
      const data = await api.post<{ comision: ComisionRrpp }>("/personal/comisiones", datos, localId);
      set((s) => ({
        comisiones: [
          data.comision,
          ...s.comisiones.filter((c) => !(c.staffId === datos.staffId && c.eventoId === datos.eventoId)),
        ],
        procesando: false,
      }));
      return data.comision;
    } catch (err) {
      set({ procesando: false, error: err instanceof Error ? err.message : "Error al calcular comisión" });
      return null;
    }
  },

  pagarComision: async (id) => {
    const localId = getLocalId();
    set({ procesando: true, error: null });
    try {
      const data = await api.patch<{ comision: ComisionRrpp }>(`/personal/comisiones/${id}/pagar`, {}, localId);
      set((s) => ({
        comisiones: s.comisiones.map((c) => c.id === id ? data.comision : c),
        procesando: false,
      }));
      return true;
    } catch (err) {
      set({ procesando: false, error: err instanceof Error ? err.message : "Error al pagar comisión" });
      return false;
    }
  },

  limpiarError: () => set({ error: null }),
}));

// ── Constantes de UI ───────────────────────────────────────────────

export const ROL_CONFIG: Record<
  RolStaff,
  { label: string; icono: NombreIcono; color: string }
> = {
  admin:     { label: "Admin",     icono: "dashboard",  color: "text-accent" },
  encargado: { label: "Encargado", icono: "actividad",  color: "text-purple-400" },
  cajero:    { label: "Cajero",    icono: "caja",       color: "text-blue-400" },
  portero:   { label: "Portero",   icono: "porteria",   color: "text-yellow-400" },
  rrpp:      { label: "RRPP",      icono: "personal",   color: "text-green-400" },
  barman:    { label: "Barman",    icono: "producto",   color: "text-orange-400" },
};

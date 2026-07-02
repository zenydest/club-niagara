/**
 * Store de Cashless — gestión de tarjetas/pulseras con saldo.
 *
 * Cubre:
 *  - Lista de tarjetas del local
 *  - Consulta rápida por código (para barra)
 *  - Recarga de saldo
 *  - Cobro (descuento de saldo)
 *  - Creación de preferencias MP para QR
 */

import { create } from "zustand";
import { api } from "@/lib/apiClient";
import { useAuthStore } from "@/stores/authStore";

// ── Tipos ─────────────────────────────────────────────────────────

export interface TarjetaCashless {
  id: string;
  codigo: string;
  clienteNombre: string | null;
  clienteEmail: string | null;
  saldo: number;
  activa: boolean;
  createdAt: string;
  updatedAt: string;
  recargas?: RecargaResumen[];
  _count?: { recargas: number };
}

export interface RecargaResumen {
  id?: string;
  monto: number;
  metodoPago: string;
  createdAt: string;
  staff?: { nombre: string; apellido: string };
}

export interface PreferenciaMP {
  preferenciaId: string;
  qrData: string | null;
  initPoint: string | null;
  simulado: boolean;
}

// ── Estado ────────────────────────────────────────────────────────

interface CashlessState {
  // Lista de tarjetas
  tarjetas: TarjetaCashless[];
  cargando: boolean;
  error: string | null;

  // Tarjeta consultada (para barra/cobro rápido)
  tarjetaConsultada: TarjetaCashless | null;
  consultando: boolean;
  errorConsulta: string | null;

  // Estado de operaciones
  procesando: boolean;
  errorOperacion: string | null;

  // MP QR
  preferenciaMP: PreferenciaMP | null;
  cargandoQR: boolean;

  // Acciones — lista
  cargarTarjetas: (busqueda?: string) => Promise<void>;

  // Acciones — consulta individual
  consultarTarjeta: (codigo: string) => Promise<TarjetaCashless | null>;
  limpiarConsulta: () => void;

  // Acciones — operaciones
  crearTarjeta: (datos: {
    codigo: string;
    clienteNombre?: string;
    clienteEmail?: string;
    saldoInicial?: number;
  }) => Promise<TarjetaCashless | null>;

  recargar: (
    tarjetaCodigo: string,
    monto: number,
    metodoPago: "efectivo" | "tarjeta" | "qr_mp" | "cortesia",
    mpPaymentId?: string
  ) => Promise<{ nuevoSaldo: number } | null>;

  cobrar: (
    tarjetaCodigo: string,
    monto: number
  ) => Promise<{ ok: boolean; nuevoSaldo: number; error?: string } | null>;

  cambiarEstado: (codigo: string, activa: boolean) => Promise<boolean>;

  // Acciones — MP
  crearPreferenciaMP: (monto: number, descripcion?: string, referencia?: string) => Promise<PreferenciaMP | null>;
  limpiarPreferenciaMP: () => void;

  // Limpiar errores
  limpiarError: () => void;
}

// ── Helper ────────────────────────────────────────────────────────

function getLocalId(): string | undefined {
  return useAuthStore.getState().staff?.localId;
}

// ── Store ─────────────────────────────────────────────────────────

export const useCashlessStore = create<CashlessState>((set, get) => ({
  tarjetas: [],
  cargando: false,
  error: null,

  tarjetaConsultada: null,
  consultando: false,
  errorConsulta: null,

  procesando: false,
  errorOperacion: null,

  preferenciaMP: null,
  cargandoQR: false,

  // ── Lista de tarjetas ───────────────────────────────────────

  cargarTarjetas: async (busqueda) => {
    const localId = getLocalId();
    set({ cargando: true, error: null });
    try {
      const params = busqueda ? `?busqueda=${encodeURIComponent(busqueda)}` : "";
      const data = await api.get<{ tarjetas: TarjetaCashless[] }>(
        `/cashless/tarjetas${params}`,
        localId
      );
      set({ tarjetas: data.tarjetas, cargando: false });
    } catch (err) {
      set({
        cargando: false,
        error: err instanceof Error ? err.message : "Error al cargar tarjetas",
      });
    }
  },

  // ── Consulta individual ────────────────────────────────────

  consultarTarjeta: async (codigo) => {
    const localId = getLocalId();
    set({ consultando: true, errorConsulta: null, tarjetaConsultada: null });
    try {
      const data = await api.get<{ tarjeta: TarjetaCashless }>(
        `/cashless/tarjetas/${encodeURIComponent(codigo)}`,
        localId
      );
      set({ tarjetaConsultada: data.tarjeta, consultando: false });
      return data.tarjeta;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Tarjeta no encontrada";
      set({ consultando: false, errorConsulta: msg });
      return null;
    }
  },

  limpiarConsulta: () =>
    set({ tarjetaConsultada: null, errorConsulta: null, consultando: false }),

  // ── Crear tarjeta ──────────────────────────────────────────

  crearTarjeta: async (datos) => {
    const localId = getLocalId();
    set({ procesando: true, errorOperacion: null });
    try {
      const data = await api.post<{ tarjeta: TarjetaCashless }>(
        "/cashless/tarjetas",
        datos,
        localId
      );
      // Agregar al inicio de la lista
      set((s) => ({
        tarjetas: [data.tarjeta, ...s.tarjetas],
        procesando: false,
      }));
      return data.tarjeta;
    } catch (err) {
      set({
        procesando: false,
        errorOperacion: err instanceof Error ? err.message : "Error al crear tarjeta",
      });
      return null;
    }
  },

  // ── Recargar saldo ─────────────────────────────────────────

  recargar: async (tarjetaCodigo, monto, metodoPago, mpPaymentId) => {
    const localId = getLocalId();
    set({ procesando: true, errorOperacion: null });
    try {
      const data = await api.post<{ nuevoSaldo: number; tarjeta: TarjetaCashless }>(
        "/cashless/recargar",
        { tarjetaCodigo, monto, metodoPago, mpPaymentId },
        localId
      );
      // Actualizar saldo en la lista local
      set((s) => ({
        tarjetas: s.tarjetas.map((t) =>
          t.codigo === tarjetaCodigo ? { ...t, saldo: data.nuevoSaldo } : t
        ),
        tarjetaConsultada:
          s.tarjetaConsultada?.codigo === tarjetaCodigo
            ? { ...s.tarjetaConsultada, saldo: data.nuevoSaldo }
            : s.tarjetaConsultada,
        procesando: false,
      }));
      return { nuevoSaldo: data.nuevoSaldo };
    } catch (err) {
      set({
        procesando: false,
        errorOperacion: err instanceof Error ? err.message : "Error al recargar",
      });
      return null;
    }
  },

  // ── Cobrar (descuento en barra) ────────────────────────────

  cobrar: async (tarjetaCodigo, monto) => {
    const localId = getLocalId();
    set({ procesando: true, errorOperacion: null });
    try {
      const data = await api.post<{ ok: boolean; nuevoSaldo: number }>(
        "/cashless/cobrar",
        { tarjetaCodigo, monto },
        localId
      );
      // Actualizar saldo local
      set((s) => ({
        tarjetas: s.tarjetas.map((t) =>
          t.codigo === tarjetaCodigo ? { ...t, saldo: data.nuevoSaldo } : t
        ),
        tarjetaConsultada:
          s.tarjetaConsultada?.codigo === tarjetaCodigo
            ? { ...s.tarjetaConsultada, saldo: data.nuevoSaldo }
            : s.tarjetaConsultada,
        procesando: false,
      }));
      return { ok: true, nuevoSaldo: data.nuevoSaldo };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cobrar";
      set({ procesando: false, errorOperacion: msg });
      return { ok: false, nuevoSaldo: 0, error: msg };
    }
  },

  // ── Activar/Desactivar ─────────────────────────────────────

  cambiarEstado: async (codigo, activa) => {
    const localId = getLocalId();
    set({ procesando: true, errorOperacion: null });
    try {
      await api.patch(`/cashless/tarjetas/${encodeURIComponent(codigo)}/estado`, { activa }, localId);
      set((s) => ({
        tarjetas: s.tarjetas.map((t) =>
          t.codigo === codigo ? { ...t, activa } : t
        ),
        procesando: false,
      }));
      return true;
    } catch (err) {
      set({
        procesando: false,
        errorOperacion: err instanceof Error ? err.message : "Error al cambiar estado",
      });
      return false;
    }
  },

  // ── Mercado Pago ────────────────────────────────────────────

  crearPreferenciaMP: async (monto, descripcion, referencia) => {
    const localId = getLocalId();
    set({ cargandoQR: true, preferenciaMP: null });
    try {
      const data = await api.post<PreferenciaMP>(
        "/mp/preferencia",
        {
          monto,
          descripcion: descripcion ?? "Consumición Club Niágara",
          referencia,
        },
        localId
      );
      set({ preferenciaMP: data, cargandoQR: false });
      return data;
    } catch (err) {
      set({ cargandoQR: false });
      return null;
    }
  },

  limpiarPreferenciaMP: () => set({ preferenciaMP: null }),

  // ── Utilidades ──────────────────────────────────────────────

  limpiarError: () => set({ error: null, errorOperacion: null, errorConsulta: null }),
}));

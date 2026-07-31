/**
 * Store de Reportes + Corte de Caja.
 * Maneja KPIs, listado de ventas, top productos, ventas por hora y cortes.
 */

import { create } from "zustand";
import { api } from "@/lib/apiClient";
import { useAuthStore } from "@/stores/authStore";

// ── Tipos ─────────────────────────────────────────────────────────

export interface ResumenKPI {
  periodo: { desde: string; hasta: string };
  ventas: {
    total: number;
    cantidad: number;
    descuentos: number;
    porMetodo: {
      efectivo:  { monto: number; cantidad: number };
      tarjeta:   { monto: number; cantidad: number };
      cashless:  { monto: number; cantidad: number };
      qr_mp:     { monto: number; cantidad: number };
      cortesia:  { monto: number; cantidad: number };
    };
  };
  recargas:  { total: number; cantidad: number };
  entradas:  { total: number; cantidad: number; usadas: number };
  accesos:   { ingresos: number; egresos: number; aforoActual: number };
  ingresosBrutos: number;
}

export interface VentaReporte {
  id: string;
  createdAt: string;
  metodoPago: string;
  total: number;
  descuento: number;
  nota: string | null;
  barra: { nombre: string } | null;
  staff: { nombre: string; apellido: string };
  items: {
    id: string;
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
    producto: { nombre: string; categoria: string | null };
  }[];
}

export interface ProductoTop {
  productoId: string;
  nombre: string;
  categoria: string | null;
  cantidadVendida: number;
  montoTotal: number;
  cantidadVentas: number;
}

export interface VentaPorHora {
  hora: number;
  total: number;
  cantidad: number;
}

export interface CorteCaja {
  id: string;
  localId: string;
  staffId: string;
  barraId: string | null;
  eventoId: string | null;
  efectivoEsperado: number;
  efectivoReal: number | null;
  diferencia: number | null;
  ventasEfectivo: number;
  ventasTarjeta: number;
  ventasCashless: number;
  ventasQr: number;
  ventasCortesia: number;
  totalVentas: number;
  nota: string | null;
  cerradoAt: string | null;
  createdAt: string;
  staff: { nombre: string; apellido: string };
  barra?: { nombre: string } | null;
  evento?: { nombre: string } | null;
}

// ── Filtros ───────────────────────────────────────────────────────

export interface FiltrosReporte {
  fechaDesde: string;
  fechaHasta: string;
  eventoId?: string;
  barraId?: string;
  metodoPago?: string;
}

function fechaHoyInicio(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function fechaHoyFin(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export function filtrosHoy(): FiltrosReporte {
  return { fechaDesde: fechaHoyInicio(), fechaHasta: fechaHoyFin() };
}

// ── Estado ────────────────────────────────────────────────────────

interface ReportesState {
  // Datos
  resumen: ResumenKPI | null;
  ventas: VentaReporte[];
  ventasTotal: number;
  ventasPagina: number;
  productosTop: ProductoTop[];
  ventasPorHora: VentaPorHora[];
  cortes: CorteCaja[];

  // UI
  filtros: FiltrosReporte;
  cargandoResumen: boolean;
  cargandoVentas: boolean;
  cargandoProductos: boolean;
  cargandoCortes: boolean;
  procesando: boolean;
  error: string | null;

  // Acciones
  setFiltros: (filtros: Partial<FiltrosReporte>) => void;
  cargarResumen: () => Promise<void>;
  cargarVentas: (pagina?: number) => Promise<void>;
  cargarProductosTop: (limit?: number) => Promise<void>;
  cargarVentasPorHora: () => Promise<void>;
  cargarCortes: () => Promise<void>;
  crearCorte: (datos: {
    barraId?: string | null;
    eventoId?: string | null;
    nota?: string;
  }) => Promise<CorteCaja | null>;
  cerrarCorte: (id: string, efectivoReal: number, nota?: string) => Promise<CorteCaja | null>;
  cargarTodo: () => Promise<void>;
  limpiarError: () => void;
}

// ── Helper ────────────────────────────────────────────────────────

function getLocalId() {
  return useAuthStore.getState().staff?.localId;
}

// ── Store ─────────────────────────────────────────────────────────

export const useReportesStore = create<ReportesState>((set, get) => ({
  resumen: null,
  ventas: [],
  ventasTotal: 0,
  ventasPagina: 1,
  productosTop: [],
  ventasPorHora: [],
  cortes: [],

  filtros: filtrosHoy(),

  cargandoResumen: false,
  cargandoVentas: false,
  cargandoProductos: false,
  cargandoCortes: false,
  procesando: false,
  error: null,

  setFiltros: (nuevos) => {
    set((s) => ({ filtros: { ...s.filtros, ...nuevos } }));
  },

  cargarResumen: async () => {
    const localId = getLocalId();
    const { filtros } = get();
    set({ cargandoResumen: true, error: null });
    try {
      const params = new URLSearchParams({
        fechaDesde: filtros.fechaDesde,
        fechaHasta: filtros.fechaHasta,
        ...(filtros.eventoId && { eventoId: filtros.eventoId }),
      });
      const data = await api.get<ResumenKPI>(`/reportes/resumen?${params}`, localId);
      set({ resumen: data, cargandoResumen: false });
    } catch (err) {
      set({ cargandoResumen: false, error: err instanceof Error ? err.message : "Error al cargar resumen" });
    }
  },

  cargarVentas: async (pagina = 1) => {
    const localId = getLocalId();
    const { filtros } = get();
    set({ cargandoVentas: true });
    try {
      const params = new URLSearchParams({
        fechaDesde: filtros.fechaDesde,
        fechaHasta: filtros.fechaHasta,
        page: String(pagina),
        limit: "50",
        ...(filtros.barraId && { barraId: filtros.barraId }),
        ...(filtros.metodoPago && { metodoPago: filtros.metodoPago }),
      });
      const data = await api.get<{ ventas: VentaReporte[]; total: number; paginas: number }>(
        `/reportes/ventas?${params}`, localId
      );
      set({ ventas: data.ventas, ventasTotal: data.total, ventasPagina: pagina, cargandoVentas: false });
    } catch {
      set({ cargandoVentas: false });
    }
  },

  cargarProductosTop: async (limit = 10) => {
    const localId = getLocalId();
    const { filtros } = get();
    set({ cargandoProductos: true });
    try {
      const params = new URLSearchParams({
        fechaDesde: filtros.fechaDesde,
        fechaHasta: filtros.fechaHasta,
        limit: String(limit),
      });
      const data = await api.get<{ productos: ProductoTop[] }>(`/reportes/productos-top?${params}`, localId);
      set({ productosTop: data.productos, cargandoProductos: false });
    } catch {
      set({ cargandoProductos: false });
    }
  },

  cargarVentasPorHora: async () => {
    const localId = getLocalId();
    const { filtros } = get();
    try {
      const params = new URLSearchParams({
        fechaDesde: filtros.fechaDesde,
        fechaHasta: filtros.fechaHasta,
      });
      const data = await api.get<{ porHora: VentaPorHora[] }>(`/reportes/ventas-por-hora?${params}`, localId);
      set({ ventasPorHora: data.porHora });
    } catch { /* silencioso */ }
  },

  cargarCortes: async () => {
    const localId = getLocalId();
    set({ cargandoCortes: true });
    try {
      const data = await api.get<{ cortes: CorteCaja[] }>("/reportes/cortes", localId);
      set({ cortes: data.cortes, cargandoCortes: false });
    } catch {
      set({ cargandoCortes: false });
    }
  },

  crearCorte: async (datos) => {
    const localId = getLocalId();
    const { filtros } = get();
    set({ procesando: true, error: null });
    try {
      const data = await api.post<{ corte: CorteCaja }>("/reportes/cortes", {
        ...datos,
        fechaDesde: filtros.fechaDesde,
        fechaHasta: filtros.fechaHasta,
      }, localId);
      set((s) => ({ cortes: [data.corte, ...s.cortes], procesando: false }));
      return data.corte;
    } catch (err) {
      set({ procesando: false, error: err instanceof Error ? err.message : "Error al crear corte" });
      return null;
    }
  },

  cerrarCorte: async (id, efectivoReal, nota) => {
    const localId = getLocalId();
    set({ procesando: true, error: null });
    try {
      const data = await api.patch<{ corte: CorteCaja }>(`/reportes/cortes/${id}/cerrar`, { efectivoReal, nota }, localId);
      set((s) => ({
        cortes: s.cortes.map((c) => c.id === id ? data.corte : c),
        procesando: false,
      }));
      return data.corte;
    } catch (err) {
      set({ procesando: false, error: err instanceof Error ? err.message : "Error al cerrar corte" });
      return null;
    }
  },

  cargarTodo: async () => {
    const { cargarResumen, cargarVentas, cargarProductosTop, cargarVentasPorHora, cargarCortes } = get();
    await Promise.all([
      cargarResumen(),
      cargarVentas(1),
      cargarProductosTop(8),
      cargarVentasPorHora(),
      cargarCortes(),
    ]);
  },

  limpiarError: () => set({ error: null }),
}));

// ── Constantes de UI ───────────────────────────────────────────────

export interface MetodoPagoConfig {
  label: string;
  icono: string;
  color: string;
}

export const METODO_PAGO_CONFIG: Record<string, MetodoPagoConfig> = {
  efectivo:  { label: "Efectivo",   icono: "💵", color: "text-green-400" },
  tarjeta:   { label: "Tarjeta",    icono: "💳", color: "text-blue-400" },
  cashless:  { label: "Cashless",   icono: "🪙", color: "text-accent" },
  qr_mp:     { label: "QR / MP",    icono: "📱", color: "text-purple-400" },
  cortesia:  { label: "Cortesía",   icono: "🎁", color: "text-text-secondary" },
};

/**
 * Config por defecto para métodos de pago que la API devuelva y el front todavía
 * no conozca. Evita que un método nuevo rompa la pantalla de reportes.
 */
export const METODO_PAGO_DEFAULT: MetodoPagoConfig = {
  label: "Otro",
  icono: "❓",
  color: "text-text-secondary",
};

/** Buscar la config de un método de pago, con fallback seguro */
export function configMetodoPago(metodo: string): MetodoPagoConfig {
  return METODO_PAGO_CONFIG[metodo] ?? METODO_PAGO_DEFAULT;
}

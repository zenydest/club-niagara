/**
 * Store de Stock — depósitos, nivel de inventario y movimientos.
 */

import { create } from "zustand";
import { api } from "@/lib/apiClient";
import { useAuthStore } from "@/stores/authStore";

// ── Tipos ─────────────────────────────────────────────────────────

export interface Deposito {
  id: string;
  localId: string;
  nombre: string;
  esPrincipal: boolean;
}

export interface StockPorDeposito {
  depositoId: string;
  depositoNombre: string;
  esPrincipal: boolean;
  stock: number;
}

export interface ProductoStock {
  id: string;
  nombre: string;
  categoria: string | null;
  precio: number;
  costo: number | null;
  stockMinimo: number | null;
  stockTotal: number;
  bajoMinimo: boolean;
  porDeposito: StockPorDeposito[];
}

export interface StockMovimiento {
  id: string;
  localId: string;
  depositoId: string;
  productoId: string;
  tipo: "ingreso" | "egreso_venta" | "egreso_merma" | "ajuste";
  cantidad: number;
  cantidadAnterior: number;
  motivo: string | null;
  createdAt: string;
  synced: string;
  producto: { nombre: string; categoria: string | null };
  deposito: { nombre: string };
  staff?: { nombre: string; apellido: string } | null;
}

export interface AlertaStock {
  id: string;
  nombre: string;
  categoria: string | null;
  stockMinimo: number | null;
  stockActual: number;
}

// ── Estado ────────────────────────────────────────────────────────

interface StockState {
  depositos: Deposito[];
  productos: ProductoStock[];
  movimientos: StockMovimiento[];
  movimientosTotal: number;
  alertas: AlertaStock[];

  cargando: boolean;
  cargandoMovimientos: boolean;
  procesando: boolean;
  error: string | null;

  depositoSeleccionado: string | null;

  // Acciones — depósitos
  cargarDepositos: () => Promise<void>;
  crearDeposito: (datos: { nombre: string; esPrincipal?: boolean }) => Promise<Deposito | null>;

  // Acciones — nivel de stock
  cargarNivel: (depositoId?: string) => Promise<void>;
  cargarAlertas: () => Promise<void>;

  // Acciones — movimientos
  cargarMovimientos: (filtros?: {
    productoId?: string;
    depositoId?: string;
    tipo?: string;
    fechaDesde?: string;
    fechaHasta?: string;
    page?: number;
  }) => Promise<void>;
  registrarMovimiento: (datos: {
    depositoId: string;
    productoId: string;
    tipo: "ingreso" | "egreso_merma" | "ajuste";
    cantidad: number;
    motivo?: string;
  }) => Promise<boolean>;

  // Editar producto (para stockMinimo)
  actualizarProducto: (id: string, datos: { stockMinimo?: number | null; [k: string]: unknown }) => Promise<boolean>;

  setDepositoSeleccionado: (id: string | null) => void;
  limpiarError: () => void;
}

function getLocalId() {
  return useAuthStore.getState().staff?.localId;
}

// ── Store ─────────────────────────────────────────────────────────

export const useStockStore = create<StockState>((set) => ({
  depositos: [],
  productos: [],
  movimientos: [],
  movimientosTotal: 0,
  alertas: [],

  cargando: false,
  cargandoMovimientos: false,
  procesando: false,
  error: null,

  depositoSeleccionado: null,

  cargarDepositos: async () => {
    const localId = getLocalId();
    try {
      const data = await api.get<{ depositos: Deposito[] }>("/stock/depositos", localId);
      set({ depositos: data.depositos });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Error al cargar depósitos" });
    }
  },

  crearDeposito: async (datos) => {
    const localId = getLocalId();
    set({ procesando: true, error: null });
    try {
      const data = await api.post<{ deposito: Deposito }>("/stock/depositos", datos, localId);
      set((s) => ({ depositos: [...s.depositos, data.deposito], procesando: false }));
      return data.deposito;
    } catch (err) {
      set({ procesando: false, error: err instanceof Error ? err.message : "Error al crear depósito" });
      return null;
    }
  },

  cargarNivel: async (depositoId) => {
    const localId = getLocalId();
    set({ cargando: true, error: null });
    try {
      const params = depositoId ? `?depositoId=${depositoId}` : "";
      const data = await api.get<{ productos: ProductoStock[]; depositos: Deposito[] }>(
        `/stock/nivel${params}`, localId
      );
      set({
        productos: data.productos,
        depositos: data.depositos,
        cargando: false,
      });
    } catch (err) {
      set({ cargando: false, error: err instanceof Error ? err.message : "Error al cargar stock" });
    }
  },

  cargarAlertas: async () => {
    const localId = getLocalId();
    try {
      const data = await api.get<{ alertas: AlertaStock[] }>("/stock/alertas", localId);
      set({ alertas: data.alertas });
    } catch { /* silencioso */ }
  },

  cargarMovimientos: async (filtros = {}) => {
    const localId = getLocalId();
    set({ cargandoMovimientos: true });
    try {
      const params = new URLSearchParams();
      if (filtros.productoId) params.set("productoId", filtros.productoId);
      if (filtros.depositoId) params.set("depositoId", filtros.depositoId);
      if (filtros.tipo) params.set("tipo", filtros.tipo);
      if (filtros.fechaDesde) params.set("fechaDesde", filtros.fechaDesde);
      if (filtros.fechaHasta) params.set("fechaHasta", filtros.fechaHasta);
      if (filtros.page) params.set("page", String(filtros.page));
      const qs = params.toString();
      const data = await api.get<{ movimientos: StockMovimiento[]; total: number }>(
        `/stock/movimientos${qs ? `?${qs}` : ""}`, localId
      );
      set({ movimientos: data.movimientos, movimientosTotal: data.total, cargandoMovimientos: false });
    } catch {
      set({ cargandoMovimientos: false });
    }
  },

  registrarMovimiento: async (datos) => {
    const localId = getLocalId();
    set({ procesando: true, error: null });
    try {
      const data = await api.post<{ movimiento: StockMovimiento }>("/stock/movimientos", datos, localId);
      // Actualizar stock local optimistamente
      const signo = datos.tipo === "ingreso" ? 1 : datos.tipo === "ajuste" ? Math.sign(datos.cantidad) : -1;
      const delta = Math.abs(datos.cantidad) * signo;
      set((s) => ({
        productos: s.productos.map((p) => {
          if (p.id !== datos.productoId) return p;
          const nuevoTotal = p.stockTotal + delta;
          return {
            ...p,
            stockTotal: nuevoTotal,
            bajoMinimo: p.stockMinimo !== null && nuevoTotal <= p.stockMinimo,
          };
        }),
        movimientos: [data.movimiento, ...s.movimientos],
        procesando: false,
      }));
      return true;
    } catch (err) {
      set({ procesando: false, error: err instanceof Error ? err.message : "Error al registrar movimiento" });
      return false;
    }
  },

  actualizarProducto: async (id, datos) => {
    const localId = getLocalId();
    set({ procesando: true, error: null });
    try {
      const data = await api.patch<{ producto: { stockMinimo: number | null } }>(
        `/stock/productos/${id}`, datos, localId
      );
      set((s) => ({
        productos: s.productos.map((p) =>
          p.id === id ? { ...p, stockMinimo: data.producto.stockMinimo } : p
        ),
        procesando: false,
      }));
      return true;
    } catch (err) {
      set({ procesando: false, error: err instanceof Error ? err.message : "Error al actualizar" });
      return false;
    }
  },

  setDepositoSeleccionado: (id) => set({ depositoSeleccionado: id }),
  limpiarError: () => set({ error: null }),
}));

// ── Constantes de UI ───────────────────────────────────────────────

export interface TipoMovimientoConfig {
  label: string;
  icono: string;
  color: string;
  signo: string;
}

export const TIPO_MOVIMIENTO_CONFIG: Record<string, TipoMovimientoConfig> = {
  ingreso:      { label: "Ingreso",      icono: "📦", color: "text-green-400", signo: "+" },
  egreso_venta: { label: "Venta",        icono: "🛒", color: "text-blue-400",  signo: "-" },
  egreso_merma: { label: "Merma/Baja",   icono: "🗑️", color: "text-danger",   signo: "-" },
  ajuste:       { label: "Ajuste",       icono: "✏️", color: "text-yellow-400", signo: "±" },
  transferencia:{ label: "Transferencia",icono: "↔️", color: "text-purple-400", signo: "~" },
};

/**
 * Config por defecto para tipos de movimiento que la API devuelva y el front
 * todavía no conozca. Evita que un tipo nuevo rompa la pantalla de stock.
 */
export const TIPO_MOVIMIENTO_DEFAULT: TipoMovimientoConfig = {
  label: "Movimiento",
  icono: "❓",
  color: "text-text-secondary",
  signo: "~",
};

/** Buscar la config de un tipo de movimiento, con fallback seguro */
export function configTipoMovimiento(tipo: string): TipoMovimientoConfig {
  return TIPO_MOVIMIENTO_CONFIG[tipo] ?? TIPO_MOVIMIENTO_DEFAULT;
}

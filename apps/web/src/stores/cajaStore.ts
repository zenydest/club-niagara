/**
 * Store de la Caja/POS — offline-first con cola en localStorage.
 *
 * Flujo:
 *  1. Al montar: carga productos desde API (cachea en localStorage).
 *  2. Cajero arma el carrito y confirma el pago.
 *  3. Si hay conexión → POST /api/ventas directamente.
 *  4. Si no hay conexión → guarda en cola localStorage.
 *  5. Al reconectar → sincroniza la cola vía POST /api/ventas/sync.
 */

import { create } from "zustand";
import { api } from "@/lib/apiClient";
import { useAuthStore } from "@/stores/authStore";
import type { Producto, MetodoPago } from "@niagara/core";
import type { VentaInput } from "@niagara/core";

// ── Tipos internos ─────────────────────────────────────────────

export interface ItemCarrito {
  producto: Producto;
  cantidad: number;
  subtotal: number;
}

export interface Barra {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

interface VentaOffline extends VentaInput {
  _intentos: number;
}

// Claves de localStorage
const KEY_PRODUCTOS = "niagara:caja:productos";
const KEY_COLA = "niagara:caja:cola";

// ── Estado del store ───────────────────────────────────────────

interface CajaState {
  // Catálogo
  productos: Producto[];
  cargandoProductos: boolean;
  errorProductos: string | null;

  // Barras disponibles
  barras: Barra[];
  barraSeleccionada: Barra | null;

  // Carrito
  carrito: ItemCarrito[];

  // Pago en curso
  metodoPago: MetodoPago;
  montoCobrado: number; // para efectivo: cuánto dio el cliente
  procesando: boolean;

  // Cola offline
  cola: VentaOffline[];
  online: boolean;
  sincronizando: boolean;
  errorSync: string | null;

  // Acciones — productos y barras
  cargarProductos: () => Promise<void>;
  cargarBarras: () => Promise<void>;
  seleccionarBarra: (barra: Barra) => void;

  // Acciones — carrito
  agregarProducto: (producto: Producto) => void;
  quitarProducto: (productoId: string) => void;
  cambiarCantidad: (productoId: string, cantidad: number) => void;
  limpiarCarrito: () => void;

  // Acciones — pago
  setMetodoPago: (metodo: MetodoPago) => void;
  setMontoCobrado: (monto: number) => void;
  confirmarVenta: (eventoId?: string) => Promise<boolean>;

  // Acciones — sincronización
  setOnline: (online: boolean) => void;
  sincronizarCola: () => Promise<void>;
}

// ── Helpers ────────────────────────────────────────────────────

function leerCola(): VentaOffline[] {
  try {
    return JSON.parse(localStorage.getItem(KEY_COLA) ?? "[]") as VentaOffline[];
  } catch {
    return [];
  }
}

function guardarCola(cola: VentaOffline[]) {
  localStorage.setItem(KEY_COLA, JSON.stringify(cola));
}

function leerProductosCacheados(): Producto[] {
  try {
    return JSON.parse(localStorage.getItem(KEY_PRODUCTOS) ?? "[]") as Producto[];
  } catch {
    return [];
  }
}

function getLocalId(): string | undefined {
  return useAuthStore.getState().staff?.localId;
}

// ── Store ──────────────────────────────────────────────────────

export const useCajaStore = create<CajaState>((set, get) => ({
  // Estado inicial
  productos: leerProductosCacheados(),
  cargandoProductos: false,
  errorProductos: null,

  barras: [],
  barraSeleccionada: null,

  carrito: [],

  metodoPago: "efectivo",
  montoCobrado: 0,
  procesando: false,

  cola: leerCola(),
  online: navigator.onLine,
  sincronizando: false,
  errorSync: null,

  // ── Productos ──────────────────────────────────────────────

  cargarProductos: async () => {
    const localId = getLocalId();
    set({ cargandoProductos: true, errorProductos: null });
    try {
      const data = await api.get<{ productos: Producto[] }>("/productos", localId);
      // Los precios vienen como string Decimal de Prisma — normalizar a number
      const productos = data.productos.map((p) => ({
        ...p,
        precio: Number(p.precio),
        costo: p.costo !== null && p.costo !== undefined ? Number(p.costo) : null,
      }));
      localStorage.setItem(KEY_PRODUCTOS, JSON.stringify(productos));
      set({ productos, cargandoProductos: false });
    } catch {
      // Si falla la red, usa el caché
      const cacheados = leerProductosCacheados();
      set({
        productos: cacheados,
        cargandoProductos: false,
        errorProductos: cacheados.length ? null : "Sin conexión y sin caché de productos",
      });
    }
  },

  cargarBarras: async () => {
    const localId = getLocalId();
    try {
      const data = await api.get<{ barras: Barra[] }>("/barras", localId);
      const primera = data.barras[0] ?? null;
      set((s) => ({
        barras: data.barras,
        // Mantener la seleccionada si sigue existiendo, sino tomar la primera
        barraSeleccionada:
          s.barraSeleccionada
            ? (data.barras.find((b) => b.id === s.barraSeleccionada?.id) ?? primera)
            : primera,
      }));
    } catch {
      // Barras son opcionales — la venta puede ir sin barraId
    }
  },

  seleccionarBarra: (barra) => set({ barraSeleccionada: barra }),

  // ── Carrito ────────────────────────────────────────────────

  agregarProducto: (producto) => {
    set((s) => {
      const existente = s.carrito.find((i) => i.producto.id === producto.id);
      if (existente) {
        return {
          carrito: s.carrito.map((i) =>
            i.producto.id === producto.id
              ? { ...i, cantidad: i.cantidad + 1, subtotal: (i.cantidad + 1) * Number(producto.precio) }
              : i
          ),
        };
      }
      return {
        carrito: [
          ...s.carrito,
          { producto, cantidad: 1, subtotal: Number(producto.precio) },
        ],
      };
    });
  },

  quitarProducto: (productoId) =>
    set((s) => ({ carrito: s.carrito.filter((i) => i.producto.id !== productoId) })),

  cambiarCantidad: (productoId, cantidad) => {
    if (cantidad <= 0) {
      get().quitarProducto(productoId);
      return;
    }
    set((s) => ({
      carrito: s.carrito.map((i) =>
        i.producto.id === productoId
          ? { ...i, cantidad, subtotal: cantidad * Number(i.producto.precio) }
          : i
      ),
    }));
  },

  limpiarCarrito: () => set({ carrito: [], montoCobrado: 0, metodoPago: "efectivo" }),

  // ── Pago ───────────────────────────────────────────────────

  setMetodoPago: (metodo) => set({ metodoPago: metodo, montoCobrado: 0 }),
  setMontoCobrado: (monto) => set({ montoCobrado: monto }),

  confirmarVenta: async (eventoId) => {
    const { carrito, metodoPago, barraSeleccionada, online } = get();
    const localId = getLocalId();

    if (!carrito.length || !localId) return false;

    const total = carrito.reduce((acc, i) => acc + i.subtotal, 0);

    const venta: VentaOffline = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      eventoId: eventoId ?? null,
      barraId: barraSeleccionada?.id ?? null,
      metodoPago,
      total,
      descuento: 0,
      nota: null,
      items: carrito.map((i) => ({
        productoId: i.producto.id,
        cantidad: i.cantidad,
        precioUnitario: Number(i.producto.precio),
        subtotal: i.subtotal,
      })),
      _intentos: 0,
    };

    set({ procesando: true });

    if (online) {
      try {
        await api.post("/ventas", venta, localId);
        get().limpiarCarrito();
        set({ procesando: false });
        return true;
      } catch {
        // Falló online → encolar para sync posterior
      }
    }

    // Guardar en cola offline
    const cola = [...leerCola(), venta];
    guardarCola(cola);
    set({ cola, procesando: false });
    get().limpiarCarrito();
    return true; // La operación fue aceptada (pending sync)
  },

  // ── Sync ───────────────────────────────────────────────────

  setOnline: (online) => {
    set({ online });
    if (online) void get().sincronizarCola();
  },

  sincronizarCola: async () => {
    const { cola, sincronizando } = get();
    const localId = getLocalId();

    if (sincronizando || !cola.length || !localId) return;

    set({ sincronizando: true, errorSync: null });

    try {
      const { resultados } = await api.post<{
        resultados: { id: string; ok: boolean }[];
        exitosas: number;
      }>("/ventas/sync", { ventas: cola }, localId);

      // Remover de la cola las que sincronizaron OK
      const idsOk = new Set(resultados.filter((r) => r.ok).map((r) => r.id));
      const nuevaCola = cola
        .filter((v) => !idsOk.has(v.id))
        .map((v) => ({ ...v, _intentos: v._intentos + 1 }));

      guardarCola(nuevaCola);
      set({ cola: nuevaCola, sincronizando: false });
    } catch {
      set({ sincronizando: false, errorSync: "Error al sincronizar ventas" });
    }
  },
}));

// ── Selector utilitario ─────────────────────────────────────────

/** Total del carrito */
export const selectTotal = (s: CajaState) =>
  s.carrito.reduce((acc, i) => acc + i.subtotal, 0);

/** Vuelto para pago en efectivo */
export const selectVuelto = (s: CajaState) =>
  Math.max(0, s.montoCobrado - selectTotal(s));

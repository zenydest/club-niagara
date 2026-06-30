/**
 * Store principal del POS con Zustand.
 * Maneja el carrito, el evento activo y el estado de sync.
 * Offline-first: guarda en IndexedDB primero, sincroniza después.
 */

import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type { Producto, VentaItem, MetodoPago } from "@niagara/core";
import { guardarVentaLocal } from "../db/localDb";
import { useAuthStore } from "./authPosStore";

interface ItemCarrito {
  producto: Producto;
  cantidad: number;
  subtotal: number;
}

interface PosState {
  // Carrito
  carrito: ItemCarrito[];
  eventoActualId: string | null;
  barraActualId: string | null;

  // Sync
  ventasPendientes: number;
  estadoConexion: "online" | "offline";
  estadoSync: "sincronizado" | "sincronizando" | "pendiente" | "error";

  // Acciones del carrito
  agregarProducto: (producto: Producto) => void;
  quitarProducto: (productoId: string) => void;
  actualizarCantidad: (productoId: string, cantidad: number) => void;
  limpiarCarrito: () => void;

  // Acciones de venta
  cobrarVenta: (
    metodoPago: MetodoPago,
    descuento?: number
  ) => Promise<{ ok: boolean; ventaId?: string; error?: string }>;

  // Configuración
  setEventoActual: (eventoId: string | null) => void;
  setBarraActual: (barraId: string | null) => void;
  setVentasPendientes: (n: number) => void;
  setEstadoConexion: (estado: "online" | "offline") => void;
  setEstadoSync: (estado: PosState["estadoSync"]) => void;
}

export const usePosStore = create<PosState>()((set, get) => ({
  carrito: [],
  eventoActualId: null,
  barraActualId: null,
  ventasPendientes: 0,
  estadoConexion: navigator.onLine ? "online" : "offline",
  estadoSync: "sincronizado",

  agregarProducto: (producto: Producto) => {
    set((state) => {
      const existente = state.carrito.find((i) => i.producto.id === producto.id);

      if (existente) {
        return {
          carrito: state.carrito.map((i) =>
            i.producto.id === producto.id
              ? { ...i, cantidad: i.cantidad + 1, subtotal: (i.cantidad + 1) * i.producto.precio }
              : i
          ),
        };
      }

      return {
        carrito: [...state.carrito, { producto, cantidad: 1, subtotal: producto.precio }],
      };
    });
  },

  quitarProducto: (productoId: string) => {
    set((state) => ({
      carrito: state.carrito.filter((i) => i.producto.id !== productoId),
    }));
  },

  actualizarCantidad: (productoId: string, cantidad: number) => {
    if (cantidad <= 0) {
      get().quitarProducto(productoId);
      return;
    }
    set((state) => ({
      carrito: state.carrito.map((i) =>
        i.producto.id === productoId
          ? { ...i, cantidad, subtotal: cantidad * i.producto.precio }
          : i
      ),
    }));
  },

  limpiarCarrito: () => set({ carrito: [] }),

  cobrarVenta: async (metodoPago: MetodoPago, descuento = 0) => {
    const state = get();
    const staff = useAuthStore.getState().staff;

    if (!staff) return { ok: false, error: "Sin sesión activa" };
    if (state.carrito.length === 0) return { ok: false, error: "El carrito está vacío" };

    const total = state.carrito.reduce((sum, i) => sum + i.subtotal, 0) - descuento;

    // UUID generado en el cliente — clave para offline-first
    const ventaId = uuidv4();
    const ahora = new Date().toISOString();

    // camelCase (Prisma) en vez de snake_case (Supabase)
    const venta = {
      id: ventaId,
      localId: staff.localId,
      eventoId: state.eventoActualId ?? null,
      barraId: state.barraActualId ?? null,
      staffId: staff.id,
      metodoPago,
      total,
      descuento,
      nota: null,
      createdAt: ahora,
      synced: "pending" as const,
    };

    const items: VentaItem[] = state.carrito.map((item) => ({
      id: uuidv4(),
      ventaId,
      localId: staff.localId,
      productoId: item.producto.id,
      cantidad: item.cantidad,
      precioUnitario: item.producto.precio,
      subtotal: item.subtotal,
    }));

    try {
      // Guardar localmente primero (funciona offline)
      await guardarVentaLocal(venta, items);
      set({ carrito: [], ventasPendientes: state.ventasPendientes + 1 });
      return { ok: true, ventaId };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Error al guardar la venta",
      };
    }
  },

  setEventoActual: (eventoId) => set({ eventoActualId: eventoId }),
  setBarraActual: (barraId) => set({ barraActualId: barraId }),
  setVentasPendientes: (n) => set({ ventasPendientes: n }),
  setEstadoConexion: (estado) => set({ estadoConexion: estado }),
  setEstadoSync: (estado) => set({ estadoSync: estado }),
}));

export const selectTotal = (state: PosState) =>
  state.carrito.reduce((sum, i) => sum + i.subtotal, 0);

export const selectCantidadItems = (state: PosState) =>
  state.carrito.reduce((sum, i) => sum + i.cantidad, 0);

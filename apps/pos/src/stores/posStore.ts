/**
 * Store principal del POS con Zustand.
 * Maneja el carrito, el evento activo y el estado de sync.
 * Offline-first: guarda en IndexedDB primero, sincroniza después.
 */

import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type { MetodoPago } from "@niagara/core";
import { guardarVentaLocal } from "../db/localDb";
import { useAuthStore } from "./authPosStore";
import type { ProductoPos, VentaItemPos, EstadoSyncPos } from "../types";

interface ItemCarrito {
  producto: ProductoPos;
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
  estadoSync: EstadoSyncPos;

  // Acciones del carrito
  agregarProducto: (producto: ProductoPos) => void;
  quitarProducto: (productoId: string) => void;
  actualizarCantidad: (productoId: string, cantidad: number) => void;
  limpiarCarrito: () => void;

  // Acciones de venta
  //
  // `ventaId` se puede pasar desde afuera para los cobros con terminal Point:
  // ahí el id se genera *antes* de cobrar, porque se usa como referencia de la
  // orden en MP y tiene que coincidir con la venta que se registra después.
  cobrarVenta: (
    metodoPago: MetodoPago,
    opciones?: { descuento?: number; ventaId?: string }
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

  agregarProducto: (producto: ProductoPos) => {
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

  cobrarVenta: async (metodoPago: MetodoPago, opciones = {}) => {
    const { descuento = 0 } = opciones;
    const state = get();
    const staff = useAuthStore.getState().staff;

    if (!staff) return { ok: false, error: "Sin sesión activa" };
    if (state.carrito.length === 0) return { ok: false, error: "El carrito está vacío" };

    const bruto = state.carrito.reduce((sum, i) => sum + i.subtotal, 0);

    // La API valida `total` con z.number().nonnegative(): si dejáramos pasar un
    // total negativo, la venta se guardaría local y después el sync la
    // rechazaría para siempre. Mejor frenarla acá.
    if (descuento > bruto) {
      return { ok: false, error: "El descuento no puede superar el total" };
    }

    const total = bruto - descuento;

    // UUID generado en el cliente — clave para offline-first.
    // Si viene de afuera es porque ya se usó como referencia del cobro en MP.
    const ventaId = opciones.ventaId ?? uuidv4();
    const ahora = new Date().toISOString();

    // camelCase — mismo formato que acepta `ventaSchema` en POST /api/ventas/sync
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
    };

    const items: VentaItemPos[] = state.carrito.map((item) => ({
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

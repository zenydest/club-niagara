/**
 * Carta del boliche — ABM de productos.
 *
 * Es la lista que ve el cajero en la caja. Cambiar un precio acá cambia lo que
 * se cobra en la próxima venta, así que las operaciones son deliberadamente
 * explícitas: no hay guardado automático mientras se tipea.
 *
 * Dar de baja es borrado lógico (`activo: false`) y no borrado real: las ventas
 * viejas apuntan al producto, y si desapareciera de la base los reportes
 * históricos quedarían con huecos.
 */

import { create } from "zustand";
import { api } from "@/lib/apiClient";
import { useAuthStore } from "@/stores/authStore";

export interface Producto {
  id: string;
  localId: string;
  nombre: string;
  descripcion: string | null;
  categoria: string;
  precio: number;
  costo: number | null;
  imagenUrl: string | null;
  stockMinimo: number | null;
  activo: boolean;
}

export interface DatosProducto {
  nombre: string;
  categoria: string;
  precio: number;
  descripcion?: string;
  costo?: number;
  imagenUrl?: string;
}

interface ProductosState {
  productos: Producto[];
  categorias: string[];
  cargando: boolean;
  procesando: boolean;
  error: string | null;

  cargar: (incluirInactivos?: boolean) => Promise<void>;
  crear: (datos: DatosProducto) => Promise<boolean>;
  editar: (id: string, datos: Partial<DatosProducto> & { activo?: boolean }) => Promise<boolean>;
  darDeBaja: (id: string) => Promise<boolean>;
  reactivar: (id: string) => Promise<boolean>;
  /**
   * Elimina varios de una. Los que nunca se vendieron se borran de la base;
   * los que tienen historia quedan inactivos, porque las ventas viejas los
   * referencian y los reportes se romperían.
   */
  eliminarVarios: (ids: string[]) => Promise<{
    borrados: number;
    dadosDeBaja: number;
    nombresDadosDeBaja: string[];
  } | null>;
  limpiarError: () => void;
}

function getLocalId(): string | undefined {
  return useAuthStore.getState().staff?.localId;
}

/** La API devuelve Decimal como string en algunos casos; acá siempre número. */
function normalizar(p: Producto): Producto {
  return {
    ...p,
    precio: Number(p.precio),
    costo: p.costo === null ? null : Number(p.costo),
  };
}

export const useProductosStore = create<ProductosState>((set, get) => ({
  productos: [],
  categorias: [],
  cargando: false,
  procesando: false,
  error: null,

  cargar: async (incluirInactivos = false) => {
    const localId = getLocalId();
    if (!localId) return;

    set({ cargando: true, error: null });
    try {
      const qs = incluirInactivos ? "?soloActivos=false" : "";
      const [lista, cats] = await Promise.all([
        api.get<{ productos: Producto[] }>(`/productos${qs}`, localId),
        api.get<{ categorias: string[] }>("/productos/categorias", localId),
      ]);

      set({
        productos: lista.productos.map(normalizar),
        categorias: cats.categorias,
        cargando: false,
      });
    } catch (err) {
      set({
        cargando: false,
        error: err instanceof Error ? err.message : "Error al cargar la carta",
      });
    }
  },

  crear: async (datos) => {
    const localId = getLocalId();
    if (!localId) return false;

    set({ procesando: true, error: null });
    try {
      const { producto } = await api.post<{ producto: Producto }>(
        "/productos", datos, localId
      );
      set((s) => ({
        productos: [...s.productos, normalizar(producto)],
        // Una categoría nueva tiene que aparecer en el selector sin recargar.
        categorias: s.categorias.includes(producto.categoria)
          ? s.categorias
          : [...s.categorias, producto.categoria].sort(),
        procesando: false,
      }));
      return true;
    } catch (err) {
      set({
        procesando: false,
        error: err instanceof Error ? err.message : "No se pudo crear el producto",
      });
      return false;
    }
  },

  editar: async (id, datos) => {
    const localId = getLocalId();
    if (!localId) return false;

    set({ procesando: true, error: null });
    try {
      const { producto } = await api.patch<{ producto: Producto }>(
        `/productos/${id}`, datos, localId
      );
      set((s) => ({
        productos: s.productos.map((p) => (p.id === id ? normalizar(producto) : p)),
        procesando: false,
      }));
      return true;
    } catch (err) {
      set({
        procesando: false,
        error: err instanceof Error ? err.message : "No se pudo guardar el producto",
      });
      return false;
    }
  },

  darDeBaja: async (id) => {
    const localId = getLocalId();
    if (!localId) return false;

    set({ procesando: true, error: null });
    try {
      await api.delete(`/productos/${id}`, localId);
      // Se marca inactivo en vez de sacarlo de la lista: si el usuario está
      // viendo los inactivos, tiene que verlo pasar de un estado al otro.
      set((s) => ({
        productos: s.productos.map((p) => (p.id === id ? { ...p, activo: false } : p)),
        procesando: false,
      }));
      return true;
    } catch (err) {
      set({
        procesando: false,
        error: err instanceof Error ? err.message : "No se pudo dar de baja el producto",
      });
      return false;
    }
  },

  /** Deshace una baja. El backend lo acepta como un campo más del PATCH. */
  reactivar: async (id) => get().editar(id, { activo: true }),

  eliminarVarios: async (ids) => {
    const localId = getLocalId();
    if (!localId) return null;

    set({ procesando: true, error: null });
    try {
      const res = await api.post<{
        borrados: number;
        dadosDeBaja: number;
        nombresDadosDeBaja: string[];
      }>("/productos/eliminar", { ids }, localId);

      set({ procesando: false });
      // Se recarga en vez de tocar la lista a mano: unos se borraron y otros
      // quedaron inactivos, y reproducir esa mezcla acá es pedir un bug.
      await get().cargar();
      return res;
    } catch (err) {
      set({
        procesando: false,
        error: err instanceof Error ? err.message : "No se pudieron eliminar",
      });
      return null;
    }
  },

  limpiarError: () => set({ error: null }),
}));

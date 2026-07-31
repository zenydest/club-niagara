import React, { useState } from "react";
import { cn } from "@niagara/ui";
import { usePosStore } from "@/stores/posStore";
import type { ProductoPos } from "@/types";

interface GrillaProductosProps {
  productos: ProductoPos[];
}

/**
 * Grilla de productos con filtro por categoría.
 * Botones grandes para fácil selección en tablets.
 */
export function GrillaProductos({ productos }: GrillaProductosProps) {
  const { agregarProducto } = usePosStore();
  const [categoriaActiva, setCategoriaActiva] = useState<string>("todas");

  // Obtener categorías únicas
  const categorias = ["todas", ...new Set(productos.map((p) => p.categoria))];

  // Filtrar por categoría
  const productosFiltrados =
    categoriaActiva === "todas"
      ? productos
      : productos.filter((p) => p.categoria === categoriaActiva);

  const formatearPrecio = (precio: number) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(precio);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Filtro de categorías */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {categorias.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoriaActiva(cat)}
            className={cn(
              "flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-100",
              categoriaActiva === cat
                ? "bg-lime text-background"
                : "bg-surface-2 text-text-secondary hover:text-text-primary border border-border"
            )}
          >
            {cat === "todas" ? "Todos" : cat}
          </button>
        ))}
      </div>

      {/* Grilla */}
      {productosFiltrados.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-text-muted text-sm">
          Sin productos disponibles
        </div>
      ) : (
        <div className="grid grid-cols-3 xl:grid-cols-4 gap-3">
          {productosFiltrados.map((producto) => (
            <button
              key={producto.id}
              onClick={() => agregarProducto(producto)}
              className="btn-producto group"
            >
              {producto.imagenUrl ? (
                <img
                  src={producto.imagenUrl}
                  alt={producto.nombre}
                  className="w-10 h-10 object-cover rounded-lg"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-surface-3 flex items-center justify-center text-xl">
                  🍺
                </div>
              )}
              <span className="text-xs font-semibold text-text-primary text-center leading-tight line-clamp-2">
                {producto.nombre}
              </span>
              <span className="text-sm font-black text-lime group-hover:text-lime">
                {formatearPrecio(producto.precio)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

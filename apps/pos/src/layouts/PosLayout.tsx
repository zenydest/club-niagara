import React, { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@niagara/ui";
import { useAuthStore } from "@/stores/authPosStore";
import { usePosStore, selectTotal, selectCantidadItems } from "@/stores/posStore";
import { GrillaProductos } from "@/components/GrillaProductos";
import { Carrito } from "@/components/Carrito";
import {
  iniciarSyncEngine,
  detenerSyncEngine,
  cachearProductosDeSupabase,
} from "@/sync/syncEngine";
import { obtenerProductosLocales } from "@/db/localDb";
import type { Producto } from "@niagara/core";

/**
 * Layout principal del POS.
 * Diseño dividido: productos a la izquierda, carrito a la derecha.
 * Optimizado para pantallas táctiles (tablet/PC touch).
 */
export function PosLayout() {
  const { staff, logout } = useAuthStore();
  const {
    ventasPendientes,
    estadoConexion,
    estadoSync,
    setVentasPendientes,
    setEstadoConexion,
    setEstadoSync,
  } = usePosStore();

  // Inicializar sync engine al montar
  useEffect(() => {
    iniciarSyncEngine({
      onEstadoCambia: (estado, pendientes) => {
        setEstadoSync(estado);
        setVentasPendientes(pendientes);
      },
      onVentaSincronizada: () => {},
      onError: (err) => console.warn("Sync error:", err),
    });

    window.addEventListener("online", () => setEstadoConexion("online"));
    window.addEventListener("offline", () => setEstadoConexion("offline"));

    return () => {
      detenerSyncEngine();
    };
  }, [setEstadoSync, setVentasPendientes, setEstadoConexion]);

  // Cargar productos (desde cache local o Supabase si hay conexión)
  const { data: productos = [] } = useQuery<Producto[]>({
    queryKey: ["productos-pos", staff?.local_id],
    queryFn: async () => {
      if (!staff) return [];

      // Intentar cachear desde Supabase si hay internet
      if (navigator.onLine) {
        await cachearProductosDeSupabase(staff.local_id);
      }

      // Siempre retornar del cache local
      return obtenerProductosLocales(staff.local_id);
    },
    enabled: !!staff,
    staleTime: 1000 * 60 * 10, // 10 minutos
  });

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Panel izquierdo: productos */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header del POS */}
        <header className="flex items-center justify-between px-4 h-14 border-b border-border bg-surface/50">
          <div className="flex items-center gap-3">
            <span className="text-sm font-black text-lime">Club Niágara</span>
            <span className="text-text-muted text-xs">Caja</span>
          </div>

          {/* Estado de conexión */}
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold",
                estadoConexion === "online"
                  ? "bg-success/10 text-success"
                  : "bg-danger/10 text-danger"
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  estadoConexion === "online" ? "bg-success" : "bg-danger animate-pulse"
                )}
              />
              {estadoConexion === "online" ? "Online" : "Offline"}
            </div>

            {ventasPendientes > 0 && (
              <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-warning/10 text-warning text-xs font-semibold">
                ⏳ {ventasPendientes} pendiente{ventasPendientes > 1 ? "s" : ""}
              </div>
            )}

            <button
              onClick={() => void logout()}
              className="text-xs text-text-muted hover:text-danger transition-colors px-2 py-1"
            >
              Salir
            </button>
          </div>
        </header>

        {/* Grilla de productos */}
        <div className="flex-1 overflow-y-auto p-4">
          <GrillaProductos productos={productos} />
        </div>
      </div>

      {/* Panel derecho: carrito */}
      <div className="w-80 xl:w-96 border-l border-border bg-surface flex flex-col">
        <Carrito />
      </div>
    </div>
  );
}

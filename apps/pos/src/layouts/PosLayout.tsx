import React, { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@niagara/ui";
import { useAuthStore } from "@/stores/authPosStore";
import { usePosStore } from "@/stores/posStore";
import { useCobroPointStore } from "@/stores/cobroPointStore";
import { GrillaProductos } from "@/components/GrillaProductos";
import { Carrito } from "@/components/Carrito";
import { Icono } from "@/components/Icono";
import {
  iniciarSyncEngine,
  detenerSyncEngine,
  cachearProductosDesdeAPI,
} from "@/sync/syncEngine";
import { obtenerProductosLocales } from "@/db/localDb";
import type { ProductoPos } from "@/types";

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

  const { terminales, terminalId, cargarTerminales, setTerminal } = useCobroPointStore();

  const localId = staff?.localId;

  // Las terminales Point se cargan una vez al abrir la caja. Si hay una sola
  // usable, el store la selecciona sola.
  useEffect(() => {
    if (localId) void cargarTerminales();
  }, [localId, cargarTerminales]);

  // Inicializar sync engine al montar.
  // Depende del localId: sin él las ventas se sincronizarían sin tenant.
  useEffect(() => {
    if (!localId) return;

    iniciarSyncEngine({
      localId,
      cbs: {
        onEstadoCambia: (estado, pendientes) => {
          setEstadoSync(estado);
          setVentasPendientes(pendientes);
        },
        onVentaSincronizada: (ventaId) => {
          // El contador de pendientes ya se actualiza vía onEstadoCambia;
          // acá solo dejamos rastro para depurar la cola offline.
          console.info("[POS] Venta sincronizada:", ventaId.slice(0, 8));
        },
        onError: (err) => console.warn("[POS] Sync error:", err),
      },
    });

    const marcarOnline = () => setEstadoConexion("online");
    const marcarOffline = () => setEstadoConexion("offline");
    window.addEventListener("online", marcarOnline);
    window.addEventListener("offline", marcarOffline);

    return () => {
      detenerSyncEngine();
      window.removeEventListener("online", marcarOnline);
      window.removeEventListener("offline", marcarOffline);
    };
  }, [localId, setEstadoSync, setVentasPendientes, setEstadoConexion]);

  // Cargar productos (cache local, refrescado desde la API si hay conexión)
  const { data: productos = [] } = useQuery<ProductoPos[]>({
    queryKey: ["productos-pos", localId],
    queryFn: async () => {
      if (!localId) return [];

      // Refrescar el cache si hay internet; si falla, seguimos con el cache viejo
      if (navigator.onLine) {
        await cachearProductosDesdeAPI(localId);
      }

      // Siempre retornar del cache local — la caja tiene que vender offline
      return obtenerProductosLocales(localId);
    },
    enabled: !!localId,
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

            {/* Terminal Point en uso. Si hay más de una, el cajero elige. */}
            {terminales.length > 1 ? (
              <select
                value={terminalId ?? ""}
                onChange={(e) => setTerminal(e.target.value || null)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-semibold bg-surface-2 border",
                  terminalId ? "border-border text-text-secondary" : "border-warning text-warning"
                )}
              >
                <option value="">Elegir terminal…</option>
                {terminales.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            ) : (
              terminales.length === 1 && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-2 border border-border text-xs font-semibold text-text-secondary">
                  <Icono nombre="terminales" tamano={13} />
                  {terminales[0]?.nombre}
                </div>
              )
            )}

            {estadoSync === "sincronizando" && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple/10 text-purple text-xs font-semibold">
                <Icono nombre="cargando" tamano={13} girando />
                Sincronizando
              </div>
            )}

            {ventasPendientes > 0 && estadoSync !== "sincronizando" && (
              <div
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold",
                  estadoSync === "error"
                    ? "bg-danger/10 text-danger"
                    : "bg-warning/10 text-warning"
                )}
              >
                <Icono nombre={estadoSync === "error" ? "alerta" : "reloj"} tamano={13} />
                {ventasPendientes} pendiente{ventasPendientes > 1 ? "s" : ""}
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

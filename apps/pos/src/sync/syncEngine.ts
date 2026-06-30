/**
 * Motor de sincronización offline → API Club Niágara.
 *
 * Estrategia:
 * 1. Al arrancar, cachear productos desde la API
 * 2. Al recuperar conexión, enviar batch de ventas pendientes
 * 3. Reintentar cada SYNC_RETRY_INTERVAL_MS si hay pendientes
 * 4. Idempotencia: la API usa upsert (si ya existe el id, lo ignora)
 */

import {
  obtenerVentasPendientes,
  marcarVentaSincronizada,
  marcarVentaConError,
  cachearProductos,
} from "../db/localDb";
import { api } from "../lib/apiClient";
import { SYNC_RETRY_INTERVAL_MS } from "@niagara/core";
import type { Producto } from "@niagara/core";

type EstadoSync = "sincronizado" | "sincronizando" | "pendiente" | "sin_conexion" | "error";

interface SyncCallbacks {
  onEstadoCambia: (estado: EstadoSync, pendientes: number) => void;
  onVentaSincronizada: (ventaId: string) => void;
  onError: (error: string) => void;
}

let intervaloSync: ReturnType<typeof setInterval> | null = null;
let localId: string | null = null;
let callbacks: SyncCallbacks | null = null;

/** Inicializar el motor de sync */
export function iniciarSyncEngine(config: { localId: string; cbs: SyncCallbacks }) {
  localId = config.localId;
  callbacks = config.cbs;

  window.addEventListener("online", () => void sincronizarAhora());
  window.addEventListener("offline", () => {
    callbacks?.onEstadoCambia("sin_conexion", 0);
  });

  intervaloSync = setInterval(() => {
    if (navigator.onLine) void sincronizarAhora();
  }, SYNC_RETRY_INTERVAL_MS);

  if (navigator.onLine) void sincronizarAhora();
}

/** Detener el motor de sync */
export function detenerSyncEngine() {
  if (intervaloSync) clearInterval(intervaloSync);
}

/** Enviar batch de ventas pendientes a la API */
export async function sincronizarAhora(): Promise<void> {
  const pendientes = await obtenerVentasPendientes();

  if (pendientes.length === 0) {
    callbacks?.onEstadoCambia("sincronizado", 0);
    return;
  }

  callbacks?.onEstadoCambia("sincronizando", pendientes.length);

  try {
    type SyncResponse = {
      resultados: Array<{ id: string; ok: boolean; error?: string }>;
      exitosas: number;
    };

    const res = await api.post<SyncResponse>(
      "/ventas/sync",
      { ventas: pendientes },
      localId ?? undefined
    );

    // Procesar resultados individuales
    for (const r of res.resultados) {
      if (r.ok) {
        await marcarVentaSincronizada(r.id);
        callbacks?.onVentaSincronizada(r.id);
      } else {
        await marcarVentaConError(r.id, r.error ?? "Error en servidor");
        callbacks?.onError(`Error sync venta ${r.id.slice(0, 8)}: ${r.error}`);
      }
    }

    const errores = res.resultados.filter((r) => !r.ok).length;
    callbacks?.onEstadoCambia(errores > 0 ? "error" : "sincronizado", errores);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Sin conexión";
    callbacks?.onEstadoCambia("error", pendientes.length);
    callbacks?.onError(`Error de sincronización: ${mensaje}`);
  }
}

/** Cachear productos desde la API en IndexedDB */
export async function cachearProductosDesdeAPI(lid: string): Promise<void> {
  try {
    const data = await api.get<{ productos: Producto[] }>("/productos", lid);
    if (data.productos) {
      await cachearProductos(data.productos);
    }
  } catch (err) {
    console.warn("[POS] No se pudieron cachear productos:", err);
    // No es crítico — la caja sigue con cache anterior si existe
  }
}

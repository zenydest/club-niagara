/**
 * Base de datos local del POS (IndexedDB vía idb).
 * Permite vender sin internet y sincronizar al volver.
 *
 * Estrategia offline:
 * 1. Productos se cachean al arrancar (fetch de Supabase)
 * 2. Ventas se guardan localmente con UUID de cliente
 * 3. Al recuperar conexión, se sincronizan en orden de created_at
 */

import { openDB, type IDBPDatabase } from "idb";
import type { Venta, VentaItem, Producto } from "@niagara/core";
import { DB_SCHEMA_VERSION } from "@niagara/core";

const NOMBRE_DB = "niagara-pos";

interface NoxaPosDB {
  productos: Producto & { _cached_at: string };
  ventas_pendientes: Venta & { items: VentaItem[] };
  ventas_sincronizadas: Venta;
}

let _db: IDBPDatabase<NoxaPosDB> | null = null;

/** Obtener la instancia de la DB (singleton) */
export async function getDb(): Promise<IDBPDatabase<NoxaPosDB>> {
  if (_db) return _db;

  _db = await openDB<NoxaPosDB>(NOMBRE_DB, DB_SCHEMA_VERSION, {
    upgrade(db, oldVersion) {
      // Versión 1: schema inicial
      if (oldVersion < 1) {
        // Productos cacheados
        const storeProductos = db.createObjectStore("productos", { keyPath: "id" });
        storeProductos.createIndex("categoria", "categoria");
        storeProductos.createIndex("local_id", "local_id");

        // Ventas pendientes de sync
        const storeVentas = db.createObjectStore("ventas_pendientes", { keyPath: "id" });
        storeVentas.createIndex("created_at", "created_at");
        storeVentas.createIndex("synced", "synced");

        // Ventas ya sincronizadas (historial local)
        db.createObjectStore("ventas_sincronizadas", { keyPath: "id" });
      }
    },
  });

  return _db;
}

// ============================================================
// PRODUCTOS
// ============================================================

/** Guardar productos en cache local */
export async function cachearProductos(productos: Producto[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("productos", "readwrite");
  const ahora = new Date().toISOString();

  await Promise.all([
    ...productos.map((p) =>
      tx.store.put({ ...p, _cached_at: ahora })
    ),
    tx.done,
  ]);
}

/** Obtener productos del cache local */
export async function obtenerProductosLocales(localId: string): Promise<Producto[]> {
  const db = await getDb();
  const index = db.transaction("productos").store.index("local_id");
  const items = await index.getAll(localId);
  return items.map(({ _cached_at: _, ...p }) => p) as Producto[];
}

// ============================================================
// VENTAS OFFLINE
// ============================================================

/** Guardar una venta localmente (offline) */
export async function guardarVentaLocal(
  venta: Venta,
  items: VentaItem[]
): Promise<void> {
  const db = await getDb();
  await db.put("ventas_pendientes", { ...venta, items, synced: "pending" });
}

/** Obtener todas las ventas pendientes de sync */
export async function obtenerVentasPendientes(): Promise<(Venta & { items: VentaItem[] })[]> {
  const db = await getDb();
  const index = db.transaction("ventas_pendientes").store.index("synced");
  return index.getAll("pending");
}

/** Marcar una venta como sincronizada */
export async function marcarVentaSincronizada(ventaId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["ventas_pendientes", "ventas_sincronizadas"], "readwrite");

  const venta = await tx.objectStore("ventas_pendientes").get(ventaId);
  if (venta) {
    await tx.objectStore("ventas_sincronizadas").put({ ...venta, synced: "synced" });
    await tx.objectStore("ventas_pendientes").delete(ventaId);
  }

  await tx.done;
}

/** Marcar una venta con error de sync */
export async function marcarVentaConError(ventaId: string, error: string): Promise<void> {
  const db = await getDb();
  const venta = await db.get("ventas_pendientes", ventaId);
  if (venta) {
    await db.put("ventas_pendientes", {
      ...venta,
      synced: "error",
      _sync_error: error,
    } as typeof venta & { _sync_error: string });
  }
}

/** Contar ventas pendientes de sync */
export async function contarVentasPendientes(): Promise<number> {
  const db = await getDb();
  const index = db.transaction("ventas_pendientes").store.index("synced");
  return index.count("pending");
}

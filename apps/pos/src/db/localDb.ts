/**
 * Base de datos local del POS (IndexedDB vía idb).
 * Permite vender sin internet y sincronizar al volver.
 *
 * Estrategia offline:
 * 1. Productos se cachean al arrancar (fetch de la API)
 * 2. Ventas se guardan localmente con UUID generado en el cliente
 * 3. Al recuperar conexión, se sincronizan en orden de createdAt
 *
 * Nota de schema: los índices usan claves camelCase (`localId`, `createdAt`)
 * porque es el formato que devuelve la API y el que se persiste acá. En la v1
 * los índices apuntaban a `local_id` / `created_at`, claves que nunca se
 * escribían, así que quedaban vacíos y el POS no encontraba sus productos.
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { DB_SCHEMA_VERSION } from "@niagara/core";
import type { ProductoPos, VentaItemPos, VentaPosConItems } from "../types";

const NOMBRE_DB = "niagara-pos";

type ProductoCacheado = ProductoPos & { _cachedAt: string };
type VentaPendiente = VentaPosConItems & { _syncError?: string };

/**
 * Schema tipado de la base local. Al extender `DBSchema` de idb, TypeScript
 * valida los nombres de store, los tipos de valor y —clave acá— que cada
 * índice exista y que su tipo de clave coincida. Antes el schema era una
 * interfaz suelta, idb caía en modo sin tipos y los índices mal escritos
 * (`local_id`) pasaban desapercibidos.
 */
interface NoxaPosDB extends DBSchema {
  productos: {
    key: string;
    value: ProductoCacheado;
    indexes: { categoria: string; localId: string };
  };
  ventas_pendientes: {
    key: string;
    value: VentaPendiente;
    indexes: { createdAt: string; synced: string };
  };
  ventas_sincronizadas: {
    key: string;
    value: VentaPosConItems;
  };
}

let _db: IDBPDatabase<NoxaPosDB> | null = null;

/** Obtener la instancia de la DB (singleton) */
export async function getDb(): Promise<IDBPDatabase<NoxaPosDB>> {
  if (_db) return _db;

  _db = await openDB<NoxaPosDB>(NOMBRE_DB, DB_SCHEMA_VERSION, {
    upgrade(db, oldVersion, _newVersion, tx) {
      // ── v1: schema inicial ──────────────────────────────────
      if (oldVersion < 1) {
        const storeProductos = db.createObjectStore("productos", { keyPath: "id" });
        storeProductos.createIndex("categoria", "categoria");
        storeProductos.createIndex("localId", "localId");

        const storeVentas = db.createObjectStore("ventas_pendientes", { keyPath: "id" });
        storeVentas.createIndex("createdAt", "createdAt");
        storeVentas.createIndex("synced", "synced");

        db.createObjectStore("ventas_sincronizadas", { keyPath: "id" });
      }

      // ── v2: corregir índices snake_case → camelCase ──────────
      // `productos` es cache descartable: se borra y se vuelve a crear.
      // `ventas_pendientes` puede tener ventas sin sincronizar, así que NO se
      // borra — solo se le agrega el índice que falta.
      if (oldVersion >= 1 && oldVersion < 2) {
        db.deleteObjectStore("productos");
        const storeProductos = db.createObjectStore("productos", { keyPath: "id" });
        storeProductos.createIndex("categoria", "categoria");
        storeProductos.createIndex("localId", "localId");

        const storeVentas = tx.objectStore("ventas_pendientes");
        if (!storeVentas.indexNames.contains("createdAt")) {
          storeVentas.createIndex("createdAt", "createdAt");
        }
      }
    },
  });

  return _db;
}

// ============================================================
// PRODUCTOS
// ============================================================

/** Guardar productos en cache local */
export async function cachearProductos(productos: ProductoPos[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("productos", "readwrite");
  const ahora = new Date().toISOString();

  await Promise.all([
    ...productos.map((p) => tx.store.put({ ...p, _cachedAt: ahora })),
    tx.done,
  ]);
}

/** Obtener productos del cache local */
export async function obtenerProductosLocales(localId: string): Promise<ProductoPos[]> {
  const db = await getDb();
  const index = db.transaction("productos").store.index("localId");
  const items = await index.getAll(localId);
  return items.map(({ _cachedAt: _, ...p }) => p);
}

// ============================================================
// VENTAS OFFLINE
// ============================================================

/** Guardar una venta localmente (offline) */
export async function guardarVentaLocal(
  venta: Omit<VentaPosConItems, "items" | "synced">,
  items: VentaItemPos[]
): Promise<void> {
  const db = await getDb();
  await db.put("ventas_pendientes", { ...venta, items, synced: "pending" });
}

/**
 * Obtener todas las ventas que faltan sincronizar, ordenadas por createdAt.
 *
 * Incluye las marcadas con `error`, no solo las `pending`: antes una venta que
 * fallaba una vez quedaba con `synced: "error"` y ya nunca se volvía a
 * consultar, así que se perdía plata en silencio. Ahora se reintenta —el sync
 * de la API es idempotente por id, así que reenviar es seguro.
 */
export async function obtenerVentasPendientes(): Promise<VentaPosConItems[]> {
  const db = await getDb();
  const store = db.transaction("ventas_pendientes").store;

  const [pendientes, conError] = await Promise.all([
    store.index("synced").getAll("pending"),
    store.index("synced").getAll("error"),
  ]);

  return [...pendientes, ...conError].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
}

/** Marcar una venta como sincronizada */
export async function marcarVentaSincronizada(ventaId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["ventas_pendientes", "ventas_sincronizadas"], "readwrite");

  const venta = await tx.objectStore("ventas_pendientes").get(ventaId);
  if (venta) {
    const { _syncError: _, ...limpia } = venta;
    await tx.objectStore("ventas_sincronizadas").put({ ...limpia, synced: "synced" });
    await tx.objectStore("ventas_pendientes").delete(ventaId);
  }

  await tx.done;
}

/** Marcar una venta con error de sync */
export async function marcarVentaConError(ventaId: string, error: string): Promise<void> {
  const db = await getDb();
  const venta = await db.get("ventas_pendientes", ventaId);
  if (venta) {
    await db.put("ventas_pendientes", { ...venta, synced: "error", _syncError: error });
  }
}

/** Contar ventas que faltan sincronizar (pendientes + con error) */
export async function contarVentasPendientes(): Promise<number> {
  const db = await getDb();
  const index = db.transaction("ventas_pendientes").store.index("synced");

  const [pendientes, conError] = await Promise.all([
    index.count("pending"),
    index.count("error"),
  ]);

  return pendientes + conError;
}

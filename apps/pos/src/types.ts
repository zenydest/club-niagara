/**
 * Tipos internos del POS — camelCase, alineados con el formato de red real.
 *
 * Por qué existen: `packages/core/src/types` todavía usa snake_case (herencia
 * de la etapa Supabase), pero la API actual es Fastify + Prisma y serializa en
 * camelCase (`localId`, `createdAt`, `imagenUrl`, `metodoPago`...). El POS
 * consume esa API y guarda los mismos objetos en IndexedDB, así que necesita
 * tipos que describan lo que realmente viaja.
 *
 * Cuando se unifique `packages/core` a camelCase, este archivo se borra y se
 * vuelve a importar desde `@niagara/core`.
 */

import type { MetodoPago, EstadoSync } from "@niagara/core";

/** Producto tal como lo devuelve GET /api/productos */
export interface ProductoPos {
  id: string;
  localId: string;
  nombre: string;
  descripcion: string | null;
  categoria: string;
  precio: number;
  costo: number | null;
  imagenUrl: string | null;
  activo: boolean;
  createdAt: string;
}

/** Ítem de venta tal como lo acepta `ventaSchema` en POST /api/ventas/sync */
export interface VentaItemPos {
  id: string;
  ventaId: string;
  localId: string;
  productoId: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

/** Venta generada en el cliente (UUID + timestamp locales, offline-first) */
export interface VentaPos {
  id: string;
  localId: string;
  eventoId: string | null;
  barraId: string | null;
  staffId: string;
  metodoPago: MetodoPago;
  total: number;
  descuento: number;
  nota: string | null;
  createdAt: string;
  synced: EstadoSync;
}

/** Venta con sus ítems, tal como se persiste en IndexedDB y se envía al sync */
export type VentaPosConItems = VentaPos & { items: VentaItemPos[] };

/**
 * Estado del motor de sync que se muestra en la UI de la caja.
 * Incluye `sin_conexion`, que es lo que emite el motor al perder internet.
 */
export type EstadoSyncPos =
  | "sincronizado"
  | "sincronizando"
  | "pendiente"
  | "sin_conexion"
  | "error";

// ── Terminales Mercado Pago Point ────────────────────────────────

/** Terminal Point tal como la devuelve GET /api/point/terminales */
export interface TerminalPos {
  id: string;
  nombre: string;
  barraId: string | null;
  operatingMode: "PDV" | "STANDALONE" | "UNDEFINED";
  activa: boolean;
  barra?: { id: string; nombre: string } | null;
}

/** Estados de la orden que devuelve la API, calcados de los de MP */
export type EstadoOrdenPoint =
  | "created"
  | "at_terminal"
  | "processed"
  | "canceled"
  | "expired"
  | "refunded"
  | "action_required";

/** Orden de cobro tal como la devuelve la API */
export interface OrdenPointPos {
  id: string;
  referencia: string;
  terminalId: string;
  monto: string | number;
  estado: EstadoOrdenPoint;
  estadoDetalle: string | null;
}

/**
 * Estado del cobro desde la perspectiva de la caja.
 *
 * Es distinto del estado de MP porque la caja necesita distinguir «todavía no
 * mandé nada» de «la terminal la tiene y estoy esperando», que en MP son
 * `created` y `at_terminal`.
 */
export type EstadoCobroPos =
  | "inactivo"
  | "creando"
  | "esperando"
  | "pagado"
  | "rechazado"
  | "cancelado"
  | "error";

/**
 * Tipos compartidos de Club Niágara.
 * Usados en web, pos y mobile para garantizar consistencia.
 */

// ============================================================
// Enums / Literales
// ============================================================

/** Roles del personal del local */
export type RolStaff =
  | "admin"
  | "encargado"
  | "cajero"
  | "portero"
  | "rrpp"
  | "barman";

/** Estado de un evento */
export type EstadoEvento = "borrador" | "preventa" | "en_vivo" | "cerrado" | "cancelado";

/** Métodos de pago disponibles en la caja */
export type MetodoPago = "efectivo" | "tarjeta" | "cashless" | "qr_mp" | "cortesia";

/** Estado de sincronización offline */
export type EstadoSync = "synced" | "pending" | "error";

/** Tipos de movimiento de stock */
export type TipoMovimientoStock =
  | "ingreso"
  | "egreso_venta"
  | "egreso_merma"
  | "transferencia"
  | "ajuste";

/** Tipo de entrada al evento */
export type TipoEntrada = "general" | "vip" | "rrpp" | "invitado" | "staff";

/** Estado de una mesa VIP */
export type EstadoMesa = "libre" | "reservada" | "ocupada" | "bloqueada";

/** Estado de una reserva */
export type EstadoReserva = "pendiente" | "confirmada" | "cancelada" | "completada";

// ============================================================
// Entidades base
// ============================================================

/** Local / boliche (tenant raíz) */
export interface Local {
  id: string;
  nombre: string;
  slug: string;
  direccion: string | null;
  ciudad: string | null;
  pais: string;
  moneda: string; // "ARS", "USD", etc.
  capacidad_maxima: number;
  logo_url: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

/** Usuario del staff */
export interface Staff {
  id: string;
  local_id: string;
  user_id: string; // FK a auth.users de Supabase
  nombre: string;
  apellido: string;
  email: string;
  rol: RolStaff;
  activo: boolean;
  created_at: string;
}

/** Evento */
export interface Evento {
  id: string;
  local_id: string;
  nombre: string;
  descripcion: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  capacidad: number;
  estado: EstadoEvento;
  imagen_url: string | null;
  aforo_actual: number;
  created_at: string;
  updated_at: string;
}

/** Producto (bebida, etc.) */
export interface Producto {
  id: string;
  local_id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string;
  precio: number;
  costo: number | null;
  imagen_url: string | null;
  activo: boolean;
  created_at: string;
}

/** Barra / punto de venta dentro del local */
export interface Barra {
  id: string;
  local_id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

/** Depósito de stock */
export interface Deposito {
  id: string;
  local_id: string;
  nombre: string;
  es_principal: boolean;
}

/** Movimiento de stock */
export interface StockMovimiento {
  id: string;
  local_id: string;
  deposito_id: string;
  producto_id: string;
  tipo: TipoMovimientoStock;
  cantidad: number;
  cantidad_anterior: number;
  motivo: string | null;
  staff_id: string | null;
  created_at: string;
  /** Para offline-first */
  synced: EstadoSync;
}

/** Venta (transacción) */
export interface Venta {
  id: string; // UUID generado en el cliente para offline
  local_id: string;
  evento_id: string | null;
  barra_id: string | null;
  staff_id: string;
  metodo_pago: MetodoPago;
  total: number;
  descuento: number;
  nota: string | null;
  created_at: string; // Se usa para last-write-wins en conflictos
  synced: EstadoSync;
}

/** Ítem de una venta */
export interface VentaItem {
  id: string;
  venta_id: string;
  local_id: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

/** Tarjeta/QR cashless del cliente */
export interface TarjetaCashless {
  id: string;
  local_id: string;
  codigo: string; // QR o número de tarjeta
  cliente_nombre: string | null;
  cliente_email: string | null;
  saldo: number;
  activa: boolean;
  created_at: string;
  updated_at: string;
}

/** Recarga de saldo cashless */
export interface Recarga {
  id: string;
  local_id: string;
  tarjeta_id: string;
  staff_id: string;
  monto: number;
  metodo_pago: MetodoPago;
  mp_payment_id: string | null;
  created_at: string;
  synced: EstadoSync;
}

/** Registro de acceso (ingreso/egreso) */
export interface Acceso {
  id: string;
  local_id: string;
  evento_id: string;
  staff_id: string | null;
  entrada_vendida_id: string | null;
  tipo: "ingreso" | "egreso";
  metodo: "manual" | "qr" | "cashless";
  created_at: string;
  synced: EstadoSync;
}

/** Tipo de entrada al evento */
export interface EntradaTipo {
  id: string;
  evento_id: string;
  local_id: string;
  nombre: string;
  tipo: TipoEntrada;
  precio: number;
  cantidad_total: number | null;
  cantidad_vendida: number;
  activo: boolean;
}

/** Entrada vendida (ticket) */
export interface EntradaVendida {
  id: string;
  local_id: string;
  evento_id: string;
  entrada_tipo_id: string;
  qr_code: string; // UUID único del QR
  cliente_nombre: string | null;
  cliente_email: string | null;
  precio_pagado: number;
  metodo_pago: MetodoPago;
  rrpp_id: string | null;
  usada: boolean;
  created_at: string;
}

/** Mesa VIP */
export interface MesaVip {
  id: string;
  local_id: string;
  numero: string;
  sector: string | null;
  capacidad: number;
  estado: EstadoMesa;
  evento_id: string | null;
  pos_x: number | null; // Para el mapa visual
  pos_y: number | null;
}

/** Reserva */
export interface Reserva {
  id: string;
  local_id: string;
  evento_id: string | null;
  mesa_vip_id: string | null;
  cliente_nombre: string;
  cliente_email: string | null;
  cliente_telefono: string | null;
  cantidad_personas: number;
  estado: EstadoReserva;
  nota: string | null;
  monto_seña: number | null;
  created_at: string;
}

/** Ticket de guardarropa */
export interface Guardarropa {
  id: string;
  local_id: string;
  evento_id: string | null;
  numero_ticket: number;
  descripcion: string | null;
  entregado: boolean;
  cliente_nombre: string | null;
  staff_id: string | null;
  created_at: string;
}

/** Comisión de RRPP */
export interface ComisionRrpp {
  id: string;
  local_id: string;
  staff_id: string; // El RRPP
  evento_id: string;
  entradas_vendidas: number;
  monto_total_ventas: number;
  porcentaje_comision: number;
  monto_comision: number;
  pagada: boolean;
  created_at: string;
}

/** Corte de caja */
export interface CorteCaja {
  id: string;
  local_id: string;
  evento_id: string | null;
  staff_id: string;
  barra_id: string | null;
  efectivo_esperado: number;
  efectivo_real: number | null;
  diferencia: number | null;
  ventas_efectivo: number;
  ventas_tarjeta: number;
  ventas_cashless: number;
  ventas_qr: number;
  ventas_cortesia: number;
  total_ventas: number;
  nota: string | null;
  cerrado_at: string | null;
  created_at: string;
}

// ============================================================
// Tipos de utilidad
// ============================================================

/** KPIs del dashboard en tiempo real */
export interface DashboardKpis {
  aforo_actual: number;
  capacidad_maxima: number;
  porcentaje_aforo: number;
  ventas_totales: number;
  ventas_ultima_hora: number;
  entradas_vendidas: number;
  ingresos_evento: number;
}

/** Resultado de operación offline con estado de sync */
export interface OperacionOffline<T> {
  dato: T;
  timestamp: string;
  sync_intentos: number;
  error?: string;
}

/**
 * Constantes globales de Club Niágara.
 */

/** Colores del tema (sincronizados con Tailwind config) */
export const NIAGARA_COLORS = {
  background: "#08080F",
  surface: "#0F0F1A",
  surface2: "#16162A",
  lime: "#C2FF00",
  purple: "#7B3FFF",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  textPrimary: "#F8F8FF",
  textSecondary: "#9999BB",
} as const;

/** Roles con sus etiquetas en español */
export const ROL_LABELS: Record<string, string> = {
  admin: "Administrador",
  encargado: "Encargado",
  cajero: "Cajero",
  // El valor en la base sigue siendo `portero`: cambiarlo obligaría a migrar
  // el enum y todas las filas de staff. Acá solo se cambia cómo se lee.
  portero: "Encargado de Ingreso",
  rrpp: "Relaciones Públicas",
  barman: "Barman",
};

/**
 * Permisos por rol — referencia, no control de acceso.
 *
 * Lo que manda de verdad son dos cosas: `NAV_ITEMS` en el Sidebar del panel,
 * que decide qué se ve, y el chequeo de rol de cada ruta de la API, que decide
 * qué se puede pedir. Esta tabla es un resumen para leer de un vistazo, y hay
 * que actualizarla cuando cambian los otros dos.
 */
export const ROL_PERMISOS = {
  admin: ["*"], // Acceso total
  // El encargado dejó de tener dashboard: la recaudación de la noche es solo
  // del dueño. Lo que necesita mirar está en Reportes.
  encargado: ["eventos", "reportes", "staff", "productos", "caja", "porteria"],
  // El cajero tiene dashboard, pero es el suyo: unidades que despachó él, sin
  // montos acumulados (GET /dashboard/mi-consumo).
  cajero: ["dashboard", "caja", "cashless", "productos"],
  portero: ["porteria", "accesos"],
  rrpp: ["cortesias", "reservas"],
  barman: ["caja", "productos", "stock"],
} as const;

/** Tiempo en ms antes de considerar una operación offline como expirada */
export const OFFLINE_QUEUE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

/** Intervalo de reintento de sync (ms) */
export const SYNC_RETRY_INTERVAL_MS = 30_000; // 30 segundos

/** Alertas de stock: porcentaje mínimo antes de avisar */
export const STOCK_ALERTA_PORCENTAJE = 20;

/** Porcentaje de aforo para activar alerta roja */
export const AFORO_ALERTA_PORCENTAJE = 90;

/**
 * Versión del esquema de base de datos local (offline).
 * v2: índices de IndexedDB migrados de snake_case a camelCase para que
 *     coincidan con las claves que devuelve la API.
 */
export const DB_SCHEMA_VERSION = 2;

/** Métodos de pago con etiquetas */
export const METODO_PAGO_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  cashless: "Cashless",
  qr_mp: "QR Mercado Pago",
  cortesia: "Cortesía",
};

/** Estados de evento con etiquetas */
export const ESTADO_EVENTO_LABELS: Record<string, string> = {
  borrador: "Borrador",
  preventa: "Preventa",
  en_vivo: "En vivo",
  cerrado: "Cerrado",
  cancelado: "Cancelado",
};

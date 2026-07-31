export { prisma } from "./client.js";

// El namespace `Prisma` trae los tipos de entrada (InputJsonValue, filtros,
// etc.) que hacen falta al armar queries desde la API.
export { Prisma } from "@prisma/client";

// Re-exportar tipos de Prisma para que las apps no importen directamente de @prisma/client
export type {
  Local,
  Staff,
  Evento,
  Barra,
  Producto,
  Terminal,
  OrdenPoint,
  Deposito,
  StockMovimiento,
  Venta,
  VentaItem,
  TarjetaCashless,
  Recarga,
  Acceso,
  EntradaTipo,
  EntradaVendida,
  MesaVip,
  Reserva,
  Guardarropa,
  ComisionRrpp,
  CorteCaja,
  User,
  Session,
  // Enums
  RolStaff,
  EstadoEvento,
  MetodoPago,
  EstadoSync,
  TipoMovimientoStock,
  TipoEntrada,
  EstadoMesa,
  EstadoReserva,
  TipoAcceso,
  MetodoAcceso,
} from "@prisma/client";

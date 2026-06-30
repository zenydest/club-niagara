/**
 * Schemas de validación con Zod.
 * Compartidos entre web, pos y supabase edge functions.
 */

import { z } from "zod";

// ============================================================
// Schemas de autenticación
// ============================================================

export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ============================================================
// Schemas de entidades
// ============================================================

export const localSchema = z.object({
  nombre: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/, "Solo letras minúsculas, números y guiones"),
  direccion: z.string().max(200).nullable().optional(),
  ciudad: z.string().max(100).nullable().optional(),
  pais: z.string().length(2, "Código de país ISO 2 letras").default("AR"),
  moneda: z.string().length(3, "Código de moneda ISO 3 letras").default("ARS"),
  capacidad_maxima: z.number().int().positive("La capacidad debe ser positiva"),
});

export const eventoSchema = z.object({
  nombre: z.string().min(2).max(200),
  descripcion: z.string().max(1000).nullable().optional(),
  fecha_inicio: z.string().datetime(),
  fecha_fin: z.string().datetime().nullable().optional(),
  capacidad: z.number().int().positive(),
  estado: z.enum(["borrador", "preventa", "en_vivo", "cerrado", "cancelado"]),
});

export const productoSchema = z.object({
  nombre: z.string().min(1).max(100),
  descripcion: z.string().max(500).nullable().optional(),
  categoria: z.string().min(1).max(50),
  precio: z.number().nonnegative(),
  costo: z.number().nonnegative().nullable().optional(),
  activo: z.boolean().default(true),
});

export const ventaSchema = z.object({
  evento_id: z.string().uuid().nullable().optional(),
  barra_id: z.string().uuid().nullable().optional(),
  metodo_pago: z.enum(["efectivo", "tarjeta", "cashless", "qr_mp", "cortesia"]),
  total: z.number().nonnegative(),
  descuento: z.number().nonnegative().default(0),
  nota: z.string().max(500).nullable().optional(),
  items: z.array(
    z.object({
      producto_id: z.string().uuid(),
      cantidad: z.number().int().positive(),
      precio_unitario: z.number().nonnegative(),
    })
  ).min(1, "La venta debe tener al menos un producto"),
});

export type VentaInput = z.infer<typeof ventaSchema>;

export const accesosSchema = z.object({
  evento_id: z.string().uuid(),
  entrada_vendida_id: z.string().uuid().nullable().optional(),
  tipo: z.enum(["ingreso", "egreso"]),
  metodo: z.enum(["manual", "qr", "cashless"]),
});

export type AccesoInput = z.infer<typeof accesosSchema>;

export const recargaSchema = z.object({
  tarjeta_id: z.string().uuid(),
  monto: z.number().positive("El monto debe ser positivo"),
  metodo_pago: z.enum(["efectivo", "tarjeta", "cashless", "qr_mp", "cortesia"]),
});

export const staffSchema = z.object({
  nombre: z.string().min(1).max(100),
  apellido: z.string().min(1).max(100),
  email: z.string().email(),
  rol: z.enum(["admin", "encargado", "cajero", "portero", "rrpp", "barman"]),
});

export const reservaSchema = z.object({
  evento_id: z.string().uuid().nullable().optional(),
  mesa_vip_id: z.string().uuid().nullable().optional(),
  cliente_nombre: z.string().min(1).max(100),
  cliente_email: z.string().email().nullable().optional(),
  cliente_telefono: z.string().max(20).nullable().optional(),
  cantidad_personas: z.number().int().positive(),
  nota: z.string().max(500).nullable().optional(),
  monto_seña: z.number().nonnegative().nullable().optional(),
});

export const corteCajaSchema = z.object({
  evento_id: z.string().uuid().nullable().optional(),
  barra_id: z.string().uuid().nullable().optional(),
  efectivo_real: z.number().nonnegative(),
  nota: z.string().max(500).nullable().optional(),
});

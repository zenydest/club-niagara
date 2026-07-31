/**
 * Tests unitarios de los schemas Zod compartidos.
 * Cubren validaciones críticas, defaults y casos borde de las entidades
 * que viajan entre web, pos, mobile y la API.
 */

import { describe, it, expect } from "vitest";
import {
  loginSchema,
  localSchema,
  eventoSchema,
  productoSchema,
  ventaSchema,
  accesosSchema,
  staffSchema,
  recargaSchema,
} from "./index";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const UUID2 = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const ISO = "2026-07-23T22:00:00.000Z";

describe("loginSchema", () => {
  it("acepta credenciales válidas", () => {
    const r = loginSchema.safeParse({ email: "dj@club.com", password: "secreto123" });
    expect(r.success).toBe(true);
  });

  it("rechaza email inválido", () => {
    const r = loginSchema.safeParse({ email: "no-es-email", password: "secreto123" });
    expect(r.success).toBe(false);
  });

  it("rechaza contraseñas de menos de 8 caracteres", () => {
    const r = loginSchema.safeParse({ email: "dj@club.com", password: "corta" });
    expect(r.success).toBe(false);
  });
});

describe("localSchema", () => {
  it("aplica defaults de país (AR) y moneda (ARS)", () => {
    const r = localSchema.parse({
      nombre: "Club Niágara",
      slug: "club-niagara",
      capacidad_maxima: 500,
    });
    expect(r.pais).toBe("AR");
    expect(r.moneda).toBe("ARS");
  });

  it("rechaza slug con mayúsculas o espacios", () => {
    expect(localSchema.safeParse({ nombre: "Club", slug: "Club Niagara", capacidad_maxima: 100 }).success).toBe(false);
  });

  it("rechaza capacidad no positiva", () => {
    expect(localSchema.safeParse({ nombre: "Club", slug: "club", capacidad_maxima: 0 }).success).toBe(false);
  });
});

describe("eventoSchema", () => {
  it("acepta un evento válido", () => {
    const r = eventoSchema.safeParse({
      nombre: "Opening Party",
      fecha_inicio: ISO,
      capacidad: 300,
      estado: "preventa",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza un estado fuera del enum", () => {
    const r = eventoSchema.safeParse({
      nombre: "Opening Party",
      fecha_inicio: ISO,
      capacidad: 300,
      estado: "en_pausa",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza fecha_inicio que no sea datetime ISO", () => {
    const r = eventoSchema.safeParse({
      nombre: "Opening Party",
      fecha_inicio: "23/07/2026",
      capacidad: 300,
      estado: "preventa",
    });
    expect(r.success).toBe(false);
  });
});

describe("productoSchema", () => {
  it("por defecto marca el producto como activo", () => {
    const r = productoSchema.parse({ nombre: "Fernet", categoria: "tragos", precio: 3500 });
    expect(r.activo).toBe(true);
  });

  it("rechaza precio negativo", () => {
    expect(productoSchema.safeParse({ nombre: "Fernet", categoria: "tragos", precio: -1 }).success).toBe(false);
  });
});

describe("ventaSchema", () => {
  const ventaBase = {
    id: UUID,
    createdAt: ISO,
    metodoPago: "efectivo" as const,
    total: 7000,
    items: [{ productoId: UUID2, cantidad: 2, precioUnitario: 3500, subtotal: 7000 }],
  };

  it("acepta una venta válida y aplica descuento 0 por defecto", () => {
    const r = ventaSchema.parse(ventaBase);
    expect(r.descuento).toBe(0);
  });

  it("rechaza una venta sin ítems", () => {
    expect(ventaSchema.safeParse({ ...ventaBase, items: [] }).success).toBe(false);
  });

  it("rechaza un id que no sea UUID", () => {
    expect(ventaSchema.safeParse({ ...ventaBase, id: "123" }).success).toBe(false);
  });

  it("rechaza un método de pago inválido", () => {
    expect(ventaSchema.safeParse({ ...ventaBase, metodoPago: "cripto" }).success).toBe(false);
  });

  it("rechaza cantidad no entera en un ítem", () => {
    const r = ventaSchema.safeParse({
      ...ventaBase,
      items: [{ productoId: UUID2, cantidad: 1.5, precioUnitario: 3500, subtotal: 5250 }],
    });
    expect(r.success).toBe(false);
  });
});

describe("accesosSchema", () => {
  it("acepta un ingreso manual válido", () => {
    const r = accesosSchema.safeParse({
      id: UUID,
      createdAt: ISO,
      eventoId: UUID2,
      tipo: "ingreso",
      metodo: "manual",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza un tipo de acceso inválido", () => {
    const r = accesosSchema.safeParse({
      id: UUID,
      createdAt: ISO,
      eventoId: UUID2,
      tipo: "salida",
      metodo: "qr",
    });
    expect(r.success).toBe(false);
  });
});

describe("staffSchema", () => {
  it("acepta todos los roles válidos", () => {
    for (const rol of ["admin", "encargado", "cajero", "portero", "rrpp", "barman"]) {
      const r = staffSchema.safeParse({ nombre: "Ana", apellido: "Gómez", email: "a@c.com", rol });
      expect(r.success).toBe(true);
    }
  });

  it("rechaza un rol inexistente", () => {
    expect(staffSchema.safeParse({ nombre: "Ana", apellido: "Gómez", email: "a@c.com", rol: "dueño" }).success).toBe(false);
  });
});

describe("recargaSchema", () => {
  it("rechaza monto no positivo", () => {
    expect(recargaSchema.safeParse({ tarjeta_id: UUID, monto: 0, metodo_pago: "efectivo" }).success).toBe(false);
  });

  it("acepta una recarga válida", () => {
    expect(recargaSchema.safeParse({ tarjeta_id: UUID, monto: 5000, metodo_pago: "qr_mp" }).success).toBe(true);
  });
});

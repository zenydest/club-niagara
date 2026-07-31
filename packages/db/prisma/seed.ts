/**
 * Seed de Club Niágara
 * Ejecutar: pnpm db:seed (desde packages/db)
 *
 * Crea:
 *  - 1 local demo
 *  - 1 usuario admin + staff vinculado
 *  - 1 evento activo
 *  - 2 barras
 *  - 10 productos de ejemplo
 *  - 1 depósito principal
 *  - 2 tipos de entrada
 *  - Staff adicional (cajero, portero, rrpp)
 *
 * Usa Better Auth para crear usuarios con el hash correcto (scrypt).
 */

import { PrismaClient, RolStaff, EstadoEvento, TipoEntrada } from "@prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

const prisma = new PrismaClient();

// Instancia local de auth solo para el seed — hashea contraseñas correctamente
const seedAuth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
  secret: process.env["BETTER_AUTH_SECRET"] ?? "seed-secret-minimo-32-caracteres-ok",
  baseURL: process.env["BETTER_AUTH_URL"] ?? "http://localhost:3001",
});

/** Crea o recupera un usuario via Better Auth (con hash correcto) */
async function upsertAuthUser(email: string, password: string, name: string) {
  // Buscar si ya existe
  const existente = await prisma.user.findUnique({ where: { email } });
  if (existente) {
    // Actualizar la cuenta con el hash correcto (borrar y recrear)
    await prisma.account.deleteMany({
      where: { userId: existente.id, providerId: "credential" },
    });
    await prisma.user.delete({ where: { id: existente.id } });
  }

  // Crear via Better Auth para obtener hash correcto de la contraseña
  const result = await seedAuth.api.signUpEmail({
    body: { email, password, name },
    headers: new Headers({ "content-type": "application/json" }),
  });

  if (!result?.user) {
    throw new Error(`No se pudo crear el usuario ${email}`);
  }

  return result.user;
}

/**
 * Id del local de demo. Tiene que coincidir con `EXPO_PUBLIC_LOCAL_ID` en
 * apps/mobile/eas.json y en apps/mobile/.env.example.
 */
const LOCAL_ID_DEMO = "821a4e8f-5b68-489d-afa3-bf2b62a9d0f8";

/**
 * Genera un UUID v4 válido, fijo y reproducible para los datos de demo.
 *
 * Los ids **tienen que ser UUID**: los schemas de la API validan con
 * `z.string().uuid()`. Antes el seed usaba ids legibles como "evt-demo-001" o
 * "prod-001", y eso hacía que toda operación sobre datos sembrados fallara con
 * 400 — vender una entrada, registrar una venta, consultar stock. El dato se
 * veía bien en pantalla porque leerlo funciona; lo que fallaba era escribir.
 *
 * Se mantienen fijos (y no `@default(uuid())`) para que recrear la base no
 * invalide lo que ya esté apuntando a ellos.
 *
 * @param prefijo 8 caracteres hexadecimales que identifican la entidad
 * @param n       contador dentro de esa entidad
 */
function idDemo(prefijo: string, n: number): string {
  return `${prefijo}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

const ID = {
  evento:   (n: number) => idDemo("e5e70000", n),
  tipo:     (n: number) => idDemo("e7d00000", n),
  barra:    (n: number) => idDemo("ba110000", n),
  deposito: (n: number) => idDemo("de900000", n),
  producto: (n: number) => idDemo("9c0d0000", n),
  tarjeta:  (n: number) => idDemo("ca8d0000", n),
  mesa:     (n: number) => idDemo("4e5a0000", n),
};

async function main() {
  console.log("🌱 Iniciando seed de Club Niágara...");

  // ── Local ──────────────────────────────────────────────────
  //
  // El id va fijo y no autogenerado a propósito: la app móvil manda el local
  // en el header `x-local-id`, y ese valor está compilado dentro del build
  // (eas.json → EXPO_PUBLIC_LOCAL_ID). Si el seed generara un UUID nuevo en
  // cada base, cada vez que se recrea la base habría que rebuildear la app.
  const local = await prisma.local.upsert({
    where: { slug: "club-niagara-demo" },
    update: {},
    create: {
      id: LOCAL_ID_DEMO,
      nombre: "Club Niágara",
      slug: "club-niagara-demo",
      direccion: "Av. Corrientes 1234",
      ciudad: "Buenos Aires",
      pais: "AR",
      moneda: "ARS",
      capacidadMaxima: 500,
    },
  });
  console.log(`✓ Local: ${local.nombre} (${local.id})`);

  // ── Usuario admin (Better Auth hashea la contraseña) ───────
  const adminUser = await upsertAuthUser(
    "admin@clubniagara.com",
    "Admin1234!",
    "Admin Club Niágara"
  );

  // Staff vinculado al local
  const staffAdmin = await prisma.staff.upsert({
    where: { localId_userId: { localId: local.id, userId: adminUser.id } },
    update: {},
    create: {
      localId: local.id,
      userId: adminUser.id,
      nombre: "Admin",
      apellido: "Demo",
      email: adminUser.email,
      rol: RolStaff.admin,
    },
  });
  console.log(`✓ Staff admin: ${staffAdmin.nombre} ${staffAdmin.apellido}`);

  // ── Evento ─────────────────────────────────────────────────
  const mañana = new Date();
  mañana.setDate(mañana.getDate() + 1);
  mañana.setHours(22, 0, 0, 0);

  const evento = await prisma.evento.upsert({
    where: { id: ID.evento(1) },
    update: { estado: EstadoEvento.en_vivo },
    create: {
      id: ID.evento(1),
      localId: local.id,
      nombre: "Noche de Prueba",
      descripcion: "Evento de demostración del sistema",
      fechaInicio: mañana,
      capacidad: 300,
      estado: EstadoEvento.en_vivo,
    },
  });
  console.log(`✓ Evento: ${evento.nombre}`);

  // ── Tipos de entrada ───────────────────────────────────────
  await prisma.entradaTipo.upsert({
    where: { id: ID.tipo(1) },
    update: {},
    create: {
      id: ID.tipo(1),
      eventoId: evento.id,
      localId: local.id,
      nombre: "General",
      tipo: TipoEntrada.general,
      precio: 2500,
      cantidadTotal: 250,
    },
  });

  await prisma.entradaTipo.upsert({
    where: { id: ID.tipo(2) },
    update: {},
    create: {
      id: ID.tipo(2),
      eventoId: evento.id,
      localId: local.id,
      nombre: "VIP",
      tipo: TipoEntrada.vip,
      precio: 5000,
      cantidadTotal: 50,
    },
  });
  console.log("✓ Tipos de entrada: General, VIP");

  // ── Barras ─────────────────────────────────────────────────
  await prisma.barra.upsert({
    where: { id: ID.barra(1) },
    update: {},
    create: {
      id: ID.barra(1),
      localId: local.id,
      nombre: "Barra Principal",
      descripcion: "Barra central del club",
    },
  });

  await prisma.barra.upsert({
    where: { id: ID.barra(2) },
    update: {},
    create: {
      id: ID.barra(2),
      localId: local.id,
      nombre: "Barra VIP",
      descripcion: "Zona exclusiva VIP",
    },
  });
  console.log("✓ Barras: Principal, VIP");

  // ── Depósito ───────────────────────────────────────────────
  const deposito = await prisma.deposito.upsert({
    where: { id: ID.deposito(1) },
    update: {},
    create: {
      id: ID.deposito(1),
      localId: local.id,
      nombre: "Depósito Principal",
      esPrincipal: true,
    },
  });
  console.log(`✓ Depósito: ${deposito.nombre}`);

  // ── Productos ──────────────────────────────────────────────
  const productos = [
    { nombre: "Cerveza Heineken", categoria: "Cerveza", precio: 800, costo: 350 },
    { nombre: "Cerveza Corona", categoria: "Cerveza", precio: 900, costo: 400 },
    { nombre: "Fernet con Coca", categoria: "Tragos", precio: 1500, costo: 600 },
    { nombre: "Whisky Jack Daniel's", categoria: "Destilados", precio: 2000, costo: 900 },
    { nombre: "Vodka Absolut", categoria: "Destilados", precio: 1800, costo: 750 },
    { nombre: "Champagne Moët", categoria: "Espumantes", precio: 12000, costo: 6000 },
    { nombre: "Agua Mineral", categoria: "Sin Alcohol", precio: 300, costo: 80 },
    { nombre: "Gaseosa 500ml", categoria: "Sin Alcohol", precio: 500, costo: 150 },
    { nombre: "Energizante RedBull", categoria: "Sin Alcohol", precio: 800, costo: 300 },
    { nombre: "Jugo de Naranja", categoria: "Sin Alcohol", precio: 600, costo: 200 },
  ];

  for (const [i, p] of productos.entries()) {
    await prisma.producto.upsert({
      where: { id: ID.producto(i + 1) },
      update: {},
      create: {
        id: ID.producto(i + 1),
        localId: local.id,
        nombre: p.nombre,
        categoria: p.categoria,
        precio: p.precio,
        costo: p.costo,
      },
    });
  }
  console.log(`✓ Productos: ${productos.length} cargados`);

  // ── Staff adicional ────────────────────────────────────────
  const rolesExtra = [
    { email: "cajero@clubniagara.com", nombre: "Carlos", apellido: "Gómez", rol: RolStaff.cajero, password: "Niagara1234!" },
    { email: "portero@clubniagara.com", nombre: "Diego", apellido: "Rodríguez", rol: RolStaff.portero, password: "Niagara1234!" },
    { email: "rrpp@clubniagara.com", nombre: "Valeria", apellido: "López", rol: RolStaff.rrpp, password: "Niagara1234!" },
  ];

  for (const r of rolesExtra) {
    const u = await upsertAuthUser(r.email, r.password, `${r.nombre} ${r.apellido}`);

    await prisma.staff.upsert({
      where: { localId_userId: { localId: local.id, userId: u.id } },
      update: {},
      create: {
        localId: local.id,
        userId: u.id,
        nombre: r.nombre,
        apellido: r.apellido,
        email: r.email,
        rol: r.rol,
      },
    });
  }
  console.log("✓ Staff adicional: cajero, portero, rrpp");

  // ── Tarjetas cashless de demo ──────────────────────────────
  const tarjetasDemo = [
    { id: ID.tarjeta(1), codigo: "PULSERA-001", clienteNombre: "Juan Pérez", saldo: 5000 },
    { id: ID.tarjeta(2), codigo: "PULSERA-002", clienteNombre: "María García", saldo: 12000 },
    { id: ID.tarjeta(3), codigo: "PULSERA-003", clienteNombre: "Carlos López", saldo: 0 },
  ];

  for (const t of tarjetasDemo) {
    await prisma.tarjetaCashless.upsert({
      where: { id: t.id },
      update: {},
      create: {
        id: t.id,
        localId: local.id,
        codigo: t.codigo,
        clienteNombre: t.clienteNombre,
        saldo: t.saldo,
        activa: true,
      },
    });
  }
  console.log(`✓ Tarjetas cashless: ${tarjetasDemo.length} creadas`);
  console.log("   PULSERA-001 — $5.000 · PULSERA-002 — $12.000 · PULSERA-003 — $0");

  // ── Mesas VIP de demo ──────────────────────────────────────
  const mesasDemo = [
    { id: ID.mesa(1), numero: "1",  sector: "Terraza",  capacidad: 6,  posX: 20, posY: 25 },
    { id: ID.mesa(2), numero: "2",  sector: "Terraza",  capacidad: 6,  posX: 45, posY: 25 },
    { id: ID.mesa(3), numero: "3",  sector: "Terraza",  capacidad: 4,  posX: 70, posY: 25 },
    { id: ID.mesa(4), numero: "A1", sector: "Interior", capacidad: 8,  posX: 20, posY: 60 },
    { id: ID.mesa(5), numero: "A2", sector: "Interior", capacidad: 8,  posX: 45, posY: 60 },
    { id: ID.mesa(6), numero: "A3", sector: "Interior", capacidad: 10, posX: 70, posY: 60 },
  ];

  for (const m of mesasDemo) {
    await prisma.mesaVip.upsert({
      where: { id: m.id },
      update: {},
      create: {
        id: m.id,
        localId: local.id,
        numero: m.numero,
        sector: m.sector,
        capacidad: m.capacidad,
        posX: m.posX,
        posY: m.posY,
        estado: "libre",
      },
    });
  }
  console.log(`✓ Mesas VIP: ${mesasDemo.length} creadas (Terraza x3, Interior x3)`);

  console.log("\n✅ Seed completado. Usuarios de prueba:");
  console.log("   admin@clubniagara.com     / Admin1234!");
  console.log("   cajero@clubniagara.com    / Niagara1234!");
  console.log("   portero@clubniagara.com   / Niagara1234!");
  console.log("   rrpp@clubniagara.com      / Niagara1234!");
}

main()
  .catch((e) => {
    console.error("❌ Error en seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

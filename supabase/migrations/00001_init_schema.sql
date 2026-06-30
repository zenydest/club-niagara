-- ============================================================
-- Club Niágara — Migración 00001: Schema inicial
-- Crea todos los tipos, enums y tablas del sistema.
-- ============================================================

-- Extensiones necesarias
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

create type rol_staff as enum ('admin', 'encargado', 'cajero', 'portero', 'rrpp', 'barman');
create type estado_evento as enum ('borrador', 'preventa', 'en_vivo', 'cerrado', 'cancelado');
create type metodo_pago as enum ('efectivo', 'tarjeta', 'cashless', 'qr_mp', 'cortesia');
create type estado_sync as enum ('synced', 'pending', 'error');
create type tipo_movimiento_stock as enum ('ingreso', 'egreso_venta', 'egreso_merma', 'transferencia', 'ajuste');
create type tipo_entrada as enum ('general', 'vip', 'rrpp', 'invitado', 'staff');
create type estado_mesa as enum ('libre', 'reservada', 'ocupada', 'bloqueada');
create type estado_reserva as enum ('pendiente', 'confirmada', 'cancelada', 'completada');
create type tipo_acceso as enum ('ingreso', 'egreso');
create type metodo_acceso as enum ('manual', 'qr', 'cashless');

-- ============================================================
-- TABLA: locales (raíz multi-tenant)
-- ============================================================

create table locales (
  id          uuid primary key default uuid_generate_v4(),
  nombre      text not null,
  slug        text not null unique,
  direccion   text,
  ciudad      text,
  pais        char(2) not null default 'AR',
  moneda      char(3) not null default 'ARS',
  capacidad_maxima integer not null check (capacidad_maxima > 0),
  logo_url    text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table locales is 'Tenant raíz. Cada boliche/local es una fila.';

-- ============================================================
-- TABLA: staff (usuarios del sistema)
-- ============================================================

create table staff (
  id         uuid primary key default uuid_generate_v4(),
  local_id   uuid not null references locales(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  nombre     text not null,
  apellido   text not null,
  email      text not null,
  rol        rol_staff not null,
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (local_id, user_id)
);

comment on table staff is 'Personal del local con sus roles.';
create index idx_staff_local on staff(local_id);
create index idx_staff_user on staff(user_id);

-- ============================================================
-- TABLA: eventos
-- ============================================================

create table eventos (
  id           uuid primary key default uuid_generate_v4(),
  local_id     uuid not null references locales(id) on delete cascade,
  nombre       text not null,
  descripcion  text,
  fecha_inicio timestamptz not null,
  fecha_fin    timestamptz,
  capacidad    integer not null check (capacidad > 0),
  estado       estado_evento not null default 'borrador',
  imagen_url   text,
  aforo_actual integer not null default 0 check (aforo_actual >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table eventos is 'Eventos/fiestas del local.';
create index idx_eventos_local on eventos(local_id);
create index idx_eventos_estado on eventos(estado);
create index idx_eventos_fecha on eventos(fecha_inicio);

-- ============================================================
-- TABLA: barras (puntos de venta)
-- ============================================================

create table barras (
  id          uuid primary key default uuid_generate_v4(),
  local_id    uuid not null references locales(id) on delete cascade,
  nombre      text not null,
  descripcion text,
  activo      boolean not null default true
);

create index idx_barras_local on barras(local_id);

-- ============================================================
-- TABLA: productos
-- ============================================================

create table productos (
  id          uuid primary key default uuid_generate_v4(),
  local_id    uuid not null references locales(id) on delete cascade,
  nombre      text not null,
  descripcion text,
  categoria   text not null,
  precio      numeric(10,2) not null check (precio >= 0),
  costo       numeric(10,2) check (costo >= 0),
  imagen_url  text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table productos is 'Bebidas y productos vendibles.';
create index idx_productos_local on productos(local_id);
create index idx_productos_categoria on productos(local_id, categoria);

-- ============================================================
-- TABLA: depositos (stock)
-- ============================================================

create table depositos (
  id          uuid primary key default uuid_generate_v4(),
  local_id    uuid not null references locales(id) on delete cascade,
  nombre      text not null,
  es_principal boolean not null default false
);

create index idx_depositos_local on depositos(local_id);

-- ============================================================
-- TABLA: stock_movimientos
-- ============================================================

create table stock_movimientos (
  id               uuid primary key default uuid_generate_v4(),
  local_id         uuid not null references locales(id) on delete cascade,
  deposito_id      uuid not null references depositos(id),
  producto_id      uuid not null references productos(id),
  tipo             tipo_movimiento_stock not null,
  cantidad         numeric(10,2) not null,
  cantidad_anterior numeric(10,2) not null default 0,
  motivo           text,
  staff_id         uuid references staff(id),
  created_at       timestamptz not null default now(),
  synced           estado_sync not null default 'synced'
);

create index idx_stock_local on stock_movimientos(local_id);
create index idx_stock_producto on stock_movimientos(producto_id);
create index idx_stock_synced on stock_movimientos(synced) where synced != 'synced';

-- ============================================================
-- TABLA: ventas (transacciones — offline-first)
-- ============================================================

create table ventas (
  id          uuid primary key, -- UUID generado en el cliente
  local_id    uuid not null references locales(id) on delete cascade,
  evento_id   uuid references eventos(id),
  barra_id    uuid references barras(id),
  staff_id    uuid not null references staff(id),
  metodo_pago metodo_pago not null,
  total       numeric(10,2) not null check (total >= 0),
  descuento   numeric(10,2) not null default 0,
  nota        text,
  created_at  timestamptz not null, -- Timestamp del cliente (offline)
  synced      estado_sync not null default 'synced'
);

comment on table ventas is
  'id y created_at vienen del cliente para soportar offline-first. '
  'La resolución de conflictos usa last-write-wins por created_at.';

create index idx_ventas_local on ventas(local_id);
create index idx_ventas_evento on ventas(evento_id);
create index idx_ventas_staff on ventas(staff_id);
create index idx_ventas_created on ventas(created_at);
create index idx_ventas_synced on ventas(synced) where synced != 'synced';

-- ============================================================
-- TABLA: venta_items (líneas de venta)
-- ============================================================

create table venta_items (
  id              uuid primary key default uuid_generate_v4(),
  venta_id        uuid not null references ventas(id) on delete cascade,
  local_id        uuid not null references locales(id) on delete cascade,
  producto_id     uuid not null references productos(id),
  cantidad        integer not null check (cantidad > 0),
  precio_unitario numeric(10,2) not null check (precio_unitario >= 0),
  subtotal        numeric(10,2) not null check (subtotal >= 0)
);

create index idx_venta_items_venta on venta_items(venta_id);
create index idx_venta_items_local on venta_items(local_id);

-- ============================================================
-- TABLA: tarjetas_cashless
-- ============================================================

create table tarjetas_cashless (
  id             uuid primary key default uuid_generate_v4(),
  local_id       uuid not null references locales(id) on delete cascade,
  codigo         text not null,
  cliente_nombre text,
  cliente_email  text,
  saldo          numeric(10,2) not null default 0 check (saldo >= 0),
  activa         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (local_id, codigo)
);

create index idx_cashless_local on tarjetas_cashless(local_id);
create index idx_cashless_codigo on tarjetas_cashless(local_id, codigo);

-- ============================================================
-- TABLA: recargas (cashless — offline-first)
-- ============================================================

create table recargas (
  id            uuid primary key, -- UUID del cliente
  local_id      uuid not null references locales(id) on delete cascade,
  tarjeta_id    uuid not null references tarjetas_cashless(id),
  staff_id      uuid not null references staff(id),
  monto         numeric(10,2) not null check (monto > 0),
  metodo_pago   metodo_pago not null,
  mp_payment_id text,
  created_at    timestamptz not null,
  synced        estado_sync not null default 'synced'
);

create index idx_recargas_local on recargas(local_id);
create index idx_recargas_tarjeta on recargas(tarjeta_id);
create index idx_recargas_synced on recargas(synced) where synced != 'synced';

-- ============================================================
-- TABLA: accesos (portería — offline-first)
-- ============================================================

create table accesos (
  id                 uuid primary key, -- UUID del cliente
  local_id           uuid not null references locales(id) on delete cascade,
  evento_id          uuid not null references eventos(id),
  staff_id           uuid references staff(id),
  entrada_vendida_id uuid, -- FK a entradas_vendidas, nullable por accesos manuales
  tipo               tipo_acceso not null,
  metodo             metodo_acceso not null default 'manual',
  created_at         timestamptz not null,
  synced             estado_sync not null default 'synced'
);

comment on table accesos is
  'Registro de ingreso/egreso. Base del aforo en tiempo real. '
  'offline-first: la portería funciona sin internet.';

create index idx_accesos_local on accesos(local_id);
create index idx_accesos_evento on accesos(evento_id);
create index idx_accesos_created on accesos(created_at);
create index idx_accesos_synced on accesos(synced) where synced != 'synced';

-- ============================================================
-- TABLA: entradas_tipo
-- ============================================================

create table entradas_tipo (
  id              uuid primary key default uuid_generate_v4(),
  evento_id       uuid not null references eventos(id) on delete cascade,
  local_id        uuid not null references locales(id) on delete cascade,
  nombre          text not null,
  tipo            tipo_entrada not null,
  precio          numeric(10,2) not null check (precio >= 0),
  cantidad_total  integer,
  cantidad_vendida integer not null default 0 check (cantidad_vendida >= 0),
  activo          boolean not null default true
);

create index idx_entradas_tipo_evento on entradas_tipo(evento_id);

-- ============================================================
-- TABLA: entradas_vendidas (tickets con QR)
-- ============================================================

create table entradas_vendidas (
  id              uuid primary key default uuid_generate_v4(),
  local_id        uuid not null references locales(id) on delete cascade,
  evento_id       uuid not null references eventos(id),
  entrada_tipo_id uuid not null references entradas_tipo(id),
  qr_code         text not null unique default encode(gen_random_bytes(16), 'hex'),
  cliente_nombre  text,
  cliente_email   text,
  precio_pagado   numeric(10,2) not null check (precio_pagado >= 0),
  metodo_pago     metodo_pago not null,
  rrpp_id         uuid references staff(id),
  usada           boolean not null default false,
  created_at      timestamptz not null default now()
);

create index idx_entradas_evento on entradas_vendidas(evento_id);
create index idx_entradas_qr on entradas_vendidas(qr_code);
create index idx_entradas_rrpp on entradas_vendidas(rrpp_id);

-- ============================================================
-- TABLA: mesas_vip
-- ============================================================

create table mesas_vip (
  id        uuid primary key default uuid_generate_v4(),
  local_id  uuid not null references locales(id) on delete cascade,
  numero    text not null,
  sector    text,
  capacidad integer not null check (capacidad > 0),
  estado    estado_mesa not null default 'libre',
  evento_id uuid references eventos(id),
  pos_x     real,
  pos_y     real,
  unique (local_id, numero)
);

create index idx_mesas_local on mesas_vip(local_id);

-- ============================================================
-- TABLA: reservas
-- ============================================================

create table reservas (
  id                uuid primary key default uuid_generate_v4(),
  local_id          uuid not null references locales(id) on delete cascade,
  evento_id         uuid references eventos(id),
  mesa_vip_id       uuid references mesas_vip(id),
  cliente_nombre    text not null,
  cliente_email     text,
  cliente_telefono  text,
  cantidad_personas integer not null check (cantidad_personas > 0),
  estado            estado_reserva not null default 'pendiente',
  nota              text,
  monto_seña        numeric(10,2) check (monto_seña >= 0),
  created_at        timestamptz not null default now()
);

create index idx_reservas_local on reservas(local_id);
create index idx_reservas_evento on reservas(evento_id);

-- ============================================================
-- TABLA: guardarropa
-- ============================================================

create table guardarropa (
  id             uuid primary key default uuid_generate_v4(),
  local_id       uuid not null references locales(id) on delete cascade,
  evento_id      uuid references eventos(id),
  numero_ticket  integer not null,
  descripcion    text,
  entregado      boolean not null default false,
  cliente_nombre text,
  staff_id       uuid references staff(id),
  created_at     timestamptz not null default now(),
  unique (local_id, evento_id, numero_ticket)
);

create index idx_guardarropa_local on guardarropa(local_id);
create index idx_guardarropa_evento on guardarropa(evento_id);

-- ============================================================
-- TABLA: comisiones_rrpp
-- ============================================================

create table comisiones_rrpp (
  id                  uuid primary key default uuid_generate_v4(),
  local_id            uuid not null references locales(id) on delete cascade,
  staff_id            uuid not null references staff(id),
  evento_id           uuid not null references eventos(id),
  entradas_vendidas   integer not null default 0,
  monto_total_ventas  numeric(10,2) not null default 0,
  porcentaje_comision numeric(5,2) not null check (porcentaje_comision between 0 and 100),
  monto_comision      numeric(10,2) not null default 0,
  pagada              boolean not null default false,
  created_at          timestamptz not null default now(),
  unique (staff_id, evento_id)
);

create index idx_comisiones_local on comisiones_rrpp(local_id);
create index idx_comisiones_evento on comisiones_rrpp(evento_id);

-- ============================================================
-- TABLA: cortes_caja
-- ============================================================

create table cortes_caja (
  id                uuid primary key default uuid_generate_v4(),
  local_id          uuid not null references locales(id) on delete cascade,
  evento_id         uuid references eventos(id),
  staff_id          uuid not null references staff(id),
  barra_id          uuid references barras(id),
  efectivo_esperado numeric(10,2) not null default 0,
  efectivo_real     numeric(10,2),
  diferencia        numeric(10,2),
  ventas_efectivo   numeric(10,2) not null default 0,
  ventas_tarjeta    numeric(10,2) not null default 0,
  ventas_cashless   numeric(10,2) not null default 0,
  ventas_qr         numeric(10,2) not null default 0,
  ventas_cortesia   numeric(10,2) not null default 0,
  total_ventas      numeric(10,2) not null default 0,
  nota              text,
  cerrado_at        timestamptz,
  created_at        timestamptz not null default now()
);

create index idx_cortes_local on cortes_caja(local_id);
create index idx_cortes_evento on cortes_caja(evento_id);

-- ============================================================
-- FUNCIÓN: actualizar updated_at automáticamente
-- ============================================================

create or replace function trigger_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_locales
  before update on locales
  for each row execute function trigger_set_updated_at();

create trigger set_updated_at_eventos
  before update on eventos
  for each row execute function trigger_set_updated_at();

create trigger set_updated_at_cashless
  before update on tarjetas_cashless
  for each row execute function trigger_set_updated_at();

-- ============================================================
-- FUNCIÓN: actualizar aforo al insertar/eliminar accesos
-- ============================================================

create or replace function actualizar_aforo()
returns trigger language plpgsql security definer as $$
begin
  if (tg_op = 'INSERT') then
    if new.tipo = 'ingreso' then
      update eventos
      set aforo_actual = aforo_actual + 1
      where id = new.evento_id;
    elsif new.tipo = 'egreso' then
      update eventos
      set aforo_actual = greatest(aforo_actual - 1, 0)
      where id = new.evento_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_actualizar_aforo
  after insert on accesos
  for each row execute function actualizar_aforo();

-- ============================================================
-- FUNCIÓN: marcar entrada como usada al registrar acceso
-- ============================================================

create or replace function marcar_entrada_usada()
returns trigger language plpgsql security definer as $$
begin
  if new.entrada_vendida_id is not null and new.tipo = 'ingreso' then
    update entradas_vendidas
    set usada = true
    where id = new.entrada_vendida_id;
  end if;
  return new;
end;
$$;

create trigger trg_marcar_entrada_usada
  after insert on accesos
  for each row execute function marcar_entrada_usada();

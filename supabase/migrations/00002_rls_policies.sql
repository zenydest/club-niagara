-- ============================================================
-- Club Niágara — Migración 00002: Row Level Security (RLS)
-- Cada boliche ve solo sus propios datos.
-- ============================================================

-- ============================================================
-- FUNCIÓN AUXILIAR: obtener el local_id del usuario autenticado
-- ============================================================

create or replace function auth_local_id()
returns uuid language sql stable security definer as $$
  select local_id
  from staff
  where user_id = auth.uid()
    and activo = true
  limit 1;
$$;

comment on function auth_local_id() is
  'Retorna el local_id del staff autenticado. '
  'Usada en las políticas RLS para aislar datos por tenant.';

-- ============================================================
-- FUNCIÓN AUXILIAR: obtener el rol del usuario autenticado
-- ============================================================

create or replace function auth_rol()
returns rol_staff language sql stable security definer as $$
  select rol
  from staff
  where user_id = auth.uid()
    and activo = true
  limit 1;
$$;

-- ============================================================
-- HABILITAR RLS EN TODAS LAS TABLAS
-- ============================================================

alter table locales            enable row level security;
alter table staff              enable row level security;
alter table eventos            enable row level security;
alter table barras             enable row level security;
alter table productos          enable row level security;
alter table depositos          enable row level security;
alter table stock_movimientos  enable row level security;
alter table ventas             enable row level security;
alter table venta_items        enable row level security;
alter table tarjetas_cashless  enable row level security;
alter table recargas           enable row level security;
alter table accesos            enable row level security;
alter table entradas_tipo      enable row level security;
alter table entradas_vendidas  enable row level security;
alter table mesas_vip          enable row level security;
alter table reservas           enable row level security;
alter table guardarropa        enable row level security;
alter table comisiones_rrpp    enable row level security;
alter table cortes_caja        enable row level security;

-- ============================================================
-- POLÍTICAS: locales
-- Solo el admin puede ver y modificar su local
-- ============================================================

create policy "Ver propio local"
  on locales for select
  using (id = auth_local_id());

create policy "Admin puede actualizar su local"
  on locales for update
  using (id = auth_local_id() and auth_rol() = 'admin');

-- ============================================================
-- POLÍTICAS: staff
-- ============================================================

create policy "Ver staff del propio local"
  on staff for select
  using (local_id = auth_local_id());

create policy "Admin puede gestionar staff"
  on staff for all
  using (local_id = auth_local_id() and auth_rol() in ('admin', 'encargado'));

-- ============================================================
-- POLÍTICAS: eventos
-- ============================================================

create policy "Ver eventos del propio local"
  on eventos for select
  using (local_id = auth_local_id());

create policy "Admin/encargado puede gestionar eventos"
  on eventos for all
  using (local_id = auth_local_id() and auth_rol() in ('admin', 'encargado'));

-- ============================================================
-- POLÍTICAS: barras
-- ============================================================

create policy "Ver barras del propio local"
  on barras for select
  using (local_id = auth_local_id());

create policy "Admin puede gestionar barras"
  on barras for all
  using (local_id = auth_local_id() and auth_rol() in ('admin', 'encargado'));

-- ============================================================
-- POLÍTICAS: productos
-- ============================================================

create policy "Ver productos del propio local"
  on productos for select
  using (local_id = auth_local_id());

create policy "Admin/cajero puede gestionar productos"
  on productos for all
  using (local_id = auth_local_id() and auth_rol() in ('admin', 'encargado'));

-- ============================================================
-- POLÍTICAS: depositos
-- ============================================================

create policy "Ver depositos del propio local"
  on depositos for select
  using (local_id = auth_local_id());

create policy "Admin puede gestionar depositos"
  on depositos for all
  using (local_id = auth_local_id() and auth_rol() in ('admin', 'encargado'));

-- ============================================================
-- POLÍTICAS: stock_movimientos
-- ============================================================

create policy "Ver stock del propio local"
  on stock_movimientos for select
  using (local_id = auth_local_id());

create policy "Staff puede registrar movimientos de stock"
  on stock_movimientos for insert
  with check (local_id = auth_local_id());

-- ============================================================
-- POLÍTICAS: ventas (offline-first — puede venir del cliente)
-- ============================================================

create policy "Ver ventas del propio local"
  on ventas for select
  using (local_id = auth_local_id());

create policy "Staff puede registrar ventas"
  on ventas for insert
  with check (
    local_id = auth_local_id()
    and auth_rol() in ('admin', 'encargado', 'cajero', 'barman')
  );

create policy "Admin puede actualizar ventas"
  on ventas for update
  using (local_id = auth_local_id() and auth_rol() in ('admin', 'encargado'));

-- ============================================================
-- POLÍTICAS: venta_items
-- ============================================================

create policy "Ver items de venta del propio local"
  on venta_items for select
  using (local_id = auth_local_id());

create policy "Staff puede insertar items de venta"
  on venta_items for insert
  with check (
    local_id = auth_local_id()
    and auth_rol() in ('admin', 'encargado', 'cajero', 'barman')
  );

-- ============================================================
-- POLÍTICAS: tarjetas_cashless
-- ============================================================

create policy "Ver tarjetas cashless del propio local"
  on tarjetas_cashless for select
  using (local_id = auth_local_id());

create policy "Staff puede gestionar tarjetas cashless"
  on tarjetas_cashless for all
  using (
    local_id = auth_local_id()
    and auth_rol() in ('admin', 'encargado', 'cajero')
  );

-- ============================================================
-- POLÍTICAS: recargas
-- ============================================================

create policy "Ver recargas del propio local"
  on recargas for select
  using (local_id = auth_local_id());

create policy "Staff puede registrar recargas"
  on recargas for insert
  with check (
    local_id = auth_local_id()
    and auth_rol() in ('admin', 'encargado', 'cajero')
  );

-- ============================================================
-- POLÍTICAS: accesos (portería)
-- ============================================================

create policy "Ver accesos del propio local"
  on accesos for select
  using (local_id = auth_local_id());

create policy "Portero/encargado puede registrar accesos"
  on accesos for insert
  with check (
    local_id = auth_local_id()
    and auth_rol() in ('admin', 'encargado', 'portero')
  );

-- ============================================================
-- POLÍTICAS: entradas_tipo
-- ============================================================

create policy "Ver tipos de entrada del propio local"
  on entradas_tipo for select
  using (local_id = auth_local_id());

create policy "Admin puede gestionar tipos de entrada"
  on entradas_tipo for all
  using (local_id = auth_local_id() and auth_rol() in ('admin', 'encargado'));

-- ============================================================
-- POLÍTICAS: entradas_vendidas
-- ============================================================

create policy "Ver entradas vendidas del propio local"
  on entradas_vendidas for select
  using (local_id = auth_local_id());

create policy "Staff puede vender entradas"
  on entradas_vendidas for insert
  with check (
    local_id = auth_local_id()
    and auth_rol() in ('admin', 'encargado', 'cajero', 'rrpp')
  );

create policy "Portero puede marcar entrada como usada"
  on entradas_vendidas for update
  using (
    local_id = auth_local_id()
    and auth_rol() in ('admin', 'encargado', 'portero')
  );

-- ============================================================
-- POLÍTICAS: mesas_vip
-- ============================================================

create policy "Ver mesas VIP del propio local"
  on mesas_vip for select
  using (local_id = auth_local_id());

create policy "Admin puede gestionar mesas VIP"
  on mesas_vip for all
  using (local_id = auth_local_id() and auth_rol() in ('admin', 'encargado'));

-- ============================================================
-- POLÍTICAS: reservas
-- ============================================================

create policy "Ver reservas del propio local"
  on reservas for select
  using (local_id = auth_local_id());

create policy "Staff puede gestionar reservas"
  on reservas for all
  using (
    local_id = auth_local_id()
    and auth_rol() in ('admin', 'encargado', 'rrpp')
  );

-- ============================================================
-- POLÍTICAS: guardarropa
-- ============================================================

create policy "Ver guardarropa del propio local"
  on guardarropa for select
  using (local_id = auth_local_id());

create policy "Staff puede gestionar guardarropa"
  on guardarropa for all
  using (local_id = auth_local_id());

-- ============================================================
-- POLÍTICAS: comisiones_rrpp
-- ============================================================

create policy "Ver comisiones del propio local"
  on comisiones_rrpp for select
  using (local_id = auth_local_id());

create policy "Admin puede gestionar comisiones"
  on comisiones_rrpp for all
  using (local_id = auth_local_id() and auth_rol() in ('admin', 'encargado'));

-- ============================================================
-- POLÍTICAS: cortes_caja
-- ============================================================

create policy "Ver cortes del propio local"
  on cortes_caja for select
  using (local_id = auth_local_id());

create policy "Cajero puede crear corte de caja"
  on cortes_caja for insert
  with check (
    local_id = auth_local_id()
    and auth_rol() in ('admin', 'encargado', 'cajero')
  );

create policy "Admin puede actualizar cortes"
  on cortes_caja for update
  using (local_id = auth_local_id() and auth_rol() in ('admin', 'encargado'));

-- ============================================================
-- Club Niágara — Seeds de desarrollo
-- Datos de prueba para arrancar rápido.
-- SOLO para ambiente local/dev. NO aplicar en producción.
-- ============================================================

-- Nota: Este seed asume que ya existe un usuario en auth.users
-- con el email admin@clubniagara.com. Crealo primero en Supabase Auth
-- o via: supabase auth create --email admin@clubniagara.com --password Admin1234!

-- Local de prueba
insert into locales (id, nombre, slug, ciudad, capacidad_maxima, moneda)
values (
  '00000000-0000-0000-0000-000000000001',
  'Club Niágara',
  'club-niagara',
  'Buenos Aires',
  500,
  'ARS'
) on conflict (slug) do nothing;

-- Barras
insert into barras (id, local_id, nombre)
values
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 'Barra Principal'),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 'Barra VIP')
on conflict do nothing;

-- Depósito principal
insert into depositos (id, local_id, nombre, es_principal)
values (
  '00000000-0000-0000-0002-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Depósito Principal',
  true
) on conflict do nothing;

-- Productos de prueba
insert into productos (local_id, nombre, categoria, precio, costo)
values
  ('00000000-0000-0000-0000-000000000001', 'Cerveza Quilmes 1L', 'Cervezas', 2500, 1200),
  ('00000000-0000-0000-0000-000000000001', 'Fernet con Coca', 'Tragos', 3500, 1500),
  ('00000000-0000-0000-0000-000000000001', 'Agua Mineral', 'Sin Alcohol', 800, 200),
  ('00000000-0000-0000-0000-000000000001', 'Coca-Cola 500ml', 'Sin Alcohol', 1200, 400),
  ('00000000-0000-0000-0000-000000000001', 'Whisky Jack Daniels', 'Destilados', 5000, 2500),
  ('00000000-0000-0000-0000-000000000001', 'Shot de Vodka', 'Shots', 1500, 600),
  ('00000000-0000-0000-0000-000000000001', 'Campari Spritz', 'Tragos', 3000, 1200),
  ('00000000-0000-0000-0000-000000000001', 'Red Bull', 'Energizantes', 2000, 900)
on conflict do nothing;

-- Evento de prueba
insert into eventos (id, local_id, nombre, fecha_inicio, capacidad, estado, aforo_actual)
values (
  '00000000-0000-0000-0003-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Viernes Electrónico',
  now() + interval '1 day',
  500,
  'en_vivo',
  0
) on conflict do nothing;

-- Tipos de entrada del evento
insert into entradas_tipo (evento_id, local_id, nombre, tipo, precio, cantidad_total)
values
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 'General', 'general', 5000, 400),
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 'VIP Mesa', 'vip', 15000, 50),
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 'RRPP Lista', 'rrpp', 0, null)
on conflict do nothing;

-- Mesas VIP
insert into mesas_vip (local_id, numero, sector, capacidad, estado, pos_x, pos_y)
values
  ('00000000-0000-0000-0000-000000000001', '1', 'VIP A', 8, 'libre', 10, 10),
  ('00000000-0000-0000-0000-000000000001', '2', 'VIP A', 6, 'libre', 25, 10),
  ('00000000-0000-0000-0000-000000000001', '3', 'VIP B', 10, 'libre', 10, 35),
  ('00000000-0000-0000-0000-000000000001', '4', 'VIP B', 8, 'libre', 25, 35),
  ('00000000-0000-0000-0000-000000000001', 'S1', 'Sofás', 15, 'libre', 50, 20)
on conflict do nothing;

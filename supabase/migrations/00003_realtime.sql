-- ============================================================
-- Club Niágara — Migración 00003: Publicaciones Realtime
-- Habilita las tablas que necesitan actualización en vivo.
-- ============================================================

-- Publicación para el dashboard en tiempo real
-- (aforo, ventas, accesos)
alter publication supabase_realtime add table accesos;
alter publication supabase_realtime add table ventas;
alter publication supabase_realtime add table eventos;
alter publication supabase_realtime add table tarjetas_cashless;
alter publication supabase_realtime add table stock_movimientos;
alter publication supabase_realtime add table mesas_vip;
alter publication supabase_realtime add table reservas;

-- Nota: La publicación supabase_realtime ya existe en Supabase.
-- Solo agregamos las tablas que necesitan sync en tiempo real.
-- Las tablas que NO necesitan realtime (como guardarropa, cortes_caja)
-- no se incluyen para no sobrecargar la conexión websocket.

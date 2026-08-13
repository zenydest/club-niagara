# Base de datos — backup y migración

## Backup automático

Hay un workflow (`.github/workflows/backup.yml`) que hace un dump diario a las
09:00 de Argentina y lo guarda 90 días como artifact del run.

### Activarlo

1. En Render, servicio de Postgres, copiar la **External Database URL**. La
   interna (`dpg-...` sin dominio) solo funciona dentro de la red de Render y
   desde GitHub no resuelve.
2. En GitHub: **Settings → Secrets and variables → Actions → New repository
   secret**.
   - Name: `DATABASE_URL_BACKUP`
   - Secret: la URL externa
3. Pestaña **Actions → Backup DB → Run workflow** para probarlo sin esperar al
   día siguiente.

Si el dump pesa menos de 1 KB el workflow falla a propósito: un dump vacío que
se guarda en silencio es peor que no tener backup, porque da falsa tranquilidad.

### Bajar un backup

Actions → el run que corresponda → sección **Artifacts** → descargar el `.dump`.

### Restaurar

```bash
# Base nueva y vacía
pg_restore --clean --if-exists -d "postgresql://usuario:pass@host/base" niagara-2026-08-07.dump
```

> Probá una restauración **antes** de necesitarla. Un backup que nunca se
> restauró no es un backup: es un archivo.

---

## Migrar a otro proveedor

La base de Render en plan free **se borra sola** a los 30 días. Hay que mover
los datos antes de esa fecha.

### Opciones

| Dónde | Costo | Nota |
|-------|-------|------|
| Render Postgres pago | Mensual | Lo más simple: no cambia nada más del deploy |
| Neon | Free con límites | Postgres serverless, se duerme por inactividad |
| Supabase | Free con límites | Postgres + panel de administración |
| Railway | Por uso | Sin capa gratuita permanente |

Para un boliche con una base chica, cualquiera sirve. Lo que importa es que
**no expire**.

### Pasos

1. **Backup primero.** Actions → Backup DB → Run workflow. Bajá el `.dump` y
   guardalo fuera de GitHub.

2. **Crear la base nueva** en el proveedor elegido. Anotar su connection string.

3. **Restaurar:**

   ```bash
   pg_restore --clean --if-exists -d "<URL_NUEVA>" niagara-AAAA-MM-DD.dump
   ```

4. **Verificar que los datos estén.** Conectarse y contar:

   ```sql
   SELECT
     (SELECT count(*) FROM ventas)             AS ventas,
     (SELECT count(*) FROM entradas_vendidas)  AS entradas,
     (SELECT count(*) FROM staff)              AS staff,
     (SELECT count(*) FROM productos)          AS productos;
   ```

   Los números tienen que coincidir con los de la base vieja. Correr la misma
   consulta en las dos y comparar.

5. **Cambiar `DATABASE_URL`** en Render (servicio de la API) por la nueva.

6. **Redeployar** y probar: iniciar sesión, abrir Reportes, ver que las ventas
   históricas estén.

7. **Actualizar `DATABASE_URL_BACKUP`** en los secrets de GitHub, o los backups
   siguen apuntando a la base vieja.

8. Recién ahí dar de baja la base vieja.

### Cuándo hacerlo

Un día de semana, con el local cerrado. Nunca antes de una noche de evento: si
algo sale mal, la caja no puede vender.

Durante la migración el sistema queda fuera de servicio unos minutos.

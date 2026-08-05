# Estado para producción — Club Niágara

> Evaluación al pasar de "demo para mostrar" a "el boliche lo usa en una noche real".
> Ordenado por riesgo, no por esfuerzo.

## Resumen

El sistema funciona de punta a punta, pero hay **cuatro cosas que hay que
resolver antes de la primera noche real**. Ninguna es de código: son de
infraestructura y configuración. Las cuatro tienen en común que fallan en
silencio — no vas a enterarte hasta que sea tarde.

---

## 🔴 Bloqueantes

### 1. La base de datos se borra el 28 de agosto

Render elimina las bases free a los 30 días de creadas. **Sin migración, sin
aviso previo, sin recuperación.** Si el boliche opera una noche y la base vence
al día siguiente, se pierden las ventas, las entradas emitidas y los clientes
registrados.

**Qué hacer:** pasar la base a un plan pago de Render, o migrar a Neon (free sin
vencimiento). La migración es cambiar el `DATABASE_URL` — Prisma no distingue el
proveedor.

### 2. `MP_WEBHOOK_SECRET` sin configurar

El endpoint `/api/point/webhook` acepta notificaciones de **cualquier origen**.
Alguien que conozca la URL puede marcar cobros como aprobados sin haber pagado.

El código ya valida la firma; solo falta cargar la variable en Render. Hasta
entonces, el propio panel lo muestra en amarillo en *Terminales*.

**Qué hacer:** panel de MP → Webhooks → copiar la clave secreta → cargarla en
Render → redeploy.

### 3. La API se apaga a los 15 minutos

En el plan free, tras 15 minutos sin tráfico el servicio se duerme y el
siguiente request tarda **30 a 60 segundos**. En una puerta con fila, o en la
barra cobrando, eso es inoperable: el portero va a pensar que se colgó y va a
pasar al modo manual, que no valida nada.

**Qué hacer:** subir la API al plan Starter. Es el gasto que más impacto tiene.

### 4. Sin backups

No hay respaldo configurado. Un error de operación, un `db push` mal aplicado o
una baja del proveedor se llevan todo.

**Qué hacer:** activar backups automáticos (viene con los planes pagos de Render
y de Neon) y probar **una restauración** antes de la primera noche. Un backup
que nunca se restauró no es un backup.

---

## 🟠 Importantes antes de operar de verdad

### 5. Cero visibilidad de errores

Si algo falla a las 3 de la mañana, nadie se entera. Los logs de Render se ven
solo si alguien los mira, y el free los retiene poco tiempo.

**Qué hacer:** Sentry tiene free tier y se integra en un rato. Con eso, un error
en la caja te llega al mail en vez de descubrirlo por el reclamo del cliente.

### 6. `prisma db push` en vez de migraciones

No hay historial ni rollback. Y como `preDeployCommand` no corre en el plan
free, hoy el schema se aplica **a mano** desde una terminal. Con datos reales,
un `db push` mal hecho puede borrar columnas.

**Qué hacer:** pasar a `prisma migrate`, versionar la carpeta `migrations/`
(hoy está en el `.gitignore`) y sacarle el `--force-reset` al vocabulario.

### 7. Sin tests

Un solo archivo de tests en todo el repo, y no cubre nada de lo que mueve plata:
cobros, quemado de QR, cupos, corte de caja.

**Qué hacer:** empezar por los caminos de dinero. No hace falta cobertura total;
alcanza con que un cambio futuro no rompa el cobro en silencio.

### 8. `main` sin proteger

El CI existe pero no bloquea nada. Ya vimos adónde lleva: llegó a `main` un POS
que no compilaba y una API sin `strict`.

**Qué hacer:** en GitHub, exigir que el CI pase para poder mergear.

---

## 🟡 Deuda conocida

- **Pago online a medias.** El botón *Pagar ahora* existe en la app pero la API
  todavía no genera el link de Checkout Pro. Hoy avisa y ofrece reservar.
- **`GET /api/stock/nivel` devuelve 500.** Detectado y nunca investigado.
- **Turbo roto en la máquina de desarrollo.** Se trabaja con `pnpm -r run`.
- **Dos versiones de React en el monorepo** (18 en web/pos/ui, 19 en mobile).
  Funciona por un parche en la resolución de Metro; la solución de fondo es
  unificar.
- **Prisma 5.22 con 7.x disponible.** Dos majors de atraso.
- **Imágenes por URL**, sin subida de archivos.
- **El escaneo de QR no funciona sin conexión.** Es inevitable —no se puede
  saber si una entrada ya se usó sin consultar— pero implica que el modo manual
  es el plan B, y ese modo no valida nada.

---

## Costo estimado

Los tres bloqueantes de infraestructura se resuelven con unos dólares al mes:

| Recurso | Plan | Por qué |
|---|---|---|
| API en Render | Starter | Sin apagados ni esperas de un minuto |
| Postgres | Starter o Neon | Sin vencimiento y con backups |
| Sentry | Free | Alcanza de sobra para este volumen |
| Vercel | Free | Suficiente para el panel |

Es la diferencia entre un sistema que se puede usar una noche y uno del que
depende la caja del local.

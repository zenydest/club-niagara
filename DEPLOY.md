# Deploy — Club Niágara / NOXA

Arquitectura de producción:

| Recurso | Proveedor | Config |
|---------|-----------|--------|
| API (Fastify + Prisma + Socket.io) | Render (web service Node) | `render.yaml` |
| Base de datos PostgreSQL | Render (o cualquier Postgres) | `DATABASE_URL` |
| Web admin (Vite SPA) | Vercel | `vercel.json` |
| Caja POS (Vite SPA) | Vercel, proyecto aparte | ver sección 4 |
| App cliente (Expo) | EAS Build | `apps/mobile/eas.json` |

> El schema se sincroniza con `prisma db push` (no hay carpeta `migrations/`). El `render.yaml` ya corre `db push` en `preDeployCommand`.

---

## 0. Antes de empezar

**Verificá que todo compile en local.** Vercel y Render van a correr lo mismo,
y fallar allá cuesta mucho más tiempo que fallar acá:

```bash
pnpm install
pnpm --filter @niagara/db db:generate
pnpm type-check
pnpm lint
pnpm build
```

### Dos límites del plan free de Render que conviene saber antes

- **El servicio se apaga tras 15 minutos sin tráfico.** El primer request
  después tarda 30-60 segundos. Si vas a mostrarle la app a un cliente, eso se
  ve como si estuviera rota. Para una demo, subí la API al plan **Starter**.
- **La base de datos free expira a los 30 días** de creada, con un período de
  gracia antes de que se borren los datos. Si el proyecto va a durar más que
  eso, pasala a un plan pago desde el principio para no tener que migrar datos
  después.

---

## 1. API + base de datos (Render)

Desde el dashboard de Render: **New → Blueprint** y apuntá al repo. El
`render.yaml` crea el web service de la API. Creá también una base
**PostgreSQL** en Render (o usá una existente).

Variables de entorno a completar en Render → *Environment* (todas marcadas `sync: false`):

| Variable | Obligatoria | Valor |
|----------|-------------|-------|
| `DATABASE_URL` | Sí | Connection string de tu Postgres de Render (Internal URL) |
| `BETTER_AUTH_SECRET` | Sí | Generá uno: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Sí | `https://club-niagara-api.onrender.com` (tu dominio real de la API) |
| `FRONTEND_URLS` | Sí | Dominios del front separados por coma, ej: `https://club-niagara.vercel.app` |
| `MP_ACCESS_TOKEN` | No | Access token de Mercado Pago. Sin esto, el cobro con terminales Point queda deshabilitado y el resto funciona igual |
| `MP_WEBHOOK_SECRET` | No* | Clave secreta del webhook de MP. *Obligatoria antes de cobrar de verdad: sin ella el endpoint acepta notificaciones de cualquier origen |

> **`BETTER_AUTH_SECRET` no es opcional.** Si falta, la API **no arranca** en
> producción, y es a propósito: antes caía en un secreto de desarrollo que está
> en el repo, lo que permitía a cualquiera fabricar una sesión de admin.

`NODE_ENV`, `PORT` y `HOST` ya vienen fijados en el `render.yaml`.

Flujo de un deploy: `pnpm install` → `prisma generate` → build de core/db/api →
**`prisma db push`** (crea/actualiza tablas) → `node apps/api/dist/index.js`.
El health check pega a `/health`.

### Seed inicial (primer deploy)

Con la base ya creada, cargá el local + admin corriendo el seed contra la DB de producción:

```bash
# PowerShell (Windows)
$env:DATABASE_URL="postgresql://...la External URL de Render..."
pnpm --filter @niagara/db db:seed
```

Sin este paso no hay ningún usuario y no vas a poder entrar al panel.

---

## 2. Verificar la API antes de seguir

```bash
curl https://club-niagara-api.onrender.com/health
# → {"status":"ok","ts":"..."}
```

Si responde, la base está conectada y el schema aplicado. Si el servicio no
levanta, mirá los logs en Render: el error más común es `BETTER_AUTH_SECRET`
faltante, que ahora falla con un mensaje explícito.

---

## 3. Web admin (Vercel)

Importá el repo en Vercel. Con `vercel.json` en la raíz ya quedan definidos
build (`pnpm turbo build --filter=@niagara/web`), output (`apps/web/dist`),
rewrites de SPA y headers de seguridad. Dejá **Root Directory = raíz del repo**.

Variable de entorno en Vercel → *Settings → Environment Variables*:

| Variable | Valor |
|----------|-------|
| `VITE_API_URL` | `https://club-niagara-api.onrender.com` |

> Después de conocer el dominio final de Vercel, actualizá `FRONTEND_URLS` en la
> API y volvé a deployar la API. **El login no va a funcionar hasta que hagas
> esto**: CORS y las cookies cross-site dependen de esa lista.

---

## 4. Caja POS (Vercel, proyecto aparte)

El `vercel.json` de la raíz solo compila la web, así que el POS necesita **un
segundo proyecto de Vercel apuntando al mismo repo**. En la configuración del
proyecto, sobrescribí:

| Campo | Valor |
|-------|-------|
| Build Command | `pnpm turbo build --filter=@niagara/pos` |
| Output Directory | `apps/pos/dist` |
| Install Command | `pnpm install --frozen-lockfile` |
| Root Directory | raíz del repo |

Variables: `VITE_API_URL` igual que la web.

Acordate de sumar el dominio del POS a `FRONTEND_URLS` en la API.

Alternativa: empaquetarlo como Electron con
`pnpm --filter @niagara/pos build:electron` y distribuir el `.exe`.

---

## 5. App cliente (EAS)

```bash
cd apps/mobile
cp .env.example .env          # trae EXPO_PUBLIC_LOCAL_ID real
npm i -g eas-cli              # si no lo tenés
eas login

# APK interno para probar
eas build -p android --profile preview

# Build de producción
eas build -p android --profile production
eas build -p ios --profile production
```

Los perfiles `preview` y `production` de `eas.json` ya inyectan
`EXPO_PUBLIC_API_URL` y `EXPO_PUBLIC_LOCAL_ID`. El `projectId` de EAS está en
`app.json → extra.eas`.

---

## Orden recomendado

1. Correr `pnpm build` en local y que pase.
2. Crear Postgres en Render → obtener `DATABASE_URL`.
3. Deploy de la API (Blueprint) → cargar secretos → el `db push` crea las tablas.
4. Correr el seed contra la DB de producción.
5. Verificar `/health`.
6. Deploy de la web en Vercel con `VITE_API_URL`.
7. Actualizar `FRONTEND_URLS` en la API con el dominio real de Vercel y redeployar.
8. (Opcional) Proyecto aparte para el POS.
9. (Opcional) Build del móvil con EAS.

## Checklist de verificación post-deploy

- [ ] `GET https://<api>/health` responde `{ "status": "ok" }`.
- [ ] Login de staff desde la web funciona (cookie de sesión cross-site).
- [ ] La web carga datos (no hay errores CORS en consola).
- [ ] El dashboard actualiza en vivo (Socket.io conectado, sin errores de websocket).
- [ ] Si cargaste MP: *Terminales* muestra el panel de diagnóstico sin alertas rojas.
- [ ] La app móvil (build preview) hace login y lista eventos.

## Configurar Mercado Pago más adelante

Todo el cobro con Point funciona sin tocar código: alcanza con cargar
`MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` en Render y redeployar. Después, desde
el panel:

1. Vincular cada terminal a la cuenta de MP desde la app del celular.
2. Ir a **Terminales → Sincronizar con Mercado Pago**.
3. Ponerle alias a cada una y asignarla a su barra.
4. **Activar PDV** y después **reiniciar la terminal** — el cambio de modo no
   toma efecto hasta reiniciarla.
5. En el panel de MP, configurar la URL del webhook:
   `https://<api>/api/point/webhook`

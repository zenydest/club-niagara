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
| `CLOUDINARY_URL` | No | Para subir portadas de eventos desde la computadora. Se copia de Cloudinary → Settings → API Keys, con el formato `cloudinary://KEY:SECRET@CLOUD`. Sin esto solo se puede pegar una URL de imagen |

> **`BETTER_AUTH_SECRET` no es opcional.** Si falta, la API **no arranca** en
> producción, y es a propósito: antes caía en un secreto de desarrollo que está
> en el repo, lo que permitía a cualquiera fabricar una sesión de admin.

`NODE_ENV`, `PORT` y `HOST` ya vienen fijados en el `render.yaml`.

Flujo de un deploy: `pnpm install` → `prisma generate` → build de core/db/api →
**`prisma db push`** (crea/actualiza tablas) → `node apps/api/dist/index.js`.
El health check pega a `/health`.

### Crear las tablas (obligatorio con el plan free)

**`preDeployCommand` solo funciona en instancias pagas.** Con el plan free
Render lo ignora sin avisar: el deploy sale verde, la API arranca, y todas las
queries fallan con `The table public.X does not exist`.

Así que mientras la API esté en free, el `db push` va a mano después de crear o
cambiar la base, usando la **External URL**:

```bash
$env:DATABASE_URL="postgresql://...External URL de Render..."
pnpm --filter @niagara/db exec prisma db push
```

Hay que repetirlo cada vez que cambie el schema de Prisma.

### Seed inicial

Con las tablas ya creadas, cargá el local + admin:

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

### Actualizaciones por aire (EAS Update)

Los cambios que son **solo de JavaScript** —pantallas, colores, textos, lógica—
no necesitan un build nuevo:

```bash
cd apps/mobile
eas update --branch preview --message "Qué cambió"
```

Tarda segundos, no consume cuota de builds, y le llega al usuario la próxima vez
que abre la app.

**Necesitan `eas build`, no update:** agregar o quitar cualquier dependencia
nativa (`expo-*`, `react-native-*`), tocar el ícono, el splash, los permisos o
el `app.json`.

#### La regla del `runtimeVersion`

En `app.json` está fijo como un string:

```json
"runtimeVersion": "1.0.0"
```

Un update solo se aplica a builds con **ese mismo valor**.

> **Cuando cambies algo nativo, subí el `runtimeVersion` antes de buildear.**
> Si no lo hacés, un update de JS puede caer sobre un APK viejo que no tiene el
> módulo nativo nuevo, y la app va a crashear en el celular del cliente.

Ejemplo: agregás `expo-camera` → `runtimeVersion` pasa a `"1.1.0"` → prebuild →
build. Los APK en `1.0.0` dejan de recibir updates, que es exactamente lo que se
busca.

Después de cambiarlo hay que correr `npx expo prebuild --platform android`: el
valor se escribe en los recursos nativos, y `expo-updates` lo lee de ahí.

#### Por qué es un valor fijo y no una política

Las políticas (`appVersion`, `fingerprint`) **no se soportan en bare workflow**,
y este proyecto lo es porque versiona la carpeta `android/`. EAS lo rechaza con
*"runtime version policies are not supported"*.

Y aunque se soportaran, `fingerprint` tampoco serviría: hashea rutas de archivos
y pnpm trunca los nombres de directorio en Windows por el límite de 260
caracteres, así que el hash local nunca coincide con el de EAS (Linux):

```
Local (Windows):  .pnpm/expo@54.0.36_@babel+core@7._86e641faf.../
EAS (Linux):      .pnpm/expo@54.0.36_@babel+core@7.29.7_@expo+metro-runtime@4.0.1_..._86e641faf.../
```

El costo de tenerlo fijo es acordarse de subirlo. La ventaja es que es
predecible y no depende del sistema operativo de quien buildea.

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

## Configurar Cloudinary (portadas de eventos)

Sirve para que el encargado suba la portada desde su computadora en vez de
tener que subirla a otro lado y pegar el link. Es opcional: sin configurar,
el panel deja la pestaña *Subir archivo* desactivada y funciona con URL.

1. Crear una cuenta en [cloudinary.com](https://cloudinary.com).
2. Ir a **Settings → API Keys** y generar una key para el sistema.
3. Copiar la línea `CLOUDINARY_URL=cloudinary://KEY:SECRET@CLOUD`, sustituyendo
   los placeholders por la key y el secret **de la misma fila** de la tabla.
4. En Render → servicio de la API → **Environment**, cargar `CLOUDINARY_URL`.
5. Redeployar.

> Si en vez de la URL se cargan las tres variables sueltas, hay que asegurarse
> de que la key y el secret sean del mismo par. Cada key de la tabla tiene su
> propio secret, y el que muestra el dashboard principal es el de la key `Root`.
> Mezclarlos hace fallar la subida con `Invalid Signature`, un error que apunta
> a la firma cuando el problema son las credenciales.

El **API secret no se comparte por chat ni queda en el repo**: se pega directo
en el panel de Render. Con ese secreto se puede subir y borrar cualquier cosa
de la cuenta.

Cómo funciona: el navegador le pide una firma a la API, achica la imagen a
1200×675 y la manda directo a Cloudinary. Los archivos nunca pasan por Render
—que en plan free tiene poca memoria— y el secreto nunca sale del servidor.

Las imágenes quedan en la carpeta `club-niagara/eventos`.

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

# Club Niágara / NOXA — Sistema de gestión para boliches

> Cloud-first · Offline-first · Tiempo real · Multi-tenant

Sistema de gestión para boliches/discotecas: control de aforo, caja/POS, cashless,
boletería, VIP, reportes y app para el cliente final. La caja vende aunque se corte
internet y sincroniza sola al volver.

## Monorepo

Turborepo + pnpm, todo en TypeScript estricto.

| Paquete | Descripción |
|---------|-------------|
| `apps/api` | Backend — Fastify + Prisma + PostgreSQL + Better Auth + Socket.io (tiempo real) |
| `apps/web` | Panel admin — React 18 + Vite + TanStack Router/Query + Zustand (+ Electron) |
| `apps/pos` | Caja POS offline-first — React + Vite + SQLite/IndexedDB (`idb`) + cola de sync |
| `apps/mobile` | App del cliente final — Expo (React Native) + expo-router + NativeWind |
| `packages/core` | Tipos + schemas Zod + constantes compartidas |
| `packages/db` | Cliente Prisma + schema (PostgreSQL) |
| `packages/ui` | Design system (tema oscuro de boliche) |
| `packages/config` | TS config, ESLint y Tailwind preset compartidos |

> Nota de arquitectura: el proyecto arrancó pensando en Supabase pero migró a
> **Fastify + Prisma + PostgreSQL (Render)** con **Better Auth**. La sincronización
> en tiempo real es vía **Socket.io**, y el offline de la caja usa **IndexedDB (`idb`)**
> con una cola de sync propia.

## Diseño

Tema oscuro de boliche: fondo casi negro `#08080F`, acento verde lima `#C2FF00` y
púrpura `#7B3FFF`. KPIs grandes, mobile-first, legible en penumbra. Los tokens viven
en `packages/core` (`NIAGARA_COLORS`) y en los presets de Tailwind.

## Requisitos

- Node.js ≥ 20
- pnpm ≥ 10 (`corepack enable`)
- PostgreSQL (local o Render)

## Setup

```bash
pnpm install

# Variables de entorno (ver .env.example en la raíz y en cada app)
cp .env.example apps/api/.env      # DATABASE_URL, BETTER_AUTH_*, FRONTEND_URLS, MP_ACCESS_TOKEN
cp apps/web/.env.example apps/web/.env      # VITE_API_URL
cp apps/pos/.env.example apps/pos/.env      # VITE_API_URL
cp apps/mobile/.env.example apps/mobile/.env  # EXPO_PUBLIC_API_URL, EXPO_PUBLIC_LOCAL_ID

# Base de datos: generar cliente + sincronizar schema + seed
pnpm --filter @niagara/db db:generate
pnpm --filter @niagara/db db:push
pnpm --filter @niagara/db db:seed
```

## Desarrollo

```bash
pnpm dev            # todo el monorepo
pnpm dev:api        # solo la API      (http://localhost:3001)
pnpm dev:web        # solo el web admin (http://localhost:5173)
pnpm dev:pos        # solo la caja POS  (http://localhost:5174)

# App móvil
cd apps/mobile && pnpm start
```

## Calidad

```bash
pnpm lint           # ESLint en todo el monorepo
pnpm type-check     # tsc --noEmit
pnpm test           # Vitest (unit tests de packages/core)
pnpm build          # build de producción vía turbo
```

CI: cada push/PR corre lint + type-check + build + test (ver `.github/workflows/ci.yml`).

## Build de escritorio (Electron)

```bash
pnpm --filter @niagara/web build:electron   # instalador admin (.exe)
pnpm --filter @niagara/pos build:electron   # instalador caja  (.exe)
```

## Deploy

Ver **[DEPLOY.md](./DEPLOY.md)** — API + Postgres en Render, web en Vercel, móvil con EAS.

## Estructura

```
club-niagara/
├── apps/
│   ├── api/          # Fastify + Prisma + Socket.io
│   ├── web/          # Panel admin (React + Vite + Electron)
│   ├── pos/          # Caja POS offline-first (React + Vite + idb)
│   └── mobile/       # App cliente (Expo + expo-router + NativeWind)
├── packages/
│   ├── core/         # Tipos + Zod schemas + constantes
│   ├── db/           # Prisma client + schema.prisma
│   ├── ui/           # Design system
│   └── config/       # TS / ESLint / Tailwind compartidos
├── render.yaml       # Blueprint de deploy de la API + DB
├── vercel.json       # Deploy de la web
├── DEPLOY.md
└── turbo.json
```

## Módulos

1. ✅ Scaffolding + DB + Auth + Dashboard
2. ✅ Portería (offline, control de aforo)
3. ✅ Caja/POS (offline)
4. ✅ Cashless (tarjeta/QR + Mercado Pago)
5. ✅ Eventos + Boletería
6. ✅ VIP + Reservas
7. ✅ Reportes + Corte de caja
8. ✅ Guardarropa + Stock + Personal
9. ✅ App del cliente final (Expo)
10. 🚧 En curso — Pulido + tests + deploy (Render + Vercel + EAS)

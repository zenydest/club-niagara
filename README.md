# Club Niágara — Sistema de gestión para boliches

> Cloud-first · Offline-first · Tiempo real

## Apps

| App | Puerto | Descripción |
|-----|--------|-------------|
| `apps/web` | 5173 | Panel admin (dueño/encargado) — web + Electron |
| `apps/pos` | 5174 | Caja offline-first (cajeros) — web + Electron |

## Requisitos previos

- Node.js ≥ 20
- pnpm ≥ 9
- Cuenta en [Supabase](https://supabase.com) (tier gratuito alcanza para dev)
- Supabase CLI: `npm i -g supabase`

## Setup inicial

### 1. Instalar dependencias

```bash
cd noxa
pnpm install
```

### 2. Configurar Supabase

```bash
# Inicializar Supabase en el proyecto
supabase init

# Vincular a tu proyecto (obtenés el ref en Supabase Dashboard → Settings → General)
supabase link --project-ref TU_REF_AQUI

# Aplicar migraciones (crea todas las tablas + RLS)
supabase db push

# Opcional: aplicar seeds de datos de prueba
psql "postgresql://postgres:TU_PASSWORD@db.TU_REF.supabase.co:5432/postgres" \
  -f supabase/migrations/00004_seeds.sql
```

### 3. Variables de entorno

Crear `.env` en `apps/web/` y `apps/pos/` (copiá de `.env.example` en la raíz):

```env
VITE_SUPABASE_URL=https://TU_REF.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key
```

Los valores los encontrás en **Supabase → Settings → API**.

### 4. Crear el primer usuario admin

En Supabase Dashboard → Authentication → Users → Add User:
- Email: `admin@tuboliche.com`
- Password: `Admin1234!`

Luego en el SQL Editor de Supabase:
```sql
-- Reemplazá el UUID con el del usuario que creaste
insert into staff (local_id, user_id, nombre, apellido, email, rol)
values (
  '00000000-0000-0000-0000-000000000001', -- local del seed
  (select id from auth.users where email = 'admin@tuboliche.com'),
  'Admin',
  'Club Niágara',
  'admin@tuboliche.com',
  'admin'
);
```

## Levantar en desarrollo

```bash
# Levantar todo
pnpm dev

# Solo el web admin
pnpm dev:web

# Solo el POS
pnpm dev:pos
```

## Build para producción

```bash
# Build web (para Vercel u otro hosting)
pnpm --filter @niagara/web build

# Build POS
pnpm --filter @niagara/pos build
```

## Empaquetar como app de Windows (Electron)

```bash
# App admin Windows
pnpm --filter @niagara/web build:electron

# App caja Windows
pnpm --filter @niagara/pos build:electron
```

Los instaladores `.exe` quedan en `apps/web/release/admin/` y `apps/pos/release/pos/`.

## Regenerar tipos de Supabase

Después de hacer cambios en la DB:

```bash
pnpm db:types
```

## Estructura del proyecto

```
noxa/
├── apps/
│   ├── web/          # Panel admin (React + Vite + Electron)
│   └── pos/          # Caja POS offline-first (React + Vite + Electron + PWA)
├── packages/
│   ├── core/         # Tipos TypeScript + Zod schemas + constantes
│   ├── db/           # Cliente Supabase + tipos generados
│   ├── ui/           # Design system (Button, KpiCard, Badge, Input)
│   └── config/       # TS config, ESLint, Tailwind preset
├── supabase/
│   ├── migrations/   # 00001_init_schema + 00002_rls + 00003_realtime + 00004_seeds
│   └── config.toml
└── turbo.json
```

## Módulos siguientes

1. ✅ Scaffolding + DB + Auth + Dashboard
2. ⬜ Portería offline (control de aforo)
3. ⬜ Módulo de caja completo (con stock)
4. ⬜ Cashless + Mercado Pago
5. ⬜ Eventos + Boletería + QR
6. ⬜ VIP + Reservas
7. ⬜ Reportes + Corte de caja
8. ⬜ Guardarropa + Stock + Personal
9. ⬜ App del cliente final
10. ⬜ Deploy (Vercel + EAS + Supabase)

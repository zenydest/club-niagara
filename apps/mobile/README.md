# NOXA Mobile — App del cliente final

App Expo (React Native) para el cliente final del boliche.

## Funcionalidades

- **Eventos** — ver eventos en preventa y en vivo
- **Mi Tarjeta** — saldo cashless + QR para cobrar en caja
- **Mis Entradas** — entradas compradas + QR para acceder en portería
- **Perfil** — datos del cliente + cerrar sesión

## Setup

### 1. Variables de entorno

```bash
cp .env.example .env
# Editar con la URL de la API y el localId
```

### 2. Assets placeholder (requeridos por Expo)

Crear carpeta `assets/` con imágenes placeholder:
```bash
mkdir -p apps/mobile/assets
# Colocar: icon.png (1024x1024), splash.png (2048x2048), adaptive-icon.png (1024x1024)
```

### 3. Instalar dependencias

```bash
cd apps/mobile
pnpm install
```

### 4. Correr en desarrollo

```bash
pnpm start        # Expo Go
pnpm android      # Android
pnpm ios          # iOS
```

## DB Push (producción)

Después de agregar el modelo `Cliente` al schema, correr desde la raíz del monorepo:

```bash
# Usar la External Database URL de Render
DATABASE_URL="postgresql://..." pnpm --filter @niagara/db db:push
```

O bien, en Windows PowerShell:

```powershell
$env:DATABASE_URL="postgresql://..."
pnpm --filter @niagara/db db:push
```

## Estructura

```
apps/mobile/
├── app/
│   ├── _layout.tsx          # Root layout (auth check + providers)
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── registro.tsx
│   └── (tabs)/
│       ├── _layout.tsx
│       ├── index.tsx        # Eventos
│       ├── tarjeta.tsx      # Cashless + QR
│       ├── entradas.tsx     # Entradas + QR
│       └── perfil.tsx       # Perfil + logout
├── components/
│   ├── QRDisplay.tsx
│   └── EventoCard.tsx
├── lib/
│   ├── apiClient.ts         # HTTP client + types
│   └── queryClient.ts       # TanStack Query config
└── stores/
    └── authStore.ts         # Zustand auth store
```

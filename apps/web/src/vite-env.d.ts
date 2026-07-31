/// <reference types="vite/client" />

/**
 * Tipado de las variables de entorno del panel admin.
 *
 * Sin este archivo, `import.meta.env` no existe para TypeScript y el
 * type-check falla con TS2339 en apiClient / authClient / socketClient.
 */
interface ImportMetaEnv {
  /** URL del backend Fastify. Ver .env.example */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

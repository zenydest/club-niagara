/**
 * Cliente HTTP para el POS de Club Niágara.
 * Idéntico al de apps/web — extrae el localId del store del POS.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

// `localId?: string | undefined` y no `localId?: string`: con
// exactOptionalPropertyTypes activado, omitir la propiedad y pasarla como
// undefined son cosas distintas, y los helpers de abajo la pasan explícitamente.
async function request<T>(
  path: string,
  options: RequestInit & { localId?: string | undefined } = {}
): Promise<T> {
  const { localId, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (localId) {
    headers["x-local-id"] = localId;
  }

  const res = await fetch(`${BASE_URL}/api${path}`, {
    ...fetchOptions,
    credentials: "include",
    headers,
  });

  if (!res.ok) {
    // `res.json()` devuelve `any`; el cast explícito evita propagarlo.
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(cuerpo?.error ?? res.statusText ?? `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, localId?: string) =>
    request<T>(path, { method: "GET", localId }),

  post: <T>(path: string, body: unknown, localId?: string) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body), localId }),
};

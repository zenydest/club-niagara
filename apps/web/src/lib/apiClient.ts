/**
 * Cliente HTTP para el backend Fastify de Club Niágara.
 *
 * Envía automáticamente:
 *   - Credenciales de sesión (cookie httpOnly)
 *   - Header x-local-id con el local del staff
 *
 * Uso:
 *   const { kpis } = await api.get<KpisResponse>("/dashboard/kpis?eventoId=xxx")
 *   const { venta } = await api.post<VentaResponse>("/ventas", payload)
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/**
 * Convierte el `error` de la API en un mensaje legible.
 *
 * Cuando falla una validación, la API responde con el resultado de
 * `zodError.flatten()`, que es un objeto. Al meterlo directo en `new Error(...)`
 * el mensaje quedaba en "[object Object]" y el usuario no tenía forma de saber
 * qué campo estaba mal.
 */
function mensajeDeError(error: unknown, res: Response): string {
  if (typeof error === "string" && error) return error;

  if (typeof error === "object" && error !== null) {
    const flatten = error as {
      formErrors?: string[];
      fieldErrors?: Record<string, string[] | undefined>;
    };

    const porCampo = Object.entries(flatten.fieldErrors ?? {})
      .map(([campo, mensajes]) => `${campo}: ${mensajes?.join(", ") ?? "inválido"}`)
      .join(" · ");

    const generales = flatten.formErrors?.join(" · ") ?? "";
    const combinado = [generales, porCampo].filter(Boolean).join(" · ");

    if (combinado) return combinado;
  }

  return res.statusText || `HTTP ${res.status}`;
}

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
    credentials: "include", // enviar cookies de sesión
    headers,
  });

  if (!res.ok) {
    // `res.json()` devuelve `any`; el cast explícito evita propagarlo.
    const cuerpo = (await res.json().catch(() => null)) as { error?: unknown } | null;
    throw new Error(mensajeDeError(cuerpo?.error, res));
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, localId?: string) =>
    request<T>(path, { method: "GET", localId }),

  post: <T>(path: string, body: unknown, localId?: string) =>
    request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
      localId,
    }),

  patch: <T>(path: string, body: unknown, localId?: string) =>
    request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
      localId,
    }),

  delete: <T>(path: string, localId?: string) =>
    request<T>(path, { method: "DELETE", localId }),
};

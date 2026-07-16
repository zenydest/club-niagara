/**
 * Cliente HTTP para la API de NOXA.
 * - Agrega automáticamente Authorization: Bearer <token> si hay sesión activa.
 * - Agrega x-local-id del env.
 * - Lanza Error con el mensaje del servidor en caso de error HTTP.
 */

import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const BASE_URL =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  process.env["EXPO_PUBLIC_API_URL"] ??
  "http://localhost:3001";

const LOCAL_ID =
  (Constants.expoConfig?.extra?.localId as string | undefined) ??
  process.env["EXPO_PUBLIC_LOCAL_ID"] ??
  "";

const TOKEN_KEY = "noxa_session_token";

// ── Token helpers ─────────────────────────────────────────────────

export const guardarToken = (token: string) =>
  SecureStore.setItemAsync(TOKEN_KEY, token);

export const leerToken = () => SecureStore.getItemAsync(TOKEN_KEY);

export const borrarToken = () => SecureStore.deleteItemAsync(TOKEN_KEY);

// ── Función base de fetch ─────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await leerToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-local-id":   LOCAL_ID,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    // Permite sobrescribir headers individuales desde el caller
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let mensaje = `Error ${res.status}`;
    try {
      const err = await res.json() as { error?: string };
      if (err.error) mensaje = err.error;
    } catch {
      // ignorar error al parsear
    }
    throw new Error(mensaje);
  }

  return res.json() as Promise<T>;
}

// ── Endpoints exportados ──────────────────────────────────────────

export interface ClienteInfo {
  id:       string;
  nombre:   string;
  apellido: string;
  email:    string;
  telefono?: string;
}

export interface AuthResponse {
  token:   string;
  cliente: ClienteInfo;
}

export interface EventoPublico {
  id:          string;
  nombre:      string;
  descripcion?: string;
  fechaInicio: string;
  fechaFin?:   string;
  imagenUrl?:  string;
  estado:      string;
  entradasTipo: {
    id:              string;
    nombre:          string;
    tipo:            string;
    precio:          string;
    cantidadTotal?:  number;
    cantidadVendida: number;
  }[];
}

export interface TarjetaCashless {
  id:        string;
  codigo:    string;
  saldo:     string;
  activa:    boolean;
  createdAt: string;
  recargas: {
    id:        string;
    monto:     string;
    metodoPago: string;
    createdAt: string;
  }[];
}

export interface EntradaConQR {
  id:          string;
  qrCode:      string;
  qrPayload:   string; // JSON stringificado para codificar en el QR
  usada:       boolean;
  precioPagado: string;
  createdAt:   string;
  evento: {
    id:          string;
    nombre:      string;
    fechaInicio: string;
    imagenUrl?:  string;
    estado:      string;
  };
  tipoEntrada: { nombre: string; tipo: string };
}

export const api = {
  /** Registro de nuevo cliente */
  registro: (body: { nombre: string; apellido: string; email: string; password: string; telefono?: string }) =>
    request<AuthResponse>("/api/cliente/registro", { method: "POST", body: JSON.stringify(body) }),

  /** Login */
  login: (body: { email: string; password: string }) =>
    request<AuthResponse>("/api/cliente/login", { method: "POST", body: JSON.stringify(body) }),

  /** Perfil del cliente autenticado */
  perfil: () =>
    request<{ cliente: ClienteInfo & { stats: { tarjetas: number; entradas: number }; creadoEn: string } }>(
      "/api/cliente/perfil"
    ),

  /** Eventos activos del local */
  eventos: () =>
    request<{ eventos: EventoPublico[] }>("/api/cliente/eventos"),

  /** Tarjetas cashless del cliente */
  cashless: () =>
    request<{ tarjetas: TarjetaCashless[] }>("/api/cliente/cashless"),

  /** Entradas compradas con QR */
  entradas: () =>
    request<{ entradas: EntradaConQR[] }>("/api/cliente/entradas"),
};

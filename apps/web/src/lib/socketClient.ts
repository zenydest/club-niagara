/**
 * Cliente Socket.io para el panel web de Club Niágara.
 *
 * Singleton: se crea una sola conexión y se reutiliza.
 * Se conecta/desconecta según el ciclo de vida de la app.
 *
 * Uso:
 *   import { socket } from "@/lib/socketClient"
 *   socket.emit("join:local", { localId })
 *   socket.on("aforo:actualizado", ({ eventoId, aforoActual }) => { ... })
 */

import { io, type Socket } from "socket.io-client";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/** Eventos que el servidor emite hacia el cliente (ver apps/api/src/socket) */
export interface ServerToClientEvents {
  "aforo:actualizado": (data: { eventoId: string; aforoActual: number }) => void;
  "venta:nueva": (data: {
    localId: string;
    eventoId?: string;
    barraId: string | null;
    staffId: string;
    staffNombre: string;
    total: number;
    metodoPago: string;
  }) => void;
  "evento:estado_cambiado": (data: { eventoId: string; estado: string }) => void;
  /** Ingreso o egreso registrado en la puerta — alimenta el feed del dashboard */
  "acceso:nuevo": (data: {
    eventoId: string;
    tipo: "ingreso" | "egreso";
    metodo: "manual" | "qr" | "cashless";
    clienteNombre: string | null;
    entradaTipo?: string;
    createdAt: string;
  }) => void;
  /** Cambio de estado de un cobro con terminal Point */
  "cobro:actualizado": (data: {
    referencia: string;
    estado: string;
    estadoDetalle: string | null;
    monto: number;
    pagado: boolean;
    cerradoSinPago: boolean;
  }) => void;
  joined: (data: { localId: string; rol: string; rooms: string[] }) => void;
  error: (data: { mensaje: string }) => void;
}

/** Eventos que el cliente emite hacia el servidor */
export interface ClientToServerEvents {
  "join:local": (data: { localId: string }) => void;
  "leave:local": (data: { localId: string }) => void;
}

/**
 * La anotación de tipo es obligatoria, no opcional: sin ella TypeScript infiere
 * un tipo que referencia `@socket.io/component-emitter`, un paquete transitivo
 * que con el node_modules estricto de pnpm no es nombrable desde acá (TS2742).
 *
 * De paso, aplicar los mapas de eventos tipa `socket.on` / `socket.emit`, que
 * hasta ahora aceptaban cualquier nombre de evento y cualquier payload.
 */
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(BASE_URL, {
  // Enviar cookies de sesión para autenticación en el handshake
  withCredentials: true,
  // No conectar automáticamente — el authStore lo hace tras el login
  autoConnect: false,
  // Reconexión automática con backoff
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 30_000,
});

// Log de debug en desarrollo
if (import.meta.env.DEV) {
  socket.on("connect", () => console.log("[Socket] Conectado:", socket.id));
  socket.on("disconnect", (reason) => console.log("[Socket] Desconectado:", reason));
  socket.on("connect_error", (err) => console.warn("[Socket] Error de conexión:", err.message));
}

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

import { io } from "socket.io-client";

const BASE_URL = import.meta.env["VITE_API_URL"] ?? "http://localhost:3001";

export const socket = io(BASE_URL, {
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

// Tipado de eventos del servidor
export interface ServerToClientEvents {
  "aforo:actualizado": (data: { eventoId: string; aforoActual: number }) => void;
  "venta:nueva": (data: { localId: string; eventoId?: string; total: number; metodoPago: string }) => void;
  "evento:estado_cambiado": (data: { eventoId: string; estado: string }) => void;
  joined: (data: { localId: string; rol: string; rooms: string[] }) => void;
  error: (data: { mensaje: string }) => void;
}

// Log de debug en desarrollo
if (import.meta.env.DEV) {
  socket.on("connect", () => console.log("[Socket] Conectado:", socket.id));
  socket.on("disconnect", (reason) => console.log("[Socket] Desconectado:", reason));
  socket.on("connect_error", (err) => console.warn("[Socket] Error de conexión:", err.message));
}

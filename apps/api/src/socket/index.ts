/**
 * Socket.io — gestión de rooms y eventos en tiempo real.
 *
 * Arquitectura de rooms:
 *   local:{localId}          — todos los conectados a un local (dashboard, POS, portería)
 *   local:{localId}:admin    — solo staff con rol admin/encargado
 *   local:{localId}:pos      — cajeros
 *   local:{localId}:porteria — porteros
 *
 * Eventos emitidos desde el servidor (en routes/):
 *   aforo:actualizado        — { eventoId, aforoActual }
 *   venta:nueva              — { localId, eventoId, total, metodoPago }
 *   evento:estado_cambiado   — { eventoId, estado }
 *
 * Eventos emitidos desde el cliente:
 *   join:local               — { localId, rol } → el cliente se suscribe a su room
 */

import type { Server } from "socket.io";
import { auth } from "../lib/auth.js";
import { prisma } from "@niagara/db";

export function iniciarSocketIO(io: Server) {
  io.on("connection", async (socket) => {
    const rawHeaders = socket.handshake.headers as Record<string, string>;

    // Verificar sesión Better Auth via cookie o header Authorization
    let userId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: rawHeaders as unknown as Headers });
      userId = session?.user?.id ?? null;
    } catch {
      // Sin sesión válida → solo lectura de rooms públicos
    }

    if (!userId) {
      socket.disconnect(true);
      return;
    }

    // Unirse al room del local
    socket.on("join:local", async (data: { localId: string }) => {
      const { localId } = data;

      // Verificar que el usuario tiene staff en ese local
      const staff = await prisma.staff.findUnique({
        where: { localId_userId: { localId, userId: userId! } },
      });

      if (!staff || !staff.activo) {
        socket.emit("error", { mensaje: "Sin acceso a este local" });
        return;
      }

      // Suscribir al room general del local
      await socket.join(`local:${localId}`);

      // Suscribir al room de rol
      const roomRol = `local:${localId}:${staff.rol}`;
      await socket.join(roomRol);

      socket.emit("joined", {
        localId,
        rol: staff.rol,
        rooms: [`local:${localId}`, roomRol],
      });

      console.log(`Socket ${socket.id} unido a local:${localId} (${staff.rol})`);
    });

    socket.on("leave:local", async (data: { localId: string }) => {
      await socket.leave(`local:${data.localId}`);
    });

    socket.on("disconnect", () => {
      console.log(`Socket ${socket.id} desconectado`);
    });
  });
}

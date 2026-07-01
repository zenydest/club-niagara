/**
 * Store de autenticación con Zustand + Better Auth.
 *
 * Reemplaza el store anterior basado en Supabase.
 * La sesión vive en cookie httpOnly manejada por Better Auth.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authClient } from "@/lib/authClient";
import { api } from "@/lib/apiClient";
import { socket } from "@/lib/socketClient";
import type { Staff } from "@niagara/core";
import type { RolStaff } from "@niagara/core";

interface AuthState {
  // Estado
  usuario: { id: string; email: string; name: string } | null;
  staff: Staff | null;
  cargando: boolean;
  error: string | null;

  // Acciones
  inicializar: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  limpiarError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      usuario: null,
      staff: null,
      cargando: false,
      error: null,

      /**
       * Verifica si hay sesión activa al cargar la app.
       * Better Auth usa cookies httpOnly → solo necesitamos preguntar al servidor.
       */
      inicializar: async () => {
        set({ cargando: true });

        try {
          const session = await authClient.getSession();

          if (session?.data?.user) {
            const user = session.data.user;
            set({ usuario: { id: user.id, email: user.email, name: user.name } });
            await cargarStaff(set, user.id);
          } else {
            set({ cargando: false });
          }
        } catch {
          set({ cargando: false });
        }
      },

      login: async (email: string, password: string) => {
        set({ cargando: true, error: null });

        const resultado = await authClient.signIn.email({
          email,
          password,
        });

        if (resultado.error) {
          const mensajes: Record<string, string> = {
            "Invalid credentials": "Email o contraseña incorrectos",
            "Too many requests": "Demasiados intentos. Esperá unos minutos.",
          };

          set({
            error: mensajes[resultado.error.message ?? ""] ?? "Error al iniciar sesión",
            cargando: false,
          });
          return;
        }

        if (resultado.data?.user) {
          const user = resultado.data.user;
          set({ usuario: { id: user.id, email: user.email, name: user.name } });
          await cargarStaff(set, user.id);
        }
      },

      logout: async () => {
        set({ cargando: true });

        // Desconectar Socket.io antes de cerrar sesión
        socket.disconnect();

        await authClient.signOut();
        set({ usuario: null, staff: null, cargando: false, error: null });
      },

      limpiarError: () => set({ error: null }),
    }),
    {
      name: "niagara-auth",
      partialize: (state) => ({
        staff: state.staff,
      }),
    }
  )
);

/** Carga los datos del staff del usuario desde la API */
async function cargarStaff(
  set: (state: Partial<AuthState>) => void,
  _userId: string
) {
  // El staff se carga a través del localId almacenado en la store.
  // Al no tener aún el localId (primer login), pedimos la lista de locales
  // que tiene el usuario y tomamos el primero.
  try {
    // /api/staff/perfil no requiere x-local-id — el tenant plugin hace bootstrap
    const data = await api.get<{ staff: Staff }>("/staff/perfil").catch(() => null);

    if (!data?.staff) {
      set({
        error: "Tu usuario no tiene acceso a ningún local. Contactá al administrador.",
        cargando: false,
      });
      return;
    }

    set({ staff: data.staff, cargando: false, error: null });

    // Conectar Socket.io y unirse al room del local
    socket.connect();
    socket.emit("join:local", { localId: staffActual.localId });
  } catch {
    set({
      error: "Error al cargar tu perfil. Intentá de nuevo.",
      cargando: false,
    });
  }
}

/** Hook utilitario para verificar roles */
export function tieneRol(staff: Staff | null, roles: RolStaff[]): boolean {
  if (!staff) return false;
  return roles.includes(staff.rol);
}

/**
 * Store de auth del POS — Better Auth.
 * La caja solo admite roles con permiso de venta: admin, encargado, cajero, barman.
 *
 * El perfil se resuelve con GET /api/staff/perfil, que devuelve el staff del
 * usuario autenticado. La versión anterior pedía GET /api/staff (listado
 * completo) y tomaba el primer staff con rol de caja: eso devolvía 403 para un
 * cajero — la ruta es solo admin/encargado — y, cuando funcionaba, podía dejar
 * la sesión con la identidad de otra persona y atribuirle las ventas.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authClient } from "../lib/authClient";
import { api } from "../lib/apiClient";
import type { Staff, RolStaff } from "@niagara/core";

interface AuthPosState {
  usuario: { id: string; email: string } | null;
  staff: Staff | null;
  cargando: boolean;
  error: string | null;
  inicializar: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const ROLES_CAJA: RolStaff[] = ["admin", "encargado", "cajero", "barman"];

export const useAuthStore = create<AuthPosState>()(
  persist(
    (set) => ({
      usuario: null,
      staff: null,
      cargando: false,
      error: null,

      inicializar: async () => {
        set({ cargando: true });
        try {
          const session = await authClient.getSession();

          if (session?.data?.user) {
            const user = session.data.user;
            set({ usuario: { id: user.id, email: user.email } });
            await cargarPerfilPOS(set);
          } else {
            set({ usuario: null, staff: null, cargando: false });
          }
        } catch {
          set({ cargando: false, error: "No se pudo verificar la sesión" });
        }
      },

      login: async (email, password) => {
        set({ cargando: true, error: null });

        const resultado = await authClient.signIn.email({ email, password });

        if (resultado.error) {
          set({ error: "Email o contraseña incorrectos", cargando: false });
          return;
        }

        if (resultado.data?.user) {
          const user = resultado.data.user;
          set({ usuario: { id: user.id, email: user.email } });
          await cargarPerfilPOS(set);
        } else {
          set({ error: "Respuesta de login inesperada", cargando: false });
        }
      },

      logout: async () => {
        await authClient.signOut();
        set({ usuario: null, staff: null, error: null });
      },
    }),
    { name: "niagara-pos-auth", partialize: (s) => ({ staff: s.staff }) }
  )
);

/** Cargar el perfil de staff del usuario autenticado y validar su rol */
async function cargarPerfilPOS(set: (state: Partial<AuthPosState>) => void) {
  try {
    const data = await api.get<{ staff: Staff | null }>("/staff/perfil");
    const staff = data?.staff;

    if (!staff) {
      set({ staff: null, error: "Tu usuario no está vinculado a ningún local", cargando: false });
      return;
    }

    if (!staff.activo) {
      set({ staff: null, error: "Tu usuario está desactivado", cargando: false });
      return;
    }

    if (!ROLES_CAJA.includes(staff.rol)) {
      set({ staff: null, error: "Tu rol no tiene acceso a la caja", cargando: false });
      return;
    }

    set({ staff, cargando: false, error: null });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error al cargar tu perfil de caja";
    set({ staff: null, error: mensaje, cargando: false });
  }
}

/**
 * Store de auth del POS — Better Auth.
 * Simplificado: la caja solo necesita rol cajero/barman/admin/encargado.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authClient } from "../lib/authClient";
import { api } from "../lib/apiClient";
import type { Staff } from "@niagara/core";

interface AuthPosState {
  usuario: { id: string; email: string } | null;
  staff: Staff | null;
  cargando: boolean;
  error: string | null;
  inicializar: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const ROLES_CAJA = ["admin", "encargado", "cajero", "barman"];

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
            await cargarStaffPOS(set, user.id);
          } else {
            set({ cargando: false });
          }
        } catch {
          set({ cargando: false });
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
          await cargarStaffPOS(set, user.id);
        }
      },

      logout: async () => {
        await authClient.signOut();
        set({ usuario: null, staff: null });
      },
    }),
    { name: "niagara-pos-auth", partialize: (s) => ({ staff: s.staff }) }
  )
);

async function cargarStaffPOS(
  set: (state: Partial<AuthPosState>) => void,
  _userId: string
) {
  try {
    // El primer staff disponible con rol de caja
    const data = await api.get<{ staff: Staff[] }>("/staff").catch(() => null);

    const staff = data?.staff?.find((s) => ROLES_CAJA.includes(s.rol));

    if (!staff) {
      set({ error: "No tenés acceso a la caja", cargando: false });
      return;
    }

    set({ staff, cargando: false, error: null });
  } catch {
    set({ error: "Error al cargar tu perfil de caja.", cargando: false });
  }
}

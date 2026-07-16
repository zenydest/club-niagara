/**
 * Store de autenticación del cliente final.
 * - Persiste el token en SecureStore.
 * - Expone: cliente, token, isAuthenticated, login, logout.
 */

import { create } from "zustand";
import { api, guardarToken, borrarToken, type ClienteInfo } from "@/lib/apiClient";

interface AuthState {
  cliente:         ClienteInfo | null;
  token:           string | null;
  isAuthenticated: boolean;
  isLoading:       boolean;
  error:           string | null;

  /** Carga inicial — llamar en el _layout raíz */
  inicializar: (savedToken: string | null, clienteData?: ClienteInfo) => void;

  /** Login con email/password */
  login: (email: string, password: string) => Promise<void>;

  /** Registro nuevo cliente */
  registro: (datos: {
    nombre:   string;
    apellido: string;
    email:    string;
    password: string;
    telefono?: string;
  }) => Promise<void>;

  /** Cerrar sesión */
  logout: () => Promise<void>;

  /** Limpiar error */
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  cliente:         null,
  token:           null,
  isAuthenticated: false,
  isLoading:       false,
  error:           null,

  inicializar: (savedToken, clienteData) => {
    if (savedToken) {
      set({
        token:           savedToken,
        cliente:         clienteData ?? null,
        isAuthenticated: true,
      });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { token, cliente } = await api.login({ email, password });
      await guardarToken(token);
      set({ token, cliente, isAuthenticated: true, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      throw err;
    }
  },

  registro: async (datos) => {
    set({ isLoading: true, error: null });
    try {
      const { token, cliente } = await api.registro(datos);
      await guardarToken(token);
      set({ token, cliente, isAuthenticated: true, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    await borrarToken();
    set({ token: null, cliente: null, isAuthenticated: false });
  },

  clearError: () => set({ error: null }),
}));

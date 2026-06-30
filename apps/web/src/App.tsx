import React, { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { LoginPage } from "@/pages/auth/LoginPage";
import { AppLayout } from "@/layouts/AppLayout";

/**
 * Componente raíz de la app web Club Niágara.
 * Maneja la bifurcación auth → app.
 */
export function App() {
  const { sesion, cargando, inicializar } = useAuthStore();

  // Inicializar la sesión al montar la app
  useEffect(() => {
    void inicializar();
  }, [inicializar]);

  // Pantalla de carga inicial
  if (cargando && !sesion) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center">
            <span className="text-2xl font-black text-lime">N</span>
          </div>
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full bg-lime animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 rounded-full bg-lime animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 rounded-full bg-lime animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      </div>
    );
  }

  // Sin sesión → pantalla de login
  if (!sesion) {
    return <LoginPage />;
  }

  // Con sesión → panel de administración
  return <AppLayout />;
}

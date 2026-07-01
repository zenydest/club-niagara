import React, { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { LoginPage } from "@/pages/auth/LoginPage";
import { AppLayout } from "@/layouts/AppLayout";

/**
 * Componente raíz de la app web Club Niágara.
 * Maneja la bifurcación auth → app.
 */
export function App() {
  const { usuario, cargando, inicializar } = useAuthStore();

  // Inicializar la sesión al montar la app
  useEffect(() => {
    void inicializar();
  }, [inicializar]);

  // Pantalla de carga inicial
  if (cargando && !usuario) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          {/* Logo */}
          <img
            src="/logo.png"
            alt="Club Niágara"
            className="w-32 h-32 object-contain animate-neon-pulse"
          />
          {/* Dots de carga con gradiente neon */}
          <div className="flex gap-2">
            <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#1E50FF", animationDelay: "0ms" }} />
            <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#8B3DFF", animationDelay: "150ms" }} />
            <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#CC0099", animationDelay: "300ms" }} />
          </div>
        </div>
      </div>
    );
  }

  // Sin sesión → pantalla de login
  if (!usuario) {
    return <LoginPage />;
  }

  // Con sesión → panel de administración
  return <AppLayout />;
}

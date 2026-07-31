import React, { useEffect } from "react";
import { useAuthStore } from "@/stores/authPosStore";
import { LoginPosPag } from "@/pages/LoginPosPag";
import { PosLayout } from "@/layouts/PosLayout";

export function App() {
  const { usuario, staff, cargando, inicializar } = useAuthStore();

  useEffect(() => {
    void inicializar();
  }, [inicializar]);

  // Hay sesión de caja cuando el usuario está autenticado Y tiene perfil de staff
  const sesionActiva = !!usuario && !!staff;

  if (cargando && !sesionActiva) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center">
            <span className="text-xl font-black text-lime">POS</span>
          </div>
          <div className="flex gap-1.5">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="w-2 h-2 rounded-full bg-lime animate-bounce"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!sesionActiva) return <LoginPosPag />;

  return <PosLayout />;
}

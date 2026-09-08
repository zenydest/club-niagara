import React, { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { LoginPage } from "@/pages/auth/LoginPage";
import { AppLayout } from "@/layouts/AppLayout";
import { PaseQR } from "@/paginas-publicas/PaseQR";

/**
 * Rutas que abre gente de la calle desde un link de WhatsApp.
 *
 *   /free/CODIGO   — pase de cortesía
 *   /entrada/UUID  — entrada vendida
 *
 * Se resuelven leyendo la URL y no con un router: son dos rutas fijas y el
 * resto del panel no usa navegación por URL, así que sumar react-router sería
 * traer una dependencia entera para esto.
 */
function rutaPublica(): { tipo: "free" | "entrada"; codigo: string } | null {
  const partes = window.location.pathname.split("/").filter(Boolean);
  const [seccion, codigo] = partes;

  if (!codigo) return null;
  if (seccion === "free") return { tipo: "free", codigo };
  if (seccion === "entrada") return { tipo: "entrada", codigo };

  return null;
}

/**
 * Componente raíz de la app web Club Niágara.
 * Maneja la bifurcación auth → app.
 */
export function App() {
  const { usuario, cargando, inicializar } = useAuthStore();

  const publica = rutaPublica();

  // Inicializar la sesión al montar la app
  useEffect(() => {
    // En las páginas públicas no se pide sesión: son para gente que no tiene
    // cuenta, y consultarla haría aparecer el login por un instante.
    if (publica) return;
    void inicializar();
  }, [inicializar, publica]);

  if (publica) {
    return <PaseQR tipo={publica.tipo} codigo={publica.codigo} />;
  }

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

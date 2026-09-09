import React, { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { LoginPage } from "@/pages/auth/LoginPage";
import { AppLayout } from "@/layouts/AppLayout";
import { PaseQR } from "@/paginas-publicas/PaseQR";
import { ComprarEntrada } from "@/paginas-publicas/ComprarEntrada";
import { PagoResultado } from "@/paginas-publicas/PagoResultado";

type Publica =
  | { vista: "pase"; tipo: "free" | "entrada"; codigo: string }
  | { vista: "comprar"; eventoId: string; rrpp?: string }
  | { vista: "pago"; referencia: string };

/**
 * Rutas que abre gente de la calle, sin cuenta.
 *
 *   /free/CODIGO       — pase de cortesía
 *   /entrada/UUID      — entrada ya comprada
 *   /e/EVENTO?r=CODIGO — comprar, con el código del RRPP que compartió el link
 *   /pago-ok?ref=...   — vuelta desde Mercado Pago
 *
 * Se resuelven leyendo la URL y no con un router: son pocas rutas fijas y el
 * panel no usa navegación por URL, así que sumar react-router sería traer una
 * dependencia entera para esto.
 */
function rutaPublica(): Publica | null {
  const partes = window.location.pathname.split("/").filter(Boolean);
  const [seccion, valor] = partes;
  const params = new URLSearchParams(window.location.search);

  if (seccion === "pago-ok" || seccion === "pago-pendiente") {
    const ref = params.get("ref") ?? params.get("external_reference");
    return ref ? { vista: "pago", referencia: ref } : null;
  }

  if (!valor) return null;

  if (seccion === "free") return { vista: "pase", tipo: "free", codigo: valor };
  if (seccion === "entrada") return { vista: "pase", tipo: "entrada", codigo: valor };

  if (seccion === "e") {
    const rrpp = params.get("r");
    return { vista: "comprar", eventoId: valor, ...(rrpp && { rrpp }) };
  }

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
    if (publica.vista === "pase") {
      return <PaseQR tipo={publica.tipo} codigo={publica.codigo} />;
    }
    if (publica.vista === "comprar") {
      return (
        <ComprarEntrada
          eventoId={publica.eventoId}
          {...(publica.rrpp !== undefined && { rrpp: publica.rrpp })}
        />
      );
    }
    return <PagoResultado referencia={publica.referencia} />;
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

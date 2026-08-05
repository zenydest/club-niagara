import React, { useState } from "react";
import { cn } from "@niagara/ui";
import { useAuthStore } from "@/stores/authStore";
import { Sidebar } from "@/components/Sidebar";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { PorteriaPage } from "@/pages/porteria/PorteriaPage";
import { CajaPage } from "@/pages/caja/CajaPage";
import { CashlessPage } from "@/pages/cashless/CashlessPage";
import { EventosPage } from "@/pages/eventos/EventosPage";
import { VIPPage } from "@/pages/vip/VIPPage";
import { ReportesPage } from "@/pages/reportes/ReportesPage";
import { GuardarropaPage } from "@/pages/guardarropa/GuardarropaPage";
import { StockPage } from "@/pages/stock/StockPage";
import { PersonalPage } from "@/pages/personal/PersonalPage";
import { TerminalesPage } from "@/pages/terminales/TerminalesPage";
import { ROL_LABELS } from "@niagara/core";
import { Icono } from "@/components/Icono";

type Pagina =
  | "dashboard"
  | "porteria"
  | "caja"
  | "cashless"
  | "eventos"
  | "reservas"
  | "reportes"
  | "guardarropa"
  | "stock"
  | "terminales"
  | "staff";

/**
 * Layout principal de la app.
 * Sidebar fijo + área de contenido.
 * Responsive: sidebar colapsable en móvil.
 */
export function AppLayout() {
  const { staff, logout } = useAuthStore();
  const [paginaActual, setPaginaActual] = useState<Pagina>("dashboard");
  const [sidebarAbierto, setSidebarAbierto] = useState(true);

  const renderPagina = () => {
    switch (paginaActual) {
      case "dashboard":
        return <DashboardPage />;
      case "porteria":
        return <PorteriaPage />;
      case "caja":
        return <CajaPage />;
      case "cashless":
        return <CashlessPage />;
      case "eventos":
        return <EventosPage />;
      case "reservas":
        return <VIPPage />;
      case "reportes":
        return <ReportesPage />;
      case "guardarropa":
        return <GuardarropaPage />;
      case "stock":
        return <StockPage />;
      case "terminales":
        return <TerminalesPage />;
      case "staff":
        return <PersonalPage />;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center">
              <Icono nombre="alerta" tamano={26} className="text-text-muted" />
            </div>
            <p className="text-text-secondary">Módulo en construcción</p>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        abierto={sidebarAbierto}
        paginaActual={paginaActual}
        onNavegar={(pagina) => {
          setPaginaActual(pagina as Pagina);
          // En móvil, cerrar sidebar al navegar
          if (window.innerWidth < 768) {
            setSidebarAbierto(false);
          }
        }}
        onCerrar={() => setSidebarAbierto(false)}
      />

      {/* Overlay móvil */}
      {sidebarAbierto && (
        <div
          className="fixed inset-0 bg-black/60 z-20 md:hidden"
          onClick={() => setSidebarAbierto(false)}
        />
      )}

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header superior */}
        <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-surface/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            {/* Botón menú hamburguesa */}
            <button
              onClick={() => setSidebarAbierto(!sidebarAbierto)}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface-2 text-text-secondary transition-colors"
              aria-label="Menú"
            >
              <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
                <path
                  d={sidebarAbierto ? "M1 1l16 12M1 13L17 1" : "M0 1h18M0 7h18M0 13h18"}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* Usuario autenticado */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-text-primary leading-none">
                {staff?.nombre} {staff?.apellido}
              </p>
              <p className="text-xs text-text-secondary mt-0.5">
                {staff ? ROL_LABELS[staff.rol] : ""}
              </p>
            </div>
            <button
              onClick={() => void logout()}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium border border-border",
                "text-text-secondary hover:border-danger hover:text-danger transition-colors"
              )}
            >
              Salir
            </button>
          </div>
        </header>

        {/* Área de página */}
        <main className="flex-1 overflow-y-auto p-6">
          {renderPagina()}
        </main>
      </div>
    </div>
  );
}

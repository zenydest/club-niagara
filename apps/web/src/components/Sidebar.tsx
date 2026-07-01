import React from "react";
import { cn } from "@niagara/ui";
import { useAuthStore } from "@/stores/authStore";

interface NavItem {
  id: string;
  label: string;
  icono: string;
  roles?: string[];
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icono: "⚡" },
  { id: "porteria", label: "Portería", icono: "🚪", roles: ["admin", "encargado", "portero"] },
  { id: "caja", label: "Caja / POS", icono: "💰", roles: ["admin", "encargado", "cajero", "barman"] },
  { id: "cashless", label: "Cashless", icono: "💳", roles: ["admin", "encargado", "cajero"] },
  { id: "eventos", label: "Eventos", icono: "🎉", roles: ["admin", "encargado"] },
  { id: "reservas", label: "Reservas VIP", icono: "🛋️", roles: ["admin", "encargado", "rrpp"] },
  { id: "reportes", label: "Reportes", icono: "📊", roles: ["admin", "encargado"] },
  { id: "stock", label: "Stock", icono: "📦", roles: ["admin", "encargado", "barman"] },
  { id: "staff", label: "Personal", icono: "👥", roles: ["admin"] },
];

interface SidebarProps {
  abierto: boolean;
  paginaActual: string;
  onNavegar: (pagina: string) => void;
  onCerrar: () => void;
}

/**
 * Sidebar de navegación principal.
 * En desktop: siempre visible (colapsable).
 * En móvil: drawer desde la izquierda.
 */
export function Sidebar({ abierto, paginaActual, onNavegar }: SidebarProps) {
  const { staff } = useAuthStore();

  // Filtrar items por rol
  const itemsVisibles = NAV_ITEMS.filter((item) => {
    if (!item.roles) return true;
    if (!staff) return false;
    return item.roles.includes(staff.rol);
  });

  return (
    <aside
      className={cn(
        "fixed md:relative inset-y-0 left-0 z-30 flex flex-col",
        "bg-surface border-r border-border",
        "transition-all duration-300 ease-in-out",
        abierto ? "w-64 translate-x-0" : "w-0 -translate-x-full md:w-16 md:translate-x-0"
      )}
    >
      <div className={cn("flex flex-col h-full", !abierto && "md:items-center")}>
        {/* Logo */}
        <div
          className={cn(
            "flex items-center h-16 border-b border-border px-3",
            !abierto && "md:justify-center md:px-2"
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/logo.png"
              alt="Club Niágara"
              className="w-10 h-10 flex-shrink-0 object-contain"
            />
            {abierto && (
              <div className="min-w-0">
                <p className="font-black text-sm leading-none" style={{
                  background: "linear-gradient(90deg, #1E50FF, #8B3DFF, #CC0099)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}>
                  Club Niágara
                </p>
                <p className="text-xs text-text-muted mt-0.5">Sistema de gestión</p>
              </div>
            )}
          </div>
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto py-4 px-2">
          <ul className="flex flex-col gap-1">
            {itemsVisibles.map((item) => {
              const esActivo = paginaActual === item.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => onNavegar(item.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150",
                      "text-sm font-medium",
                      esActivo
                        ? "text-white"
                        : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
                      !abierto && "md:justify-center md:px-2"
                    )}
                    style={esActivo ? {
                      background: "linear-gradient(90deg, rgba(30,80,255,0.18) 0%, rgba(139,61,255,0.12) 100%)",
                      borderLeft: "2px solid #8B3DFF",
                    } : undefined}
                    title={!abierto ? item.label : undefined}
                  >
                    <span className="text-base flex-shrink-0">{item.icono}</span>
                    {abierto && (
                      <span className="truncate">{item.label}</span>
                    )}
                    {abierto && esActivo && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-lime" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer del sidebar */}
        {abierto && staff && (
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-purple/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-purple-300">
                  {staff.nombre[0]}{staff.apellido[0]}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-text-primary truncate">
                  {staff.nombre} {staff.apellido}
                </p>
                <p className="text-xs text-text-muted capitalize">{staff.rol}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

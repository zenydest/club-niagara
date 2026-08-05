import React from "react";
import { cn } from "../lib/cn.js";

type Variante = "lime" | "purple" | "ghost" | "danger" | "outline";
type Tamaño = "sm" | "md" | "lg" | "xl";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamaño?: Tamaño;
  cargando?: boolean;
  icono?: React.ReactNode;
}

const variantesClases: Record<Variante, string> = {
  // El acento es un azul oscuro (#1E50FF): encima va texto blanco, no negro.
  // Con negro el contraste queda en 3.4:1 y no se lee, que es justo lo que
  // pasaba en los botones primarios del panel.
  lime: "bg-accent text-white font-bold hover:bg-accent-300 active:scale-95 shadow-lime-glow",
  purple: "bg-purple text-white font-bold hover:bg-purple-500 active:scale-95 shadow-purple-glow",
  ghost: "bg-transparent text-text-primary hover:bg-surface-2 border border-border",
  danger: "bg-danger text-white font-bold hover:bg-red-600 active:scale-95",
  outline: "bg-transparent border border-accent text-accent hover:bg-accent hover:text-white",
};

const tamañosClases: Record<Tamaño, string> = {
  sm: "px-3 py-1.5 text-sm rounded-lg",
  md: "px-5 py-2.5 text-base rounded-xl",
  lg: "px-7 py-3.5 text-lg rounded-xl",
  xl: "px-8 py-4 text-xl rounded-2xl",
};

/**
 * Botón principal del design system Club Niágara.
 * Variante `lime` es el CTA principal (verde lima brillante).
 */
export function Button({
  variante = "lime",
  tamaño = "md",
  cargando = false,
  icono,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 transition-all duration-150",
        "focus:outline-none focus:ring-2 focus:ring-lime focus:ring-offset-2 focus:ring-offset-background",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none",
        variantesClases[variante],
        tamañosClases[tamaño],
        className
      )}
      disabled={disabled ?? cargando}
      {...props}
    >
      {cargando ? (
        <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
      ) : (
        icono
      )}
      {children}
    </button>
  );
}

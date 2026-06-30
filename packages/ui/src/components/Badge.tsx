import React from "react";
import { cn } from "../lib/cn.js";

type VarianteBadge = "lime" | "purple" | "success" | "warning" | "danger" | "neutral";

interface BadgeProps {
  children: React.ReactNode;
  variante?: VarianteBadge;
  className?: string;
}

const variantesClases: Record<VarianteBadge, string> = {
  lime: "bg-lime/10 text-lime border-lime/30",
  purple: "bg-purple/10 text-purple-300 border-purple/30",
  success: "bg-success/10 text-success border-success/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  danger: "bg-danger/10 text-danger border-danger/30",
  neutral: "bg-surface-2 text-text-secondary border-border",
};

/** Badge/etiqueta pequeña para estados, roles, etc. */
export function Badge({ children, variante = "neutral", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border",
        variantesClases[variante],
        className
      )}
    >
      {children}
    </span>
  );
}

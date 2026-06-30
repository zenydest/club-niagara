import React from "react";
import { cn } from "../lib/cn.js";

interface KpiCardProps {
  titulo: string;
  valor: string | number;
  subtitulo?: string;
  icono?: React.ReactNode;
  tendencia?: "subiendo" | "bajando" | "neutro";
  acento?: "lime" | "purple" | "warning" | "danger";
  className?: string;
  /** Si está en vivo (parpadea el punto verde) */
  enVivo?: boolean;
}

const acentoClases = {
  lime: "text-lime",
  purple: "text-purple",
  warning: "text-warning",
  danger: "text-danger",
};

const tendenciaIconos = {
  subiendo: "▲",
  bajando: "▼",
  neutro: "→",
};

const tendenciaColores = {
  subiendo: "text-success",
  bajando: "text-danger",
  neutro: "text-text-secondary",
};

/**
 * Tarjeta de KPI grande para el dashboard.
 * Diseñada para ser legible en penumbra desde lejos.
 */
export function KpiCard({
  titulo,
  valor,
  subtitulo,
  icono,
  tendencia,
  acento = "lime",
  className,
  enVivo = false,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "bg-surface rounded-2xl p-6 border border-border",
        "hover:border-border-strong transition-colors duration-200",
        "shadow-card flex flex-col gap-3",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {enVivo && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-lime" />
            </span>
          )}
          <span className="text-text-secondary text-sm font-medium uppercase tracking-wider">
            {titulo}
          </span>
        </div>
        {icono && (
          <span className={cn("text-xl", acentoClases[acento])}>{icono}</span>
        )}
      </div>

      {/* Valor principal */}
      <div className={cn("text-kpi-lg font-black tracking-tight", acentoClases[acento])}>
        {valor}
      </div>

      {/* Subtítulo / tendencia */}
      {(subtitulo ?? tendencia) && (
        <div className="flex items-center gap-2 text-sm">
          {tendencia && (
            <span className={cn("font-semibold", tendenciaColores[tendencia])}>
              {tendenciaIconos[tendencia]}
            </span>
          )}
          {subtitulo && (
            <span className="text-text-secondary">{subtitulo}</span>
          )}
        </div>
      )}
    </div>
  );
}

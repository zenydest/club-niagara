import React from "react";
import { cn } from "../lib/cn.js";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icono?: React.ReactNode;
}

/**
 * Input del design system Club Niágara.
 * Tema oscuro con borde que resalta al foco (verde lima).
 */
export function Input({ label, error, icono, className, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        {icono && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            {icono}
          </span>
        )}
        <input
          id={inputId}
          className={cn(
            "w-full bg-surface-2 border rounded-xl px-4 py-3 text-text-primary",
            "placeholder:text-text-muted",
            "focus:outline-none focus:ring-2 focus:ring-lime focus:border-transparent",
            "transition-all duration-150",
            error ? "border-danger" : "border-border hover:border-border-strong",
            icono && "pl-10",
            className
          )}
          {...props}
        />
      </div>
      {error && (
        <p className="text-danger text-xs font-medium">{error}</p>
      )}
    </div>
  );
}

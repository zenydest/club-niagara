import React from "react";
import { cn } from "@niagara/ui";
import { useCobroPointStore } from "@/stores/cobroPointStore";
import { Icono } from "@/components/Icono";

interface ModalCobroPointProps {
  monto: number;
  onCerrar: () => void;
}

const formatearPesos = (monto: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(monto);

/**
 * Pantalla de espera del cobro con terminal Point.
 *
 * Está pensada para leerse de reojo y en penumbra: el estado ocupa el centro,
 * con color e ícono grandes, porque el cajero está mirando la terminal y no la
 * tablet.
 */
export function ModalCobroPoint({ monto, onCerrar }: ModalCobroPointProps) {
  const { estado, orden, error, cancelar, reiniciar } = useCobroPointStore();

  const enCurso = estado === "creando" || estado === "esperando";

  // Mientras la terminal tiene la orden, MP no deja cancelar por API.
  const yaEnTerminal = orden?.estado === "at_terminal";

  const cerrar = () => {
    reiniciar();
    onCerrar();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      <div className="relative w-full max-w-md bg-surface border border-border rounded-2xl p-6 flex flex-col items-center gap-5">
        <div className="text-center">
          <p className="text-xs uppercase tracking-wide text-text-muted">A cobrar</p>
          <p className="text-4xl font-black text-lime mt-1">{formatearPesos(monto)}</p>
        </div>

        {enCurso && (
          <>
            <div className="flex gap-1.5">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="w-2.5 h-2.5 rounded-full bg-lime animate-bounce"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
            <p className="text-sm text-text-secondary text-center">
              {estado === "creando"
                ? "Enviando el cobro a la terminal…"
                : yaEnTerminal
                  ? "La terminal está esperando la tarjeta"
                  : "Esperando que la terminal levante la orden…"}
            </p>
          </>
        )}

        {estado === "pagado" && (
          <div className="flex flex-col items-center gap-2">
            <Icono nombre="ok" tamano={52} className="text-success" />
            <p className="text-lg font-bold text-success">Pago aprobado</p>
          </div>
        )}

        {(estado === "rechazado" || estado === "error") && (
          <div className="flex flex-col items-center gap-2">
            <Icono nombre="alerta" tamano={52} className="text-danger" />
            <p className="text-lg font-bold text-danger">No se pudo cobrar</p>
            {error && (
              <p className="text-xs text-text-secondary text-center max-w-xs">{error}</p>
            )}
          </div>
        )}

        {estado === "cancelado" && (
          <div className="flex flex-col items-center gap-2">
            <Icono nombre="cerrar" tamano={52} className="text-text-secondary" />
            <p className="text-lg font-bold text-text-secondary">Cobro cancelado</p>
          </div>
        )}

        <div className="w-full flex flex-col gap-2 mt-1">
          {enCurso ? (
            <>
              <button
                onClick={() => void cancelar()}
                disabled={yaEnTerminal}
                className={cn(
                  "w-full py-3 rounded-xl text-sm font-bold border transition-colors",
                  "border-border text-text-secondary hover:border-danger hover:text-danger",
                  "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border",
                  "disabled:hover:text-text-secondary"
                )}
              >
                Cancelar cobro
              </button>
              {yaEnTerminal && (
                <p className="text-xs text-text-muted text-center">
                  Para cancelar, salí de la pantalla de cobro en la terminal
                </p>
              )}
            </>
          ) : (
            <button
              onClick={cerrar}
              className={cn(
                "w-full py-3 rounded-xl text-sm font-bold transition-colors",
                estado === "pagado"
                  ? "bg-accent text-white"
                  : "border border-border text-text-secondary hover:text-text-primary"
              )}
            >
              {estado === "pagado" ? "Listo" : "Cerrar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

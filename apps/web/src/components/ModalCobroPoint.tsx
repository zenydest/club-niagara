/**
 * Pantalla de espera mientras la terminal cobra.
 *
 * Bloquea la caja a propósito: mientras la terminal está esperando la tarjeta,
 * el cajero no tiene que poder tocar otra cosa. Se cierra sola cuando el cobro
 * termina bien; si falla, se queda para que se pueda leer el motivo.
 */

import React from "react";
import { cn } from "@niagara/ui";
import { useCobroPointStore } from "@/stores/cobroPointStore";
import { Icono } from "@/components/Icono";

const ARS = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);

export function ModalCobroPoint({ monto, onCerrar }: { monto: number; onCerrar: () => void }) {
  const { estado, orden, error, cancelar, reiniciar } = useCobroPointStore();

  const enCurso = estado === "creando" || estado === "esperando";

  // Una vez que la terminal levantó la orden, MP no deja cancelarla por API:
  // hay que hacerlo en el equipo. Se desactiva el botón en vez de ofrecer algo
  // que va a fallar.
  const yaEnTerminal = orden?.estado === "at_terminal" || orden?.estado === "action_required";

  const cerrar = () => {
    reiniciar();
    onCerrar();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      <div className="relative w-full max-w-sm bg-surface border border-border rounded-2xl p-6 flex flex-col items-center gap-4 text-center">
        <p className="text-3xl font-black text-accent">{ARS(monto)}</p>

        {enCurso && (
          <>
            <Icono nombre="cargando" tamano={40} girando className="text-accent" />
            <p className="text-sm text-text-secondary">
              {estado === "creando"
                ? "Enviando el cobro a la terminal…"
                : yaEnTerminal
                  ? "La terminal está esperando la tarjeta"
                  : "Esperando que la terminal levante la orden…"}
            </p>
          </>
        )}

        {estado === "pagado" && (
          <>
            <Icono nombre="ok" tamano={48} className="text-success" />
            <p className="text-lg font-bold text-success">Pago aprobado</p>
          </>
        )}

        {(estado === "rechazado" || estado === "error") && (
          <>
            <Icono nombre="alerta" tamano={48} className="text-danger" />
            <p className="text-lg font-bold text-danger">No se pudo cobrar</p>
            {error && <p className="text-xs text-text-secondary">{error}</p>}
          </>
        )}

        {estado === "cancelado" && (
          <>
            <Icono nombre="cerrar" tamano={48} className="text-text-secondary" />
            <p className="text-lg font-bold text-text-secondary">Cobro cancelado</p>
          </>
        )}

        <div className="w-full flex flex-col gap-2 mt-1">
          {enCurso ? (
            <>
              <button
                onClick={() => void cancelar()}
                disabled={yaEnTerminal}
                className={cn(
                  "w-full py-3 rounded-xl text-sm font-bold border transition-colors",
                  "border-border text-text-secondary hover:text-danger hover:border-danger/40",
                  "disabled:opacity-40 disabled:cursor-not-allowed"
                )}
              >
                Cancelar cobro
              </button>
              {yaEnTerminal && (
                <p className="text-xs text-text-muted">
                  Ya está en la terminal: cancelalo desde el equipo.
                </p>
              )}
            </>
          ) : (
            <button
              onClick={cerrar}
              className="w-full py-3 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition-all"
            >
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

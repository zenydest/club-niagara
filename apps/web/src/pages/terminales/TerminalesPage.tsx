/**
 * Administración de terminales Mercado Pago Point.
 *
 * Flujo de alta de una terminal:
 *   1. Vincularla a la cuenta de MP desde la app del celular (no se hace acá).
 *   2. "Sincronizar con Mercado Pago" para importarla.
 *   3. Ponerle un alias y asignarla a una barra.
 *   4. Activar modo PDV y **reiniciar la terminal**.
 */

import React, { useEffect, useState } from "react";
import { cn } from "@niagara/ui";
import {
  useTerminalesStore,
  type Terminal,
  type ModoOperacion,
} from "@/stores/terminalesStore";
import { useAuthStore } from "@/stores/authStore";
import { Icono } from "@/components/Icono";

const MODO_CONFIG: Record<ModoOperacion, { label: string; clase: string; ayuda: string }> = {
  PDV: {
    label: "PDV",
    clase: "bg-success/10 text-success border-success/30",
    ayuda: "Integrada: recibe órdenes de cobro desde el sistema. Solo acepta tarjetas.",
  },
  STANDALONE: {
    label: "Standalone",
    clase: "bg-warning/10 text-warning border-warning/30",
    ayuda: "Cobro manual desde la terminal. No recibe órdenes del sistema.",
  },
  UNDEFINED: {
    label: "Sin definir",
    clase: "bg-danger/10 text-danger border-danger/30",
    ayuda: "Mercado Pago no reconoce la configuración de esta terminal.",
  },
};

export function TerminalesPage() {
  const {
    terminales,
    estadoPoint,
    cargando,
    sincronizando,
    error,
    aviso,
    cargar,
    sincronizar,
    limpiarMensajes,
  } = useTerminalesStore();

  const { staff } = useAuthStore();
  const esAdmin = staff?.rol === "admin" || staff?.rol === "encargado";

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Terminales Point</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Cobro con lectores de Mercado Pago
          </p>
        </div>

        {esAdmin && (
          <button
            onClick={() => void sincronizar()}
            disabled={sincronizando}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-semibold bg-lime text-background",
              "hover:opacity-90 active:scale-95 transition-all",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {sincronizando ? "Sincronizando…" : "Sincronizar con Mercado Pago"}
          </button>
        )}
      </div>

      {/* Diagnóstico de la integración */}
      {estadoPoint && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Tarjeta
            titulo="Credenciales"
            valor={estadoPoint.configurado ? "Configuradas" : "Faltantes"}
            alerta={!estadoPoint.configurado}
            detalle={
              estadoPoint.configurado
                ? undefined
                : "Falta MP_ACCESS_TOKEN en la API"
            }
          />
          <Tarjeta
            titulo="Firma del webhook"
            valor={estadoPoint.webhookFirmado ? "Activa" : "Sin firmar"}
            alerta={!estadoPoint.webhookFirmado}
            detalle={
              estadoPoint.webhookFirmado
                ? undefined
                : "Sin MP_WEBHOOK_SECRET cualquiera puede notificar cobros falsos"
            }
          />
          <Tarjeta
            titulo="Listas para cobrar"
            valor={`${estadoPoint.terminalesEnPDV} de ${estadoPoint.terminales}`}
            alerta={estadoPoint.terminales > 0 && estadoPoint.terminalesEnPDV === 0}
            detalle={
              estadoPoint.terminales > 0 && estadoPoint.terminalesEnPDV === 0
                ? "Ninguna terminal está en modo PDV"
                : undefined
            }
          />
        </div>
      )}

      {error && (
        <Mensaje tono="danger" texto={error} onCerrar={limpiarMensajes} />
      )}
      {aviso && <Mensaje tono="info" texto={aviso} onCerrar={limpiarMensajes} />}

      {cargando ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="h-24 bg-surface rounded-xl border border-border animate-pulse"
            />
          ))}
        </div>
      ) : terminales.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center">
          <Icono nombre="terminales" tamano={40} className="mx-auto mb-3 text-text-muted" />
          <p className="text-text-primary font-semibold">No hay terminales cargadas</p>
          <p className="text-sm text-text-secondary mt-2 max-w-md mx-auto">
            Primero vinculá cada terminal a la cuenta de Mercado Pago desde la app
            del celular. Después usá &ldquo;Sincronizar&rdquo; para importarlas acá.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {terminales.map((t) => (
            <FilaTerminal key={t.id} terminal={t} editable={esAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Subcomponentes ───────────────────────────────────────────────

function Tarjeta({
  titulo,
  valor,
  alerta,
  detalle,
}: {
  titulo: string;
  valor: string;
  alerta?: boolean;
  detalle?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        alerta ? "bg-warning/5 border-warning/30" : "bg-surface border-border"
      )}
    >
      <p className="text-xs text-text-secondary font-medium">{titulo}</p>
      <p
        className={cn(
          "text-lg font-bold mt-1",
          alerta ? "text-warning" : "text-text-primary"
        )}
      >
        {valor}
      </p>
      {detalle && <p className="text-xs text-text-muted mt-1">{detalle}</p>}
    </div>
  );
}

function Mensaje({
  tono,
  texto,
  onCerrar,
}: {
  tono: "danger" | "info";
  texto: string;
  onCerrar: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl px-4 py-3 flex items-start justify-between gap-4 border text-sm",
        tono === "danger"
          ? "bg-danger/10 border-danger/30 text-danger"
          : "bg-purple/10 border-purple/30 text-purple-200"
      )}
    >
      <p>{texto}</p>
      <button onClick={onCerrar} className="hover:opacity-70 flex-shrink-0">
        <Icono nombre="cerrar" tamano={16} />
      </button>
    </div>
  );
}

function FilaTerminal({ terminal, editable }: { terminal: Terminal; editable: boolean }) {
  const { actualizar, procesando } = useTerminalesStore();
  const [nombre, setNombre] = useState(terminal.nombre);
  const [editandoNombre, setEditandoNombre] = useState(false);

  const modo = MODO_CONFIG[terminal.operatingMode];

  // El serial es la parte después de "__" y es lo que está impreso en la
  // etiqueta de atrás del equipo — sirve para identificarlo físicamente.
  const serial = terminal.id.split("__")[1] ?? terminal.id;

  const guardarNombre = async () => {
    if (nombre.trim() && nombre !== terminal.nombre) {
      await actualizar(terminal.id, { nombre: nombre.trim() });
    }
    setEditandoNombre(false);
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex-1 min-w-0">
        {editandoNombre && editable ? (
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onBlur={() => void guardarNombre()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void guardarNombre();
              if (e.key === "Escape") {
                setNombre(terminal.nombre);
                setEditandoNombre(false);
              }
            }}
            autoFocus
            className="bg-surface-2 border border-lime/40 rounded-lg px-2 py-1 text-sm font-semibold text-text-primary w-full max-w-xs"
          />
        ) : (
          <button
            onClick={() => editable && setEditandoNombre(true)}
            disabled={!editable}
            className={cn(
              "text-sm font-semibold text-text-primary text-left",
              editable && "hover:text-lime transition-colors"
            )}
            title={editable ? "Click para renombrar" : undefined}
          >
            {terminal.nombre}
          </button>
        )}

        <p className="text-xs text-text-muted mt-1 font-mono">Serie {serial}</p>

        <p className="text-xs text-text-secondary mt-1">
          {terminal.barra ? `Barra: ${terminal.barra.nombre}` : "Sin barra asignada"}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div
          className={cn("px-3 py-1 rounded-full text-xs font-semibold border", modo.clase)}
          title={modo.ayuda}
        >
          {modo.label}
        </div>

        {!terminal.activa && (
          <div className="px-3 py-1 rounded-full text-xs font-semibold bg-surface-2 text-text-muted border border-border">
            Inactiva
          </div>
        )}

        {editable && terminal.operatingMode !== "PDV" && (
          <button
            onClick={() => void actualizar(terminal.id, { activarPDV: true })}
            disabled={procesando}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold border border-lime/40 text-lime",
              "hover:bg-lime/10 transition-colors",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            Activar PDV
          </button>
        )}

        {editable && (
          <button
            onClick={() => void actualizar(terminal.id, { activa: !terminal.activa })}
            disabled={procesando}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium border border-border",
              "text-text-secondary hover:text-text-primary transition-colors",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {terminal.activa ? "Desactivar" : "Activar"}
          </button>
        )}
      </div>
    </div>
  );
}

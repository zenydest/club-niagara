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
  type CobroHuerfano,
} from "@/stores/terminalesStore";
import { useAuthStore } from "@/stores/authStore";
import { useCajaStore } from "@/stores/cajaStore";
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
    huerfanos,
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

  // Las barras se reutilizan del store de caja en vez de duplicar el fetch:
  // es la misma lista y ya está resuelta ahí.
  const cargarBarras = useCajaStore((s) => s.cargarBarras);

  useEffect(() => {
    void cargar();
    void cargarBarras();
  }, [cargar, cargarBarras]);

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
              "px-4 py-2 rounded-xl text-sm font-semibold bg-accent text-white",
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

      {huerfanos.length > 0 && <CobrosHuerfanos cobros={huerfanos} />}

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

/**
 * Cobros aprobados en Mercado Pago sin venta registrada.
 *
 * Solo aparece si hay alguno. Es plata que entró y que el sistema no tiene
 * asentada: pasa si el navegador se cierra o se corta internet justo entre
 * que la terminal aprueba y que la caja guarda la venta.
 *
 * Por ahora es informativo: sirve para cruzar contra lo que reporta Mercado
 * Pago y cargar la venta a mano. No se crea sola porque no hay forma de saber
 * qué productos se vendieron — esa información se perdió con el carrito.
 */
function CobrosHuerfanos({ cobros }: { cobros: CobroHuerfano[] }) {
  const fecha = (iso: string) =>
    new Date(iso).toLocaleString("es-AR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });

  const pesos = (m: string | number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency", currency: "ARS", maximumFractionDigits: 0,
    }).format(Number(m));

  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
      <div className="flex items-start gap-2">
        <Icono nombre="alerta" tamano={18} className="text-warning flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-warning">
            {cobros.length} cobro{cobros.length !== 1 ? "s" : ""} sin venta registrada
          </p>
          <p className="text-xs text-text-secondary mt-0.5">
            La plata entró en Mercado Pago pero la venta no quedó asentada.
            Verificalo contra el resumen de MP y cargá la venta a mano si
            corresponde.
          </p>

          <div className="mt-3 flex flex-col gap-2">
            {cobros.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 flex-wrap text-xs bg-surface border border-border rounded-lg px-3 py-2"
              >
                <span className="font-bold text-text-primary">{pesos(c.monto)}</span>
                <span className="text-text-secondary">{fecha(c.createdAt)}</span>
                {c.terminal?.nombre && (
                  <span className="text-text-secondary">{c.terminal.nombre}</span>
                )}
                {c.mpPaymentId && (
                  <span className="font-mono text-text-muted">
                    Pago {c.mpPaymentId}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
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
  const barras = useCajaStore((s) => s.barras);
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

        <div className="mt-2 flex items-center gap-2">
          <label className="text-xs text-text-secondary" htmlFor={`barra-${terminal.id}`}>
            Barra
          </label>
          {editable ? (
            <select
              id={`barra-${terminal.id}`}
              value={terminal.barraId ?? ""}
              disabled={procesando}
              onChange={(e) =>
                // Cadena vacía = "Puerta / boletería". En la base es `null`, no
                // "": la columna es una FK y "" no es un id válido.
                void actualizar(terminal.id, { barraId: e.target.value || null })
              }
              className={cn(
                "bg-surface-2 border border-border rounded-lg px-2 py-1",
                "text-xs text-text-primary",
                "focus:outline-none focus:border-accent transition-colors",
                "disabled:opacity-40"
              )}
            >
              <option value="">Puerta / boletería</option>
              {barras.map((b) => (
                <option key={b.id} value={b.id}>{b.nombre}</option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-text-primary">
              {terminal.barra?.nombre ?? "Puerta / boletería"}
            </span>
          )}
        </div>

        {editable && barras.length === 0 && (
          <p className="text-xs text-warning mt-1">
            No hay barras cargadas. Creá las barras para poder asignarlas.
          </p>
        )}
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

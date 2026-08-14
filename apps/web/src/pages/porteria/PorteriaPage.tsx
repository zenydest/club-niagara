/**
 * Módulo 2 — Portería / Control de Aforo
 *
 * Funciona offline-first:
 *   - Sin internet: registra ingresos/egresos en cola local (localStorage)
 *   - Con internet: envía directo al servidor y recibe aforo por socket
 *   - Al reconectarse: sincroniza la cola automáticamente
 *
 * Diseñado para tablet/celular del portero en penumbra.
 */

import React, { useEffect, useCallback, useState, useRef } from "react";
import { usePorteriaStore } from "@/stores/porteriaStore";
import type { EventoActivo, ResultadoValidacion } from "@/stores/porteriaStore";
import { EscanerQR } from "@/components/EscanerQR";
import { Icono, type NombreIcono } from "@/components/Icono";
import { cn } from "@niagara/ui";

// ── Subcomponente: escaneo de entradas ──────────────────────────

/** Cuánto queda el resultado en pantalla antes de volver a escanear */
const MS_MOSTRAR_RESULTADO = 2200;

const RESULTADO_CONFIG: Record<
  ResultadoValidacion["resultado"],
  { titulo: string; icono: NombreIcono; clase: string }
> = {
  ok: { titulo: "Adelante", icono: "ok", clase: "bg-success text-white" },
  ya_usada: { titulo: "Ya usada", icono: "cerrar", clase: "bg-danger text-white" },
  no_encontrada: { titulo: "QR inválido", icono: "cerrar", clase: "bg-danger text-white" },
  otro_evento: { titulo: "Otro evento", icono: "alerta", clase: "bg-warning text-background" },
  // Casi siempre es una captura de pantalla vieja: el código ya rotó.
  codigo_vencido: { titulo: "Código vencido", icono: "reloj", clase: "bg-danger text-white" },
  codigo_faltante: { titulo: "Pedí el QR de la app", icono: "qr", clase: "bg-warning text-background" },
  // Reserva de la app sin pagar: no es un rechazo, es "cobrale y pasa".
  impaga: { titulo: "Falta pagar", icono: "efectivo", clase: "bg-warning text-background" },
  // Cancelada: no se cobra en la puerta ni se deja pasar. Si el cliente
  // reclama, se resuelve en la oficina, no en la fila.
  cancelada: { titulo: "Entrada cancelada", icono: "cerrar", clase: "bg-danger text-white" },
  sin_conexion: { titulo: "Sin conexión", icono: "alerta", clase: "bg-warning text-background" },
  error: { titulo: "Error", icono: "alerta", clase: "bg-danger text-white" },
};

function PanelEscaneo() {
  const { validarQR } = usePorteriaStore();
  const [ultimo, setUltimo] = useState<ResultadoValidacion | null>(null);
  const [validando, setValidando] = useState(false);

  // Último QR leído. Se guarda para poder reintentar cobrando, sin pedirle a
  // la persona que vuelva a mostrar la pantalla.
  const ultimoCodigoRef = useRef<string | null>(null);

  const mostrarYReanudar = useCallback((resultado: ResultadoValidacion) => {
    setUltimo(resultado);

    // "Falta pagar" no se autocierra: el portero tiene que decidir si cobra.
    if (resultado.resultado === "impaga") {
      setValidando(true);
      return;
    }

    setTimeout(() => {
      setUltimo(null);
      setValidando(false);
    }, MS_MOSTRAR_RESULTADO);
  }, []);

  const manejarLectura = useCallback(
    async (codigo: string) => {
      if (validando) return;
      setValidando(true);
      ultimoCodigoRef.current = codigo;

      mostrarYReanudar(await validarQR(codigo));
    },
    [validarQR, validando, mostrarYReanudar]
  );

  const cobrarYDejarPasar = useCallback(async () => {
    const codigo = ultimoCodigoRef.current;
    if (!codigo) return;

    mostrarYReanudar(
      await validarQR(codigo, { cobrarEnPuerta: true, metodoPagoPuerta: "efectivo" })
    );
  }, [validarQR, mostrarYReanudar]);

  const cancelarCobro = useCallback(() => {
    setUltimo(null);
    setValidando(false);
  }, []);

  const cfg = ultimo ? RESULTADO_CONFIG[ultimo.resultado] : null;

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div className="relative">
        <EscanerQR onLeer={(c) => void manejarLectura(c)} pausado={validando} />

        {/* El resultado tapa la cámara entero: en la puerta se mira de reojo */}
        {cfg && (
          <div
            className={cn(
              "absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-2",
              cfg.clase
            )}
          >
            <Icono nombre={cfg.icono} tamano={64} />
            <span className="text-2xl font-black">{cfg.titulo}</span>
            {ultimo?.entrada?.clienteNombre && (
              <span className="text-sm opacity-90">{ultimo.entrada.clienteNombre}</span>
            )}
            {ultimo?.entrada?.entradaTipo && (
              <span className="text-xs opacity-75">
                {ultimo.entrada.entradaTipo.nombre}
              </span>
            )}
            {ultimo?.mensaje && !ultimo.entrada && (
              <span className="text-xs opacity-90 px-6 text-center">{ultimo.mensaje}</span>
            )}

            {/* Entrada vieja: pasó sin código rotativo, o sea que una captura
                de pantalla habría funcionado igual. */}
            {ultimo?.sinCodigoRotativo && (
              <span className="mt-2 px-3 py-1 rounded-full bg-black/30 text-xs font-semibold">
                <Icono nombre="alerta" tamano={12} className="inline mr-1 -mt-0.5" />
                QR sin código rotativo
              </span>
            )}

            {/* Reserva de la app: se cobra acá y pasa. El QR no se quemó, así
                que si la persona no tiene la plata puede volver más tarde. */}
            {ultimo?.resultado === "impaga" && (
              <div className="mt-4 flex flex-col items-center gap-3 w-full px-8">
                {ultimo.aCobrar !== undefined && (
                  <span className="text-3xl font-black">
                    {new Intl.NumberFormat("es-AR", {
                      style: "currency",
                      currency: "ARS",
                      maximumFractionDigits: 0,
                    }).format(ultimo.aCobrar)}
                  </span>
                )}

                <button
                  onClick={() => void cobrarYDejarPasar()}
                  className="w-full py-3 rounded-xl bg-background text-white font-black text-sm"
                >
                  Cobré · Dejar pasar
                </button>
                <button
                  onClick={cancelarCobro}
                  className="text-xs font-semibold underline opacity-80"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-text-muted text-center">
        Apuntá al QR de la entrada. El escaneo es automático.
      </p>
    </div>
  );
}

// ── Subcomponente: selector de evento ───────────────────────────
function SelectorEvento({
  eventos,
  onSeleccionar,
}: {
  eventos: EventoActivo[];
  onSeleccionar: (e: EventoActivo) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-12 px-4">
      <div className="text-center">
        <Icono nombre="porteria" tamano={52} className="text-purple" />
        <h2 className="text-2xl font-black text-text-primary mt-4">Seleccioná el evento</h2>
        <p className="text-text-secondary mt-1">¿Para cuál evento vas a controlar el ingreso?</p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-sm">
        {eventos.map((ev) => (
          <button
            key={ev.id}
            onClick={() => onSeleccionar(ev)}
            className="w-full text-left p-4 rounded-2xl bg-surface-2 border border-border hover:border-purple transition-all duration-150 group"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-text-primary group-hover:text-white transition-colors">
                  {ev.nombre}
                </p>
                <p className="text-sm text-text-secondary mt-0.5">
                  {new Date(ev.fechaInicio).toLocaleDateString("es-AR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </p>
              </div>
              <span
                className={cn(
                  "flex-shrink-0 text-xs font-bold px-2 py-1 rounded-lg",
                  ev.estado === "en_vivo"
                    ? "bg-success/20 text-success"
                    : "bg-warning/20 text-warning"
                )}
              >
                {ev.estado === "en_vivo" ? "EN VIVO" : "PREVENTA"}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                <div
                  className="h-full rounded-full bg-neon-ring"
                  style={{
                    width: `${Math.min(100, (ev.aforoActual / ev.capacidad) * 100)}%`,
                    background: "linear-gradient(90deg, #1E50FF, #8B3DFF, #CC0099)",
                  }}
                />
              </div>
              <span className="text-xs text-text-muted whitespace-nowrap">
                {ev.aforoActual} / {ev.capacidad}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Subcomponente: pantalla de aforo principal ───────────────────
function PantallaAforo() {
  const {
    eventoSeleccionado,
    aforo,
    colaOffline,
    online,
    sincronizando,
    error,
    registrarAcceso,
    sincronizarCola,
    seleccionarEvento,
  } = usePorteriaStore();

  // El modo manual sigue siendo el default: funciona offline y no depende de
  // permisos de cámara, así que es el que nunca falla.
  const [modo, setModo] = useState<"manual" | "escaner">("manual");

  if (!aforo || !eventoSeleccionado) return null;

  const porcentaje = Math.min(100, (aforo.aforoActual / aforo.capacidad) * 100);

  // Color del aforo según ocupación
  const colorAforo =
    porcentaje >= 95
      ? "#EF4444"  // rojo: casi lleno
      : porcentaje >= 80
      ? "#F59E0B"  // amarillo: atención
      : "#1E50FF"; // azul: normal

  return (
    <div className="flex flex-col h-full">

      {/* Header del evento */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h2 className="font-black text-text-primary text-lg leading-none">
            {eventoSeleccionado.nombre}
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">
            {new Date(eventoSeleccionado.fechaInicio).toLocaleDateString("es-AR", {
              weekday: "long", day: "numeric", month: "long",
            })}
          </p>
        </div>
        <button
          onClick={() => void seleccionarEvento(eventoSeleccionado)}
          className="text-xs text-text-muted hover:text-text-secondary transition-colors px-2 py-1 rounded-lg hover:bg-surface-2"
        >
          Cambiar
        </button>
      </div>

      {/* Indicador online/offline + cola */}
      <div className="flex items-center gap-2 px-4 py-2">
        <span
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full",
            online
              ? "bg-success/15 text-success"
              : "bg-warning/15 text-warning"
          )}
        >
          <span className={cn(
            "w-1.5 h-1.5 rounded-full",
            online ? "bg-success animate-pulse" : "bg-warning"
          )} />
          {online ? "En línea" : "Sin conexión"}
        </span>

        {colaOffline.length > 0 && (
          <button
            onClick={() => void sincronizarCola()}
            disabled={!online || sincronizando}
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-all",
              online
                ? "bg-purple/20 text-purple-300 hover:bg-purple/30 cursor-pointer"
                : "bg-surface-2 text-text-muted cursor-not-allowed"
            )}
          >
            {sincronizando ? (
              <>⏳ Sincronizando...</>
            ) : (
              <>{colaOffline.length} pendiente{colaOffline.length !== 1 ? "s" : ""} · Sincronizar</>
            )}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 px-4 py-2 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          {error}
        </div>
      )}

      {/* Selector de modo */}
      <div className="px-4 pt-3 grid grid-cols-2 gap-2">
        {(["manual", "escaner"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setModo(m)}
            className={cn(
              "py-2 rounded-xl text-sm font-bold transition-all",
              modo === m
                ? "bg-surface-2 text-text-primary border border-purple/40"
                : "text-text-muted border border-transparent hover:text-text-secondary"
            )}
          >
            {m === "manual" ? "Manual" : "Escanear QR"}
          </button>
        ))}
      </div>

      {modo === "escaner" && <PanelEscaneo />}

      {/* Contador de aforo — ocupa la mayor parte de la pantalla */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 py-8">

        {/* Número grande */}
        <div className="text-center">
          <div
            className="text-[7rem] leading-none font-black tabular-nums"
            style={{ color: colorAforo, textShadow: `0 0 40px ${colorAforo}55` }}
          >
            {aforo.aforoActual}
          </div>
          <div className="text-text-secondary text-xl font-semibold mt-1">
            de {aforo.capacidad}
          </div>
          <div className="text-text-muted text-sm mt-0.5">
            {aforo.disponibles} lugares disponibles
          </div>
        </div>

        {/* Barra de ocupación */}
        <div className="w-full max-w-xs">
          <div className="h-3 rounded-full bg-surface-3 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${porcentaje}%`,
                background: porcentaje >= 95
                  ? "#EF4444"
                  : porcentaje >= 80
                  ? "linear-gradient(90deg, #F59E0B, #EF4444)"
                  : "linear-gradient(90deg, #1E50FF, #8B3DFF)",
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-text-muted mt-1.5">
            <span>{porcentaje.toFixed(0)}% ocupado</span>
            {aforo.lleno && (
              <span className="text-danger font-bold animate-pulse">LLENO</span>
            )}
          </div>
        </div>

        {/* Stats secundarios */}
        <div className="flex gap-6 text-center">
          <div>
            <p className="text-2xl font-black text-success">{aforo.ingresos}</p>
            <p className="text-xs text-text-muted mt-0.5">Ingresos</p>
          </div>
          <div className="w-px bg-border" />
          <div>
            <p className="text-2xl font-black text-danger">{aforo.egresos}</p>
            <p className="text-xs text-text-muted mt-0.5">Egresos</p>
          </div>
        </div>
      </div>

      {/* Botones de acción — grandes, fáciles de tocar */}
      <div className="p-4 pb-8 grid grid-cols-2 gap-4">
        <button
          onClick={() => void registrarAcceso("ingreso")}
          disabled={aforo.lleno}
          className={cn(
            "flex flex-col items-center justify-center gap-2 h-28 rounded-2xl",
            "text-white font-black text-lg transition-all duration-150 active:scale-95",
            aforo.lleno
              ? "bg-surface-2 text-text-muted cursor-not-allowed opacity-50"
              : "shadow-lg active:shadow-none"
          )}
          style={!aforo.lleno ? {
            background: "linear-gradient(135deg, #1E50FF, #8B3DFF)",
            boxShadow: "0 8px 32px rgba(30,80,255,0.4)",
          } : undefined}
        >
          <Icono nombre="ingreso" tamano={30} />
          <span>INGRESO</span>
        </button>

        <button
          onClick={() => void registrarAcceso("egreso")}
          disabled={aforo.aforoActual === 0}
          className={cn(
            "flex flex-col items-center justify-center gap-2 h-28 rounded-2xl",
            "font-black text-lg transition-all duration-150 active:scale-95",
            aforo.aforoActual === 0
              ? "bg-surface-2 text-text-muted cursor-not-allowed opacity-50"
              : "text-white shadow-lg active:shadow-none"
          )}
          style={aforo.aforoActual > 0 ? {
            background: "linear-gradient(135deg, #7B3FFF, #CC0099)",
            boxShadow: "0 8px 32px rgba(204,0,153,0.3)",
          } : undefined}
        >
          <Icono nombre="egreso" tamano={30} />
          <span>EGRESO</span>
        </button>
      </div>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────
export function PorteriaPage() {
  const {
    eventosActivos,
    eventoSeleccionado,
    cargando,
    cargarEventos,
    seleccionarEvento,
    setOnline,
  } = usePorteriaStore();

  // Cargar eventos activos al montar
  useEffect(() => {
    void cargarEventos();
  }, [cargarEventos]);

  // Detectar cambios de conectividad
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setOnline]);

  const handleSeleccionar = useCallback(
    (ev: EventoActivo) => void seleccionarEvento(ev),
    [seleccionarEvento]
  );

  if (cargando) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="flex gap-1.5">
          {["#1E50FF", "#8B3DFF", "#CC0099"].map((c, i) => (
            <span
              key={c}
              className="w-2 h-2 rounded-full animate-bounce"
              style={{ background: c, animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
        <p className="text-text-secondary text-sm">Cargando eventos...</p>
      </div>
    );
  }

  if (eventosActivos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-4">
        <Icono nombre="calendario" tamano={52} className="text-text-muted" />
        <div>
          <p className="text-text-primary font-bold">No hay eventos activos</p>
          <p className="text-text-secondary text-sm mt-1">
            Creá un evento en estado "En vivo" o "Preventa" para usar portería.
          </p>
        </div>
        <button
          onClick={() => void cargarEventos()}
          className="text-sm text-purple-300 hover:text-white transition-colors underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  // Si no hay evento seleccionado, mostrar selector
  if (!eventoSeleccionado) {
    return (
      <SelectorEvento
        eventos={eventosActivos}
        onSeleccionar={handleSeleccionar}
      />
    );
  }

  // Pantalla principal de portería
  return (
    <div className="max-w-sm mx-auto">
      <PantallaAforo />
    </div>
  );
}

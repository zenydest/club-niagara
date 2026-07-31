/**
 * Módulo 8 — Guardarropa
 * Offline-first: registra prendas incluso sin internet, sincroniza al reconectar.
 */

import React, { useState, useEffect, useRef } from "react";
import { cn } from "@niagara/ui";
import { useGuardarropaStore, type TicketGuardarropa } from "@/stores/guardarropaStore";

// ── Helpers ───────────────────────────────────────────────────────

function horaCorta(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

// ── Componente principal ──────────────────────────────────────────

export function GuardarropaPage() {
  const {
    tickets, cola, siguienteNumero,
    cargando, procesando, error, online,
    cargarTickets, cargarSiguienteNumero,
    registrarPrenda, entregar, cancelar,
    setOnline, limpiarError,
  } = useGuardarropaStore();

  const [busqueda, setBusqueda] = useState("");
  const [tab, setTab] = useState<"activos" | "entregados">("activos");
  const [formAbierto, setFormAbierto] = useState(false);

  // Detectar online/offline
  useEffect(() => {
    const onOnline  = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [setOnline]);

  useEffect(() => {
    void cargarTickets();
    void cargarSiguienteNumero();
  }, [cargarTickets, cargarSiguienteNumero]);

  const filtrados = tickets.filter((t) => {
    const activo = tab === "activos" ? !t.entregado : t.entregado;
    if (!activo) return false;
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    // El `?? false` convierte el `boolean | undefined` que devuelve el
    // encadenamiento opcional en un boolean. Se mantiene `||` a propósito:
    // acá se busca "alguna coincidencia", que no es lo que hace `??`.
    return (
      String(t.numeroTicket).includes(q) ||
      (t.clienteNombre?.toLowerCase().includes(q) ?? false) ||
      (t.descripcion?.toLowerCase().includes(q) ?? false)
    );
  });

  const pendientes = tickets.filter((t) => !t.entregado).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Guardarropa</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {pendientes} prenda{pendientes !== 1 ? "s" : ""} sin entregar
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Indicador online/offline + cola */}
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border",
            online
              ? "bg-green-500/10 border-green-500/30 text-green-400"
              : "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
          )}>
            <div className={cn("w-1.5 h-1.5 rounded-full", online ? "bg-green-400" : "bg-yellow-400 animate-pulse")} />
            {online ? "En línea" : "Sin conexión"}
            {cola.length > 0 && (
              <span className="bg-yellow-400 text-black rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                {cola.length} pendiente{cola.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <button
            onClick={() => setFormAbierto(true)}
            className="px-4 py-2 bg-accent text-black rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors"
          >
            + Registrar prenda
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-danger">{error}</p>
          <button onClick={limpiarError} className="text-danger ml-4">✕</button>
        </div>
      )}

      {/* Búsqueda rápida por número */}
      <BusquedaEntrega
        tickets={tickets.filter((t) => !t.entregado)}
        onEntregar={entregar}
        procesando={procesando}
      />

      {/* Tabs + filtro */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-surface-2 rounded-xl p-1 w-fit">
          {(["activos", "entregados"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                tab === t ? "bg-accent text-black shadow" : "text-text-secondary hover:text-text-primary"
              )}
            >
              {t === "activos" ? `🧥 Sin entregar (${tickets.filter(x => !x.entregado).length})` : `✅ Entregados (${tickets.filter(x => x.entregado).length})`}
            </button>
          ))}
        </div>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por número, nombre o descripción..."
          className={cn(inputCls, "flex-1")}
        />
      </div>

      {/* Lista de tickets */}
      {cargando ? (
        <Skeleton />
      ) : filtrados.length === 0 ? (
        <div className="py-16 text-center text-text-secondary">
          <span className="text-4xl block mb-3">🧥</span>
          {tab === "activos" ? "No hay prendas sin entregar" : "No hay prendas entregadas"}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtrados.map((ticket) => (
            <TarjetaTicket
              key={ticket.id}
              ticket={ticket}
              onEntregar={() => void entregar(ticket.id)}
              onCancelar={() => void cancelar(ticket.id)}
              procesando={procesando}
            />
          ))}
        </div>
      )}

      {/* Modal registrar prenda */}
      {formAbierto && (
        <ModalRegistrar
          siguienteNumero={siguienteNumero}
          onRegistrar={async (datos) => {
            await registrarPrenda(datos);
            setFormAbierto(false);
          }}
          onCerrar={() => setFormAbierto(false)}
          procesando={procesando}
        />
      )}
    </div>
  );
}

// ── Búsqueda rápida para entrega ──────────────────────────────────

function BusquedaEntrega({ tickets, onEntregar, procesando }: {
  tickets: TicketGuardarropa[];
  onEntregar: (id: string) => Promise<boolean>;
  procesando: boolean;
}) {
  const [numero, setNumero] = useState("");
  const [resultado, setResultado] = useState<TicketGuardarropa | null | "no_encontrado">(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const buscar = () => {
    const n = Number(numero);
    if (!n) return;
    const ticket = tickets.find((t) => t.numeroTicket === n);
    setResultado(ticket ?? "no_encontrado");
  };

  const confirmarEntrega = async () => {
    if (!resultado || resultado === "no_encontrado") return;
    await onEntregar(resultado.id);
    setResultado(null);
    setNumero("");
    inputRef.current?.focus();
  };

  return (
    <div className="bg-surface rounded-2xl border border-border p-5">
      <p className="text-sm font-semibold text-text-secondary mb-3">🔍 Entrega rápida por número</p>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="number"
          value={numero}
          onChange={(e) => { setNumero(e.target.value); setResultado(null); }}
          onKeyDown={(e) => e.key === "Enter" && buscar()}
          placeholder="Número de ticket"
          className={cn(inputCls, "w-40 text-lg font-bold text-center")}
          autoFocus
        />
        <button
          onClick={buscar}
          className="px-4 py-2 bg-surface-2 border border-border rounded-xl text-sm hover:border-accent transition-colors"
        >
          Buscar
        </button>
        {resultado && resultado !== "no_encontrado" && (
          <button
            onClick={() => void confirmarEntrega()}
            disabled={procesando}
            className="flex-1 py-2 bg-accent text-black rounded-xl text-sm font-bold hover:bg-accent/90 transition-colors disabled:opacity-60"
          >
            ✓ Entregar #{resultado.numeroTicket}
            {resultado.clienteNombre && ` — ${resultado.clienteNombre}`}
          </button>
        )}
      </div>

      {resultado === "no_encontrado" && (
        <p className="text-sm text-danger mt-2">⚠️ No se encontró el ticket #{numero} entre las prendas activas</p>
      )}
      {resultado && resultado !== "no_encontrado" && (
        <div className="mt-3 bg-accent/5 border border-accent/20 rounded-xl p-3 text-sm">
          <p className="font-semibold text-accent">Ticket #{resultado.numeroTicket}</p>
          {resultado.clienteNombre && <p className="text-text-secondary">👤 {resultado.clienteNombre}</p>}
          {resultado.descripcion && <p className="text-text-secondary">🧥 {resultado.descripcion}</p>}
        </div>
      )}
    </div>
  );
}

// ── Tarjeta de ticket ─────────────────────────────────────────────

function TarjetaTicket({ ticket, onEntregar, onCancelar, procesando }: {
  ticket: TicketGuardarropa;
  onEntregar: () => void;
  onCancelar: () => void;
  procesando: boolean;
}) {
  return (
    <div className={cn(
      "bg-surface rounded-2xl border p-4 flex flex-col gap-3 relative",
      ticket.entregado ? "border-border opacity-60" : "border-border hover:border-accent/40 transition-colors",
      ticket._offline && "border-yellow-500/40"
    )}>
      {/* Número grande */}
      <div className="flex items-start justify-between">
        <div className={cn(
          "w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-bold",
          ticket.entregado ? "bg-surface-2 text-text-secondary" : "bg-accent/10 text-accent"
        )}>
          {ticket.numeroTicket}
        </div>
        {ticket._offline && (
          <span className="text-[10px] bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 px-2 py-0.5 rounded-lg">
            Pendiente sync
          </span>
        )}
        {ticket.entregado && (
          <span className="text-[10px] bg-green-500/10 border border-green-500/30 text-green-400 px-2 py-0.5 rounded-lg">
            Entregado
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1">
        {ticket.clienteNombre && (
          <p className="text-sm font-medium text-text-primary">{ticket.clienteNombre}</p>
        )}
        {ticket.descripcion && (
          <p className="text-xs text-text-secondary mt-0.5">{ticket.descripcion}</p>
        )}
        <p className="text-xs text-text-secondary mt-1">{horaCorta(ticket.createdAt)}</p>
      </div>

      {/* Acciones */}
      {!ticket.entregado && (
        <div className="flex gap-2">
          <button
            onClick={onEntregar}
            disabled={procesando || ticket._offline}
            className="flex-1 py-2 bg-accent text-black rounded-xl text-xs font-bold hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            ✓ Entregar
          </button>
          <button
            onClick={onCancelar}
            disabled={procesando}
            className="px-3 py-2 text-danger bg-danger/10 border border-danger/20 rounded-xl text-xs hover:bg-danger/20 transition-colors"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ── Modal registrar prenda ────────────────────────────────────────

function ModalRegistrar({ siguienteNumero, onRegistrar, onCerrar, procesando }: {
  siguienteNumero: number;
  onRegistrar: (datos: { numeroTicket?: number; descripcion?: string | null; clienteNombre?: string | null }) => Promise<void>;
  onCerrar: () => void;
  procesando: boolean;
}) {
  const [numero, setNumero] = useState(String(siguienteNumero));
  const [descripcion, setDescripcion] = useState("");
  const [nombre, setNombre] = useState("");
  const [modoAuto, setModoAuto] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onRegistrar({
      numeroTicket: modoAuto ? undefined : Number(numero),
      descripcion: descripcion.trim() || null,
      clienteNombre: nombre.trim() || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCerrar} />
      <div className="relative bg-surface border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-text-primary">Registrar prenda</h2>
          <button onClick={onCerrar} className="text-text-secondary text-xl">✕</button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          {/* Número de ticket */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-text-secondary">Número de percha</label>
              <button
                type="button"
                onClick={() => setModoAuto(!modoAuto)}
                className="text-xs text-accent hover:underline"
              >
                {modoAuto ? "Ingresar manual" : "Auto (#" + siguienteNumero + ")"}
              </button>
            </div>
            {modoAuto ? (
              <div className="bg-accent/10 border border-accent/30 rounded-xl px-4 py-3 text-center">
                <span className="text-3xl font-bold text-accent">#{siguienteNumero}</span>
                <p className="text-xs text-text-secondary mt-1">Número automático</p>
              </div>
            ) : (
              <input
                type="number" min={1}
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                className={cn(inputCls, "text-xl font-bold text-center")}
                required
                autoFocus
              />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary">Nombre del cliente</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Opcional"
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary">Descripción de la prenda</label>
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: Campera negra, mochila azul..."
              className={inputCls}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onCerrar} className={btnSecundario}>
              Cancelar
            </button>
            <button type="submit" disabled={procesando} className={btnPrimario}>
              {procesando ? "Registrando..." : "Registrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Shared UI ─────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="h-36 bg-surface rounded-2xl border border-border animate-pulse" />
      ))}
    </div>
  );
}

const inputCls =
  "w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent transition-colors";

const btnPrimario =
  "flex-1 py-2.5 bg-accent text-black rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

const btnSecundario =
  "flex-1 py-2.5 bg-surface-2 border border-border text-text-secondary rounded-xl text-sm hover:border-text-secondary transition-colors";

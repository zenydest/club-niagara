/**
 * Módulo 6 — VIP + Reservas
 *
 * Dos pestañas:
 *  - Mapa: canvas drag & drop de mesas, click para ver/crear reserva
 *  - Reservas: lista filtrable de todas las reservas
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@niagara/ui";
import {
  useVipStore,
  ESTADO_MESA_CONFIG,
  ESTADO_RESERVA_CONFIG,
  type MesaVip,
  type Reserva,
  type EstadoMesa,
  type EstadoReserva,
} from "@/stores/vipStore";

// ── Tipos locales ─────────────────────────────────────────────────

type Tab = "mapa" | "reservas";

// ── Componente principal ──────────────────────────────────────────

export function VIPPage() {
  const [tab, setTab] = useState<Tab>("mapa");

  const {
    mesas, reservas,
    cargando, cargandoReservas, error, errorOperacion,
    cargarMesas, cargarReservas, limpiarError,
  } = useVipStore();

  useEffect(() => {
    void cargarMesas();
    void cargarReservas();
  }, [cargarMesas, cargarReservas]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">VIP & Reservas</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {mesas.length} mesas · {reservas.filter((r) => r.estado === "confirmada" || r.estado === "pendiente").length} reservas activas
          </p>
        </div>
        <BotonCrearMesa />
      </div>

      {/* Error global */}
      {(error ?? errorOperacion) && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-danger">{error ?? errorOperacion}</p>
          <button onClick={limpiarError} className="text-danger hover:opacity-70 ml-4">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-2 rounded-xl p-1 w-fit">
        {(["mapa", "reservas"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-5 py-2 rounded-lg text-sm font-medium transition-all",
              tab === t
                ? "bg-accent text-black shadow"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            {t === "mapa" ? "🗺️ Mapa de mesas" : "📋 Reservas"}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === "mapa" ? (
        <MapaMesas mesas={mesas} cargando={cargando} />
      ) : (
        <ListaReservas reservas={reservas} cargando={cargandoReservas} mesas={mesas} />
      )}
    </div>
  );
}

// ── Botón crear mesa ──────────────────────────────────────────────

function BotonCrearMesa() {
  const [abierto, setAbierto] = useState(false);
  const { crearMesa, procesando } = useVipStore();

  const [numero, setNumero] = useState("");
  const [sector, setSector] = useState("");
  const [capacidad, setCapacidad] = useState("4");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const mesa = await crearMesa({
      numero: numero.trim(),
      sector: sector.trim() || null,
      capacidad: Number(capacidad),
      posX: 20 + Math.random() * 60,
      posY: 20 + Math.random() * 60,
    });
    if (mesa) {
      setNumero(""); setSector(""); setCapacidad("4");
      setAbierto(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="flex items-center gap-2 px-4 py-2 bg-accent text-black rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors"
      >
        <span>+</span> Nueva mesa
      </button>

      {abierto && (
        <Modal titulo="Nueva mesa VIP" onCerrar={() => setAbierto(false)}>
          <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
            <Campo label="Número / nombre *" required>
              <input
                value={numero} onChange={(e) => setNumero(e.target.value)}
                placeholder="Ej: 1, A-5, VIP Terraza"
                className={inputCls}
                required
              />
            </Campo>
            <Campo label="Sector (opcional)">
              <input
                value={sector} onChange={(e) => setSector(e.target.value)}
                placeholder="Ej: Terraza, Interior, Balcón"
                className={inputCls}
              />
            </Campo>
            <Campo label="Capacidad *">
              <input
                type="number" min={1} max={50}
                value={capacidad} onChange={(e) => setCapacidad(e.target.value)}
                className={inputCls}
                required
              />
            </Campo>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setAbierto(false)} className={btnSecundario}>
                Cancelar
              </button>
              <button type="submit" disabled={procesando} className={btnPrimario}>
                {procesando ? "Creando..." : "Crear mesa"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ── Mapa de mesas ─────────────────────────────────────────────────

interface MapaMesasProps {
  mesas: MesaVip[];
  cargando: boolean;
}

function MapaMesas({ mesas, cargando }: MapaMesasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [mesaSeleccionada, setMesaSeleccionada] = useState<MesaVip | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const { moverMesa } = useVipStore();

  // Drag & drop con posición relativa al contenedor (en %)
  const handleMouseDown = useCallback((e: React.MouseEvent, mesa: MesaVip) => {
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const offsetX = e.clientX - rect.left - (mesa.posX / 100) * rect.width;
    const offsetY = e.clientY - rect.top - (mesa.posY / 100) * rect.height;
    setDragging(mesa.id);
    setDragOffset({ x: offsetX, y: offsetY });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rawX = ((e.clientX - rect.left - dragOffset.x) / rect.width) * 100;
    const rawY = ((e.clientY - rect.top - dragOffset.y) / rect.height) * 100;
    const posX = Math.max(2, Math.min(95, rawX));
    const posY = Math.max(2, Math.min(92, rawY));
    // Actualización optimista en el store
    useVipStore.getState().actualizarMesaSocket({ id: dragging, posX, posY });
  }, [dragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    if (!dragging) return;
    const mesa = useVipStore.getState().mesas.find((m) => m.id === dragging);
    if (mesa) void moverMesa(mesa.id, mesa.posX, mesa.posY);
    setDragging(null);
  }, [dragging, moverMesa]);

  const handleTouchMove = useCallback((e: React.TouchEvent, mesaId: string) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const touch = e.touches[0];
    if (!touch) return;
    const posX = Math.max(2, Math.min(95, ((touch.clientX - rect.left) / rect.width) * 100));
    const posY = Math.max(2, Math.min(92, ((touch.clientY - rect.top) / rect.height) * 100));
    useVipStore.getState().actualizarMesaSocket({ id: mesaId, posX, posY });
  }, []);

  const handleTouchEnd = useCallback((mesaId: string) => {
    const mesa = useVipStore.getState().mesas.find((m) => m.id === mesaId);
    if (mesa) void moverMesa(mesa.id, mesa.posX, mesa.posY);
  }, [moverMesa]);

  if (cargando) return <Skeleton />;

  if (mesas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-text-secondary">
        <span className="text-5xl">🪑</span>
        <p className="text-lg font-medium">No hay mesas creadas</p>
        <p className="text-sm">Hacé click en "Nueva mesa" para empezar.</p>
      </div>
    );
  }

  return (
    <div className="flex gap-6 flex-col lg:flex-row">
      {/* Canvas de mesas */}
      <div className="flex-1">
        <div className="mb-3 flex items-center gap-4 flex-wrap">
          {(Object.entries(ESTADO_MESA_CONFIG) as [EstadoMesa, typeof ESTADO_MESA_CONFIG[EstadoMesa]][]).map(([estado, cfg]) => (
            <div key={estado} className="flex items-center gap-1.5 text-xs text-text-secondary">
              <div className={cn("w-2.5 h-2.5 rounded-full", cfg.dot)} />
              <span>{cfg.label}</span>
            </div>
          ))}
          <span className="text-xs text-text-secondary ml-2 hidden sm:block">· Arrastrá las mesas para reposicionarlas</span>
        </div>

        <div
          ref={canvasRef}
          className="relative w-full bg-surface rounded-2xl border border-border overflow-hidden select-none"
          style={{ height: "520px" }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Grid decorativo */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>

          {/* Mesas */}
          {mesas.map((mesa) => {
            const cfg = ESTADO_MESA_CONFIG[mesa.estado];
            const isDragging = dragging === mesa.id;
            return (
              <div
                key={mesa.id}
                className={cn(
                  "absolute flex flex-col items-center justify-center cursor-grab active:cursor-grabbing",
                  "rounded-xl border-2 transition-shadow",
                  cfg.bg, cfg.border,
                  isDragging && "shadow-2xl scale-110 z-50",
                  mesaSeleccionada?.id === mesa.id && "ring-2 ring-accent"
                )}
                style={{
                  left: `${mesa.posX}%`,
                  top: `${mesa.posY}%`,
                  transform: "translate(-50%, -50%)",
                  width: "80px",
                  height: "80px",
                  zIndex: isDragging ? 50 : 10,
                  touchAction: "none",
                }}
                onMouseDown={(e) => handleMouseDown(e, mesa)}
                onTouchMove={(e) => handleTouchMove(e, mesa.id)}
                onTouchEnd={() => handleTouchEnd(mesa.id)}
                onClick={() => !isDragging && setMesaSeleccionada(mesa)}
              >
                <span className="text-xs font-bold text-text-primary leading-none">{mesa.numero}</span>
                {mesa.sector && (
                  <span className="text-[10px] text-text-secondary mt-0.5 truncate max-w-[70px] text-center">
                    {mesa.sector}
                  </span>
                )}
                <span className="text-[10px] text-text-secondary mt-1">👥 {mesa.capacidad}</span>
                {mesa.reservaActiva && (
                  <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-yellow-400 rounded-full border-2 border-background" />
                )}
                {/* Indicador de estado */}
                <div className={cn("absolute bottom-1.5 w-1.5 h-1.5 rounded-full", cfg.dot)} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Panel lateral — detalle mesa seleccionada */}
      {mesaSeleccionada && (
        <PanelMesa
          mesa={mesaSeleccionada}
          onCerrar={() => setMesaSeleccionada(null)}
        />
      )}
    </div>
  );
}

// ── Panel lateral de mesa ─────────────────────────────────────────

function PanelMesa({ mesa, onCerrar }: { mesa: MesaVip; onCerrar: () => void }) {
  const mesaActual = useVipStore((s) => s.mesas.find((m) => m.id === mesa.id)) ?? mesa;
  const { cambiarEstadoMesa, eliminarMesa, crearReserva, procesando } = useVipStore();
  const [vistaReserva, setVistaReserva] = useState(false);
  const cfg = ESTADO_MESA_CONFIG[mesaActual.estado];

  const handleEliminar = async () => {
    if (!confirm(`¿Eliminar la mesa "${mesaActual.numero}"?`)) return;
    const ok = await eliminarMesa(mesaActual.id);
    if (ok) onCerrar();
  };

  return (
    <div className="w-full lg:w-80 bg-surface rounded-2xl border border-border p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-text-primary">Mesa {mesaActual.numero}</h3>
          {mesaActual.sector && <p className="text-xs text-text-secondary">{mesaActual.sector}</p>}
        </div>
        <button onClick={onCerrar} className="text-text-secondary hover:text-text-primary text-lg leading-none">✕</button>
      </div>

      {/* Chips de info */}
      <div className="flex gap-2 flex-wrap">
        <span className={cn("px-2.5 py-1 rounded-lg text-xs font-medium border", cfg.color, cfg.bg, cfg.border)}>
          {cfg.label}
        </span>
        <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-surface-2 border border-border text-text-secondary">
          👥 {mesaActual.capacidad} personas
        </span>
      </div>

      {/* Reserva activa */}
      {mesaActual.reservaActiva && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
          <p className="text-xs font-semibold text-yellow-400 mb-1">Reserva activa</p>
          <p className="text-sm font-medium text-text-primary">{mesaActual.reservaActiva.clienteNombre}</p>
          <p className="text-xs text-text-secondary">{mesaActual.reservaActiva.cantidadPersonas} personas</p>
          {mesaActual.reservaActiva.montoSena && (
            <p className="text-xs text-accent mt-1">Seña: ${mesaActual.reservaActiva.montoSena.toLocaleString("es-AR")}</p>
          )}
        </div>
      )}

      {/* Cambiar estado */}
      <div>
        <p className="text-xs text-text-secondary mb-2 font-medium">Cambiar estado</p>
        <div className="grid grid-cols-2 gap-2">
          {(["libre", "reservada", "ocupada", "bloqueada"] as EstadoMesa[]).map((estado) => {
            const c = ESTADO_MESA_CONFIG[estado];
            return (
              <button
                key={estado}
                disabled={mesaActual.estado === estado || procesando}
                onClick={() => void cambiarEstadoMesa(mesaActual.id, estado)}
                className={cn(
                  "px-2 py-1.5 rounded-lg text-xs font-medium border transition-all",
                  mesaActual.estado === estado
                    ? cn(c.color, c.bg, c.border)
                    : "text-text-secondary border-border hover:border-text-secondary",
                  "disabled:opacity-60 disabled:cursor-not-allowed"
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Nueva reserva */}
      {!vistaReserva ? (
        <button
          onClick={() => setVistaReserva(true)}
          className="w-full py-2 bg-accent/10 border border-accent/30 rounded-xl text-sm font-semibold text-accent hover:bg-accent/20 transition-colors"
        >
          + Nueva reserva en esta mesa
        </button>
      ) : (
        <FormReservaRapida
          mesaId={mesaActual.id}
          onCrear={async (datos) => {
            const r = await crearReserva({ ...datos, mesaVipId: mesaActual.id });
            if (r) setVistaReserva(false);
          }}
          onCancelar={() => setVistaReserva(false)}
        />
      )}

      {/* Eliminar */}
      <button
        onClick={() => void handleEliminar()}
        className="text-xs text-danger hover:text-danger/80 transition-colors mt-auto"
      >
        Eliminar mesa
      </button>
    </div>
  );
}

// ── Formulario rápido de reserva ──────────────────────────────────

interface FormReservaRapidaProps {
  mesaId?: string;
  onCrear: (datos: {
    clienteNombre: string;
    clienteTelefono?: string | null;
    cantidadPersonas: number;
    nota?: string | null;
    montoSena?: number | null;
  }) => Promise<void>;
  onCancelar: () => void;
}

function FormReservaRapida({ onCrear, onCancelar }: FormReservaRapidaProps) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [personas, setPersonas] = useState("2");
  const [sena, setSena] = useState("");
  const [nota, setNota] = useState("");
  const { procesando } = useVipStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCrear({
      clienteNombre: nombre.trim(),
      clienteTelefono: telefono.trim() || null,
      cantidadPersonas: Number(personas),
      montoSena: sena ? Number(sena) : null,
      nota: nota.trim() || null,
    });
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3 border-t border-border pt-4">
      <p className="text-xs font-semibold text-text-primary">Nueva reserva</p>
      <input
        value={nombre} onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre del cliente *" className={inputCls} required
      />
      <input
        value={telefono} onChange={(e) => setTelefono(e.target.value)}
        placeholder="Teléfono" className={inputCls}
      />
      <div className="flex gap-2">
        <input
          type="number" min={1} max={50}
          value={personas} onChange={(e) => setPersonas(e.target.value)}
          placeholder="Personas" className={cn(inputCls, "w-24")} required
        />
        <input
          type="number" min={0}
          value={sena} onChange={(e) => setSena(e.target.value)}
          placeholder="Seña $" className={inputCls}
        />
      </div>
      <textarea
        value={nota} onChange={(e) => setNota(e.target.value)}
        placeholder="Notas..." rows={2}
        className={cn(inputCls, "resize-none")}
      />
      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} className={cn(btnSecundario, "flex-1 text-xs")}>
          Cancelar
        </button>
        <button type="submit" disabled={procesando} className={cn(btnPrimario, "flex-1 text-xs")}>
          {procesando ? "..." : "Reservar"}
        </button>
      </div>
    </form>
  );
}

// ── Lista de reservas ─────────────────────────────────────────────

interface ListaReservasProps {
  reservas: Reserva[];
  cargando: boolean;
  mesas: MesaVip[];
}

function ListaReservas({ reservas, cargando, mesas }: ListaReservasProps) {
  const { cambiarEstadoReserva, eliminarReserva, crearReserva, procesando } = useVipStore();
  const [filtroEstado, setFiltroEstado] = useState<EstadoReserva | "todas">("todas");
  const [busqueda, setBusqueda] = useState("");
  const [modalNuevaReserva, setModalNuevaReserva] = useState(false);

  const filtradas = reservas.filter((r) => {
    if (filtroEstado !== "todas" && r.estado !== filtroEstado) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      // Ver nota en GuardarropaPage: `|| ` es lo correcto para "alguna
      // coincidencia"; el `?? false` solo normaliza el opcional a boolean.
      return (
        r.clienteNombre.toLowerCase().includes(q) ||
        (r.clienteTelefono?.toLowerCase().includes(q) ?? false) ||
        (r.mesaVip?.numero.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  if (cargando) return <Skeleton />;

  return (
    <div className="flex flex-col gap-4">
      {/* Controles */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, teléfono o mesa..."
          className={cn(inputCls, "flex-1")}
        />
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as EstadoReserva | "todas")}
          className={cn(inputCls, "w-full sm:w-40")}
        >
          <option value="todas">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="confirmada">Confirmada</option>
          <option value="cancelada">Cancelada</option>
          <option value="completada">Completada</option>
        </select>
        <button
          onClick={() => setModalNuevaReserva(true)}
          className="px-4 py-2 bg-accent text-black rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors whitespace-nowrap"
        >
          + Nueva reserva
        </button>
      </div>

      {/* Contadores por estado */}
      <div className="flex gap-3 flex-wrap">
        {(["pendiente", "confirmada", "cancelada", "completada"] as EstadoReserva[]).map((estado) => {
          const count = reservas.filter((r) => r.estado === estado).length;
          const cfg = ESTADO_RESERVA_CONFIG[estado];
          return (
            <button
              key={estado}
              onClick={() => setFiltroEstado(filtroEstado === estado ? "todas" : estado)}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-medium transition-colors",
                filtroEstado === estado ? cn(cfg.color, cfg.bg) : "text-text-secondary bg-surface-2",
              )}
            >
              {cfg.label} · {count}
            </button>
          );
        })}
      </div>

      {/* Lista */}
      {filtradas.length === 0 ? (
        <div className="py-12 text-center text-text-secondary">
          {busqueda || filtroEstado !== "todas" ? "No hay reservas con ese filtro" : "No hay reservas aún"}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtradas.map((reserva) => (
            <TarjetaReserva
              key={reserva.id}
              reserva={reserva}
              onCambiarEstado={(estado) => void cambiarEstadoReserva(reserva.id, estado)}
              onEliminar={() => void eliminarReserva(reserva.id)}
              procesando={procesando}
            />
          ))}
        </div>
      )}

      {/* Modal nueva reserva */}
      {modalNuevaReserva && (
        <Modal titulo="Nueva reserva" onCerrar={() => setModalNuevaReserva(false)}>
          <FormReservaCompleta
            mesas={mesas}
            onCrear={async (datos) => {
              const r = await crearReserva(datos);
              if (r) setModalNuevaReserva(false);
            }}
            onCancelar={() => setModalNuevaReserva(false)}
          />
        </Modal>
      )}
    </div>
  );
}

// ── Tarjeta de reserva ────────────────────────────────────────────

interface TarjetaReservaProps {
  reserva: Reserva;
  onCambiarEstado: (estado: EstadoReserva) => void;
  onEliminar: () => void;
  procesando: boolean;
}

function TarjetaReserva({ reserva, onCambiarEstado, onEliminar, procesando }: TarjetaReservaProps) {
  const [expandida, setExpandida] = useState(false);
  const cfg = ESTADO_RESERVA_CONFIG[reserva.estado];

  const fecha = new Date(reserva.createdAt).toLocaleDateString("es-AR", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  });

  const transicionesValidas: Record<EstadoReserva, EstadoReserva[]> = {
    pendiente:  ["confirmada", "cancelada"],
    confirmada: ["completada", "cancelada"],
    cancelada:  [],
    completada: [],
  };

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      {/* Fila principal */}
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-surface-2/30 transition-colors"
        onClick={() => setExpandida(!expandida)}
      >
        {/* Indicador estado */}
        <div className={cn("w-1 self-stretch rounded-full flex-shrink-0", cfg.bg.replace("bg-", "bg-").replace("/10", ""))} />

        {/* Info cliente */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-text-primary">{reserva.clienteNombre}</span>
            <span className={cn("px-2 py-0.5 rounded text-[11px] font-medium", cfg.color, cfg.bg)}>
              {cfg.label}
            </span>
            {reserva.mesaVip && (
              <span className="text-xs text-text-secondary bg-surface-2 px-2 py-0.5 rounded">
                Mesa {reserva.mesaVip.numero}
                {reserva.mesaVip.sector && ` · ${reserva.mesaVip.sector}`}
              </span>
            )}
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            {reserva.cantidadPersonas} personas · {fecha}
            {reserva.clienteTelefono && ` · 📞 ${reserva.clienteTelefono}`}
          </p>
        </div>

        {/* Seña */}
        {reserva.montoSena && (
          <div className="text-right hidden sm:block">
            <p className="text-xs text-text-secondary">Seña</p>
            <p className="text-sm font-bold text-accent">${reserva.montoSena.toLocaleString("es-AR")}</p>
          </div>
        )}

        <span className="text-text-secondary text-sm">{expandida ? "▲" : "▼"}</span>
      </div>

      {/* Expandido */}
      {expandida && (
        <div className="border-t border-border px-4 py-3 flex flex-col gap-3">
          {reserva.nota && (
            <p className="text-sm text-text-secondary italic">📝 {reserva.nota}</p>
          )}
          {reserva.evento && (
            <p className="text-xs text-text-secondary">Evento: <span className="text-text-primary">{reserva.evento.nombre}</span></p>
          )}
          {reserva.montoSena && (
            <p className="text-sm text-accent font-medium">Seña cobrada: ${reserva.montoSena.toLocaleString("es-AR")}</p>
          )}

          {/* Acciones de estado */}
          {transicionesValidas[reserva.estado].length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {transicionesValidas[reserva.estado].map((estado) => {
                const c = ESTADO_RESERVA_CONFIG[estado];
                return (
                  <button
                    key={estado}
                    disabled={procesando}
                    onClick={() => onCambiarEstado(estado)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                      c.color, c.bg, "border-current/30",
                      "disabled:opacity-60"
                    )}
                  >
                    Marcar como {c.label}
                  </button>
                );
              })}
              <button
                onClick={onEliminar}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-danger bg-danger/10 border border-danger/30 ml-auto"
              >
                Eliminar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Formulario completo de reserva ────────────────────────────────

interface FormReservaCompletaProps {
  mesas: MesaVip[];
  onCrear: (datos: {
    mesaVipId?: string | null;
    clienteNombre: string;
    clienteEmail?: string | null;
    clienteTelefono?: string | null;
    cantidadPersonas: number;
    nota?: string | null;
    montoSena?: number | null;
  }) => Promise<void>;
  onCancelar: () => void;
}

function FormReservaCompleta({ mesas, onCrear, onCancelar }: FormReservaCompletaProps) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [personas, setPersonas] = useState("2");
  const [mesaId, setMesaId] = useState("");
  const [sena, setSena] = useState("");
  const [nota, setNota] = useState("");
  const { procesando } = useVipStore();

  const mesasLibres = mesas.filter((m) => m.estado === "libre" || m.estado === "reservada");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCrear({
      mesaVipId: mesaId || null,
      clienteNombre: nombre.trim(),
      clienteEmail: email.trim() || null,
      clienteTelefono: telefono.trim() || null,
      cantidadPersonas: Number(personas),
      montoSena: sena ? Number(sena) : null,
      nota: nota.trim() || null,
    });
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
      <Campo label="Nombre del cliente *" required>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} required />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Teléfono">
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Personas *">
          <input type="number" min={1} max={50} value={personas} onChange={(e) => setPersonas(e.target.value)} className={inputCls} required />
        </Campo>
        <Campo label="Seña ($)">
          <input type="number" min={0} value={sena} onChange={(e) => setSena(e.target.value)} className={inputCls} />
        </Campo>
      </div>
      <Campo label="Mesa (opcional)">
        <select value={mesaId} onChange={(e) => setMesaId(e.target.value)} className={inputCls}>
          <option value="">Sin mesa asignada</option>
          {mesasLibres.map((m) => (
            <option key={m.id} value={m.id}>
              Mesa {m.numero}{m.sector ? ` · ${m.sector}` : ""} · {ESTADO_MESA_CONFIG[m.estado].label}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Notas">
        <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} className={cn(inputCls, "resize-none")} />
      </Campo>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancelar} className={btnSecundario}>Cancelar</button>
        <button type="submit" disabled={procesando} className={btnPrimario}>
          {procesando ? "Creando..." : "Crear reserva"}
        </button>
      </div>
    </form>
  );
}

// ── Shared UI ─────────────────────────────────────────────────────

function Modal({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCerrar} />
      <div className="relative bg-surface border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-text-primary">{titulo}</h2>
          <button onClick={onCerrar} className="text-text-secondary hover:text-text-primary text-xl leading-none">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Campo({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-text-secondary">
        {label}{required && " *"}
      </label>
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-20 bg-surface rounded-xl border border-border animate-pulse" />
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

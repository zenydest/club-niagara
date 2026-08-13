/**
 * Módulo 5 — Eventos + Boletería
 *
 * Vista lista: cards de eventos con estado, aforo y acciones.
 * Vista detalle: tabs — Info · Tipos de entrada · Vender · Vendidas
 */

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@niagara/ui";
import {
  useEventosStore,
  ESTADO_CONFIG,
  TIPO_ENTRADA_CONFIG,
  type Evento,
  type TipoEntrada,
  type EntradaVendida,
} from "@/stores/eventosStore";
import { useAuthStore } from "@/stores/authStore";
import { Icono, type NombreIcono } from "@/components/Icono";
import { CampoImagen } from "@/components/CampoImagen";
import { CodigoQR } from "@/components/CodigoQR";

// ── Helpers ─────────────────────────────────────────────────────

const ARS = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function BadgeEstado({ estado }: { estado: Evento["estado"] }) {
  const cfg = ESTADO_CONFIG[estado];
  return (
    <span className={cn("px-2.5 py-1 rounded-full text-xs font-semibold border", cfg.color, cfg.bg, cfg.border)}>
      {cfg.label}
    </span>
  );
}

/**
 * Los QR de las entradas se dibujan en el navegador con `CodigoQR`.
 *
 * Antes se pedían como imagen a `api.qrserver.com`, lo que significaba mandar
 * el código de cada entrada a un servidor de terceros y depender de que ese
 * servicio esté arriba para poder mostrarlo en la puerta.
 */
function QRCode({ valor, tamaño = 160 }: { valor: string; tamaño?: number }) {
  return <CodigoQR valor={valor} tamano={tamaño} descripcion={`Entrada ${valor}`} />;
}

// ═══════════════════════════════════════════════════════════════
// MODAL: Crear / Editar evento
// ═══════════════════════════════════════════════════════════════

function ModalEvento({
  evento,
  onCerrar,
  onGuardado,
}: {
  evento?: Evento;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const { crearEvento, editarEvento, procesando, errorOperacion } = useEventosStore();

  const esEdicion = Boolean(evento);

  // Fecha por defecto: hoy a las 22hs
  const hoy = new Date();
  hoy.setHours(22, 0, 0, 0);
  const defaultFecha = hoy.toISOString().slice(0, 16);

  const [nombre, setNombre] = useState(evento?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(evento?.descripcion ?? "");
  const [fechaInicio, setFechaInicio] = useState(
    evento ? new Date(evento.fechaInicio).toISOString().slice(0, 16) : defaultFecha
  );
  const [capacidad, setCapacidad] = useState(String(evento?.capacidad ?? 300));
  const [imagenUrl, setImagenUrl] = useState(evento?.imagenUrl ?? "");

  const handleGuardar = async () => {
    if (!nombre.trim() || !fechaInicio || !capacidad) return;

    const imagen = imagenUrl.trim() || null;

    if (esEdicion && evento) {
      const ok = await editarEvento(evento.id, {
        nombre: nombre.trim(),
        descripcion: descripcion || null,
        fechaInicio: new Date(fechaInicio).toISOString(),
        capacidad: Number(capacidad),
        imagenUrl: imagen,
      });
      if (ok) onGuardado();
    } else {
      const ev = await crearEvento({
        nombre: nombre.trim(),
        descripcion: descripcion || null,
        fechaInicio: new Date(fechaInicio).toISOString(),
        fechaFin: null,
        capacidad: Number(capacidad),
        imagenUrl: imagen,
      });
      if (ev) onGuardado();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCerrar} />
      <div className="relative w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl p-6 space-y-4">
        <h3 className="text-lg font-bold text-text-primary">
          {esEdicion ? "Editar evento" : "Nuevo evento"}
        </h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-text-secondary uppercase tracking-wider">Nombre *</label>
            <input
              autoFocus
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Noche de Electrónica"
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-lime/40"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary uppercase tracking-wider">Descripción</label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary text-sm resize-none focus:outline-none focus:ring-2 focus:ring-lime/40"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-secondary uppercase tracking-wider">Fecha y hora *</label>
              <input
                type="datetime-local"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-lime/40"
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary uppercase tracking-wider">Capacidad *</label>
              <input
                type="number"
                value={capacidad}
                onChange={(e) => setCapacidad(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-lime/40"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-text-secondary uppercase tracking-wider">
              Imagen del evento
            </label>
            <div className="mt-1">
              <CampoImagen
                valor={imagenUrl}
                onCambio={setImagenUrl}
                carpeta="eventos"
                ayuda="Es la portada que ve el cliente en la app. Ideal apaisada, 1200×675."
              />
            </div>
          </div>
        </div>

        {errorOperacion && (
          <p className="text-xs text-danger">{errorOperacion}</p>
        )}

        <div className="flex gap-2 pt-2">
          <button onClick={onCerrar} className="flex-1 py-2.5 rounded-xl border border-border text-text-secondary text-sm hover:border-lime/40 transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => void handleGuardar()}
            disabled={!nombre.trim() || !fechaInicio || !capacidad || procesando}
            className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 disabled:opacity-50 transition-all"
          >
            {procesando ? "Guardando…" : esEdicion ? "Guardar cambios" : "Crear evento"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: Info del evento
// ═══════════════════════════════════════════════════════════════

const ESTADOS_TRANSICION: Record<Evento["estado"], Evento["estado"][]> = {
  borrador:  ["preventa", "en_vivo", "cancelado"],
  preventa:  ["en_vivo", "cancelado"],
  en_vivo:   ["cerrado"],
  cerrado:   [],
  cancelado: [],
};

function TabInfo({
  evento,
  onEditar,
  onEliminado,
}: {
  evento: Evento;
  onEditar: () => void;
  onEliminado: () => void;
}) {
  const { cambiarEstado, eliminarEvento, procesando, errorOperacion } = useEventosStore();
  const { staff } = useAuthStore();
  const esAdmin = staff && ["admin", "encargado"].includes(staff.rol);
  const siguientes = ESTADOS_TRANSICION[evento.estado];

  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

  const pctAforo = evento.capacidad > 0 ? Math.round((evento.aforoActual / evento.capacidad) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {([
          { label: "Capacidad", valor: evento.capacidad.toLocaleString("es-AR"), icono: "aforo" },
          { label: "Aforo actual", valor: `${evento.aforoActual} (${pctAforo}%)`, icono: "porteria" },
          { label: "Entradas vendidas", valor: String(evento._count?.entradasVendidas ?? 0), icono: "entrada" },
        ] satisfies { label: string; valor: string; icono: NombreIcono }[]).map((k) => (
          <div key={k.label} className="bg-surface-2 border border-border rounded-xl p-4 text-center">
            <Icono nombre={k.icono} tamano={20} className="mx-auto mb-1 text-text-secondary" />
            <p className="text-lg font-bold text-text-primary">{k.valor}</p>
            <p className="text-xs text-text-secondary">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Datos del evento */}
      <div className="bg-surface-2 border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Datos del evento</h3>
          {esAdmin && (
            <button onClick={onEditar} className="text-xs text-lime hover:underline">Editar</button>
          )}
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-text-secondary">Inicio</span>
            <span className="text-text-primary font-medium">{fechaCorta(evento.fechaInicio)}</span>
          </div>
          {evento.fechaFin && (
            <div className="flex justify-between">
              <span className="text-text-secondary">Fin</span>
              <span className="text-text-primary font-medium">{fechaCorta(evento.fechaFin)}</span>
            </div>
          )}
          {evento.descripcion && (
            <div>
              <span className="text-text-secondary block mb-1">Descripción</span>
              <p className="text-text-primary text-xs bg-surface rounded-lg px-3 py-2">{evento.descripcion}</p>
            </div>
          )}
        </div>
      </div>

      {/* Cambiar estado */}
      {esAdmin && siguientes.length > 0 && (
        <div className="bg-surface-2 border border-border rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">Cambiar estado</h3>
          <div className="flex gap-2 flex-wrap">
            {siguientes.map((sig) => {
              const cfg = ESTADO_CONFIG[sig];
              return (
                <button
                  key={sig}
                  onClick={() => void cambiarEstado(evento.id, sig)}
                  disabled={procesando}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-semibold border transition-all",
                    "inline-flex items-center gap-1.5",
                    cfg.color, cfg.bg, cfg.border,
                    "hover:brightness-125 disabled:opacity-50"
                  )}
                >
                  <Icono nombre="avanzar" tamano={14} />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Eliminar. Solo tiene sentido en eventos que todavía no movieron nada:
          la API rechaza el resto y explica por qué. */}
      {esAdmin && (
        <div className="bg-surface-2 border border-danger/20 rounded-xl p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-danger">Eliminar evento</h3>
            <p className="text-xs text-text-secondary mt-1">
              Solo se puede si no tuvo ventas, entradas ni ingresos. Si ya tuvo
              movimiento, pasalo a “cerrado” en vez de borrarlo.
            </p>
          </div>

          {errorOperacion && (
            <p className="text-xs text-danger">{errorOperacion}</p>
          )}

          <button
            onClick={() => setConfirmarEliminar(true)}
            disabled={procesando}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-50 transition-colors"
          >
            Eliminar
          </button>
        </div>
      )}

      {confirmarEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setConfirmarEliminar(false)}
          />
          <div className="relative w-full max-w-sm bg-surface border border-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Icono nombre="alerta" tamano={24} className="text-danger flex-shrink-0" />
              <h2 className="text-base font-bold text-text-primary">
                Eliminar {evento.nombre}
              </h2>
            </div>
            <p className="text-sm text-text-secondary">
              Se borra el evento y sus tipos de entrada. No se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmarEliminar(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-text-secondary text-sm hover:border-text-secondary transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const ok = await eliminarEvento(evento.id);
                  setConfirmarEliminar(false);
                  if (ok) onEliminado();
                }}
                disabled={procesando}
                className="flex-1 py-2.5 rounded-xl bg-danger text-white text-sm font-bold hover:brightness-110 disabled:opacity-50 transition-all"
              >
                {procesando ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: Tipos de entrada
// ═══════════════════════════════════════════════════════════════

function TabTipos({ evento }: { evento: Evento }) {
  const { tipos, cargandoTipos, procesando, errorOperacion, cargarTipos, crearTipo, editarTipo, eliminarTipo } = useEventosStore();
  const { staff } = useAuthStore();
  const esAdmin = staff && ["admin", "encargado"].includes(staff.rol);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<TipoEntrada | null>(null);

  // Form
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoEntrada["tipo"]>("general");
  const [precio, setPrecio] = useState("");
  const [cupo, setCupo] = useState("");

  useEffect(() => { void cargarTipos(evento.id); }, [evento.id, cargarTipos]);

  const abrirCrear = () => {
    setEditando(null); setNombre(""); setTipo("general"); setPrecio(""); setCupo("");
    setModalAbierto(true);
  };

  const abrirEditar = (t: TipoEntrada) => {
    setEditando(t); setNombre(t.nombre); setTipo(t.tipo);
    setPrecio(String(t.precio)); setCupo(t.cantidadTotal ? String(t.cantidadTotal) : "");
    setModalAbierto(true);
  };

  const handleGuardar = async () => {
    if (!nombre.trim() || !precio) return;
    if (editando) {
      const ok = await editarTipo(editando.id, { nombre: nombre.trim(), tipo, precio: Number(precio), cantidadTotal: cupo ? Number(cupo) : null });
      if (ok) setModalAbierto(false);
    } else {
      const t = await crearTipo({ eventoId: evento.id, nombre: nombre.trim(), tipo, precio: Number(precio), cantidadTotal: cupo ? Number(cupo) : null });
      if (t) setModalAbierto(false);
    }
  };

  return (
    <div className="space-y-4">
      {esAdmin && (
        <div className="flex justify-end">
          <button onClick={abrirCrear} className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition-all">
            + Agregar tipo
          </button>
        </div>
      )}

      {cargandoTipos ? (
        <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-lime border-t-transparent rounded-full animate-spin" /></div>
      ) : tipos.length === 0 ? (
        <div className="text-center py-10 text-text-secondary">
          <Icono nombre="entrada" tamano={34} className="mx-auto mb-2 text-text-muted" />
          <p className="text-sm">Sin tipos de entrada. Agregá uno para empezar a vender.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tipos.map((t) => {
            const cfg = TIPO_ENTRADA_CONFIG[t.tipo];
            const pct = t.cantidadTotal ? Math.round((t.cantidadVendida / t.cantidadTotal) * 100) : null;
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-2 border border-border">
                <Icono nombre={cfg.icono} tamano={20} className="text-text-secondary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary">{t.nombre}</p>
                  <p className="text-xs text-text-secondary">
                    {cfg.label} · {ARS(t.precio)}
                    {t.cantidadTotal && ` · ${t.cantidadVendida}/${t.cantidadTotal} vendidas`}
                    {pct !== null && ` (${pct}%)`}
                  </p>
                  {t.cantidadTotal && (
                    <div className="mt-1.5 h-1.5 bg-surface rounded-full overflow-hidden w-40">
                      <div className={cn("h-full rounded-full transition-all", (pct ?? 0) >= 90 ? "bg-danger" : (pct ?? 0) >= 70 ? "bg-yellow-400" : "bg-lime")} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
                {esAdmin && (
                  <div className="flex gap-1">
                    <button onClick={() => abrirEditar(t)} className="px-2.5 py-1 rounded-lg text-xs text-text-secondary hover:text-lime border border-transparent hover:border-lime/40 transition-all">Editar</button>
                    <button onClick={() => void eliminarTipo(t.id)} className="px-2.5 py-1 rounded-lg text-xs text-text-secondary hover:text-danger border border-transparent hover:border-danger/40 transition-all">Quitar</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal tipo */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setModalAbierto(false)} />
          <div className="relative w-full max-w-sm bg-surface border border-border rounded-2xl shadow-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-text-primary">{editando ? "Editar tipo" : "Nuevo tipo de entrada"}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-secondary uppercase tracking-wider">Nombre *</label>
                <input autoFocus type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="General, VIP, etc." className="mt-1 w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-lime/40" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-secondary uppercase tracking-wider">Categoría</label>
                  <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoEntrada["tipo"])} className="mt-1 w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-lime/40">
                    {Object.entries(TIPO_ENTRADA_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.icono} {v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-text-secondary uppercase tracking-wider">Precio *</label>
                  <input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="0" className="mt-1 w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-lime/40" />
                </div>
              </div>
              <div>
                <label className="text-xs text-text-secondary uppercase tracking-wider">Cupo (vacío = ilimitado)</label>
                <input type="number" value={cupo} onChange={(e) => setCupo(e.target.value)} placeholder="Ej: 200" className="mt-1 w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-lime/40" />
              </div>
            </div>
            {errorOperacion && <p className="text-xs text-danger">{errorOperacion}</p>}
            <div className="flex gap-2">
              <button onClick={() => setModalAbierto(false)} className="flex-1 py-2.5 rounded-xl border border-border text-text-secondary text-sm hover:border-lime/40 transition-colors">Cancelar</button>
              <button onClick={() => void handleGuardar()} disabled={!nombre.trim() || !precio || procesando} className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 disabled:opacity-50 transition-all">{procesando ? "Guardando…" : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: Vender entrada
// ═══════════════════════════════════════════════════════════════

function TabVender({ evento }: { evento: Evento }) {
  const { tipos, vendidas: _, procesando, errorOperacion, venderEntrada } = useEventosStore();
  const { staff } = useAuthStore();

  const [tipoId, setTipoId] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [cantidad, setCantidad] = useState("1");
  const [entradasVendidas, setEntradasVendidas] = useState<EntradaVendida[] | null>(null);

  const tipoSeleccionado = tipos.find((t) => t.id === tipoId);
  const total = tipoSeleccionado ? tipoSeleccionado.precio * Number(cantidad) : 0;

  const handleVender = async () => {
    if (!tipoId || !nombre.trim() || !metodoPago) return;
    const res = await venderEntrada({
      eventoId: evento.id,
      entradaTipoId: tipoId,
      clienteNombre: nombre.trim(),
      clienteEmail: email || null,
      clienteTelefono: telefono || null,
      metodoPago,
      precioPagado: tipoSeleccionado?.precio ?? 0,
      rrppId: staff?.rol === "rrpp" ? staff.id : null,
      cantidad: Number(cantidad),
    });
    if (res) {
      setEntradasVendidas(res);
      setNombre(""); setEmail(""); setTelefono(""); setCantidad("1");
    }
  };

  if (entradasVendidas) {
    return (
      <div className="space-y-4">
        <div className="text-center py-6">
          <Icono nombre="ok" tamano={40} className="mx-auto mb-2 text-green-400" />
          <p className="text-lg font-bold text-green-400">
            {entradasVendidas.length === 1 ? "Entrada vendida" : `${entradasVendidas.length} entradas vendidas`}
          </p>
          <p className="text-sm text-text-secondary mt-1">
            {entradasVendidas[0]?.clienteNombre} · {tipoSeleccionado?.nombre}
          </p>
        </div>

        {/* Mostrar QR de cada entrada */}
        <div className="space-y-4">
          {entradasVendidas.map((e) => (
            <div key={e.id} className="flex items-center gap-4 p-4 rounded-xl bg-surface-2 border border-border">
              <QRCode valor={e.qrCode} tamaño={100} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-text-primary">{e.clienteNombre}</p>
                <p className="font-mono text-xs text-lime mt-1 break-all">{e.qrCode}</p>
                <p className="text-xs text-text-secondary mt-0.5">{ARS(e.precioPagado)} · {e.metodoPago}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setEntradasVendidas(null)}
          className="w-full py-3 rounded-xl bg-accent text-white font-bold text-sm hover:brightness-110 transition-all"
        >
          Vender otra entrada
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-4">
      {tipos.length === 0 ? (
        <div className="text-center py-10 text-text-secondary">
          <Icono nombre="alerta" tamano={34} className="mx-auto mb-2 text-warning" />
          <p className="text-sm">Primero creá los tipos de entrada en la pestaña &ldquo;Tipos&rdquo;.</p>
        </div>
      ) : (
        <>
          {/* Selector de tipo */}
          <div>
            <label className="text-xs text-text-secondary uppercase tracking-wider">Tipo de entrada *</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {tipos.map((t) => {
                const cfg = TIPO_ENTRADA_CONFIG[t.tipo];
                const sinCupo = t.cantidadTotal !== null && t.cantidadVendida >= t.cantidadTotal;
                return (
                  <button
                    key={t.id}
                    onClick={() => !sinCupo && setTipoId(t.id)}
                    disabled={sinCupo}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all",
                      tipoId === t.id ? "border-lime bg-lime/15" : "border-border bg-surface-2 hover:border-lime/40",
                      sinCupo && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    <Icono nombre={cfg.icono} tamano={16} className="text-text-secondary" />
                    <p className="text-xs font-semibold text-text-primary mt-0.5">{t.nombre}</p>
                    <p className="text-xs text-lime font-bold">{ARS(t.precio)}</p>
                    {sinCupo && <p className="text-[10px] text-danger mt-0.5">Sin cupo</p>}
                    {t.cantidadTotal && !sinCupo && (
                      <p className="text-[10px] text-text-secondary mt-0.5">
                        {t.cantidadTotal - t.cantidadVendida} disponibles
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Datos del comprador */}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-secondary uppercase tracking-wider">Nombre *</label>
              <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Juan Pérez" className="mt-1 w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-lime/40" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-secondary uppercase tracking-wider">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="juan@mail.com" className="mt-1 w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-lime/40" />
              </div>
              <div>
                <label className="text-xs text-text-secondary uppercase tracking-wider">Teléfono</label>
                <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="+54 11 ..." className="mt-1 w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-lime/40" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-secondary uppercase tracking-wider">Método de pago</label>
                <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} className="mt-1 w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-lime/40">
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="qr_mp">QR / Mercado Pago</option>
                  <option value="cashless">Cashless</option>
                  <option value="cortesia">Cortesía</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-text-secondary uppercase tracking-wider">Cantidad</label>
                <input type="number" min="1" max="10" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="mt-1 w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-lime/40" />
              </div>
            </div>
          </div>

          {/* Total */}
          {tipoSeleccionado && (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-lime/10 border border-lime/30">
              <span className="text-sm text-text-secondary">Total</span>
              <span className="text-xl font-black text-lime">{ARS(total)}</span>
            </div>
          )}

          {errorOperacion && <p className="text-xs text-danger">{errorOperacion}</p>}

          <button
            onClick={() => void handleVender()}
            disabled={!tipoId || !nombre.trim() || procesando}
            className="w-full py-4 rounded-xl bg-accent text-white font-bold text-base hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {procesando ? "Registrando…" : `Registrar venta ${total > 0 ? `· ${ARS(total)}` : ""}`}
          </button>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: Entradas vendidas
// ═══════════════════════════════════════════════════════════════

function TabVendidas({ evento }: { evento: Evento }) {
  const { vendidas, cargandoVendidas, procesando, cargarVendidas, marcarUsada } = useEventosStore();
  const [busqueda, setBusqueda] = useState("");
  const [filtroUsada, setFiltroUsada] = useState<"todas" | "si" | "no">("todas");
  const [qrVisible, setQrVisible] = useState<string | null>(null);

  const busquedaTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void cargarVendidas(evento.id);
  }, [evento.id, cargarVendidas]);

  const handleBusqueda = (v: string) => {
    setBusqueda(v);
    if (busquedaTimeout.current) clearTimeout(busquedaTimeout.current);
    busquedaTimeout.current = setTimeout(() => {
      void cargarVendidas(evento.id, {
        busqueda: v || undefined,
        usada: filtroUsada === "todas" ? undefined : filtroUsada === "si",
      });
    }, 400);
  };

  const handleFiltroUsada = (f: typeof filtroUsada) => {
    setFiltroUsada(f);
    void cargarVendidas(evento.id, {
      busqueda: busqueda || undefined,
      usada: f === "todas" ? undefined : f === "si",
    });
  };

  const totalRecaudado = vendidas.reduce((acc, v) => acc + v.precioPagado, 0);

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total vendidas", valor: vendidas.length },
          { label: "Usadas", valor: vendidas.filter((v) => v.usada).length },
          { label: "Recaudado", valor: ARS(totalRecaudado) },
        ].map((k) => (
          <div key={k.label} className="bg-surface-2 border border-border rounded-xl p-3 text-center">
            <p className="text-base font-bold text-text-primary">{k.valor}</p>
            <p className="text-[11px] text-text-secondary mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Buscar nombre, email, tel, QR…"
          value={busqueda}
          onChange={(e) => handleBusqueda(e.target.value)}
          className="flex-1 px-3 py-2 rounded-xl bg-surface-2 border border-border text-text-primary text-sm placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-lime/40"
        />
        {(["todas", "no", "si"] as const).map((f) => (
          <button
            key={f}
            onClick={() => handleFiltroUsada(f)}
            className={cn(
              "px-3 py-2 rounded-xl text-xs font-semibold border transition-all",
              filtroUsada === f
                ? "bg-lime/20 border-lime text-lime"
                : "bg-surface-2 border-border text-text-secondary hover:border-lime/40"
            )}
          >
            {f === "todas" ? "Todas" : f === "no" ? "No usadas" : "Usadas"}
          </button>
        ))}
      </div>

      {/* Lista */}
      {cargandoVendidas ? (
        <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-lime border-t-transparent rounded-full animate-spin" /></div>
      ) : vendidas.length === 0 ? (
        <div className="text-center py-10 text-text-secondary">
          <Icono nombre="entrada" tamano={34} className="mx-auto mb-2 text-text-muted" />
          <p className="text-sm">Sin entradas vendidas{busqueda ? ` para “${busqueda}”` : ""}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {vendidas.map((v) => (
            <div
              key={v.id}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl border transition-all",
                v.usada ? "bg-surface/50 border-border/50 opacity-60" : "bg-surface-2 border-border"
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-text-primary truncate">{v.clienteNombre}</p>
                  {v.usada && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-500/20 text-green-400 border border-green-500/30 flex-shrink-0 inline-flex items-center gap-1">
                      <Icono nombre="ok" tamano={10} />
                      Usada
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-secondary">
                  {v.entradaTipo?.nombre} · {ARS(v.precioPagado)} · {v.metodoPago}
                  {v.clienteEmail && ` · ${v.clienteEmail}`}
                  {v.clienteTelefono && ` · ${v.clienteTelefono}`}
                </p>
                <p className="font-mono text-[10px] text-lime/70 mt-0.5">{v.qrCode}</p>
              </div>

              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => setQrVisible(qrVisible === v.id ? null : v.id)}
                  className="px-2.5 py-1 rounded-lg text-xs text-text-secondary hover:text-lime border border-transparent hover:border-lime/40 transition-all"
                >
                  QR
                </button>
                {!v.usada && (
                  <button
                    onClick={() => void marcarUsada(v.id)}
                    disabled={procesando}
                    className="px-2.5 py-1 rounded-lg text-xs text-green-400 hover:bg-green-500/10 border border-transparent hover:border-green-500/40 transition-all"
                  >
                    Check-in
                  </button>
                )}
              </div>

              {/* QR expandido */}
              {qrVisible === v.id && (
                <div className="absolute right-0 mt-2 z-10 bg-surface border border-border rounded-xl p-3 shadow-xl">
                  <QRCode valor={v.qrCode} tamaño={150} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VISTA DETALLE de evento
// ═══════════════════════════════════════════════════════════════

type TabDetalle = "info" | "tipos" | "vender" | "vendidas";

function EventoDetalle({ evento, onVolver }: { evento: Evento; onVolver: () => void }) {
  const [tab, setTab] = useState<TabDetalle>("info");
  const [editandoEvento, setEditandoEvento] = useState(false);
  const { cargarEvento } = useEventosStore();
  const { staff } = useAuthStore();

  const TABS_DETALLE: { id: TabDetalle; label: string; icono: NombreIcono; roles: string[] }[] = [
    { id: "info",     label: "Info",    icono: "eventos",  roles: ["admin", "encargado"] },
    { id: "tipos",    label: "Tipos",   icono: "entrada",  roles: ["admin", "encargado"] },
    { id: "vender",   label: "Vender",  icono: "caja",     roles: ["admin", "encargado", "cajero", "rrpp"] },
    { id: "vendidas", label: "Vendidas",icono: "reportes", roles: ["admin", "encargado", "cajero"] },
  ];

  const tabsVisibles = TABS_DETALLE.filter((t) => !staff || t.roles.includes(staff.rol));

  return (
    <div className="space-y-4">
      {/* Header de detalle */}
      <div className="flex items-start gap-3">
        <button
          onClick={onVolver}
          className="mt-0.5 p-2 rounded-xl bg-surface-2 border border-border text-text-secondary hover:text-lime hover:border-lime/40 transition-all"
          aria-label="Volver"
        >
          <Icono nombre="volver" tamano={16} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-text-primary">{evento.nombre}</h2>
            <BadgeEstado estado={evento.estado} />
          </div>
          <p className="text-sm text-text-secondary mt-0.5">{fechaCorta(evento.fechaInicio)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface-2 rounded-xl border border-border w-fit overflow-x-auto">
        {tabsVisibles.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
              tab === t.id ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"
            )}
          >
            <Icono nombre={t.icono} tamano={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === "info" && (
        <>
          <TabInfo
            evento={evento}
            onEditar={() => setEditandoEvento(true)}
            onEliminado={onVolver}
          />
          {editandoEvento && (
            <ModalEvento
              evento={evento}
              onCerrar={() => setEditandoEvento(false)}
              onGuardado={() => { setEditandoEvento(false); void cargarEvento(evento.id); }}
            />
          )}
        </>
      )}
      {tab === "tipos" && <TabTipos evento={evento} />}
      {tab === "vender" && <TabVender evento={evento} />}
      {tab === "vendidas" && <TabVendidas evento={evento} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ═══════════════════════════════════════════════════════════════

export function EventosPage() {
  const { eventos, cargando, eventoActual, cargarEventos, setEventoActual } = useEventosStore();
  const { staff } = useAuthStore();
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [modalCrear, setModalCrear] = useState(false);
  const esAdmin = staff && ["admin", "encargado"].includes(staff.rol);

  useEffect(() => {
    void cargarEventos(filtroEstado === "todos" ? undefined : filtroEstado);
  }, [filtroEstado, cargarEventos]);

  // Vista detalle
  if (eventoActual) {
    return <EventoDetalle evento={eventoActual} onVolver={() => setEventoActual(null)} />;
  }

  const eventosFiltrados = filtroEstado === "todos"
    ? eventos
    : eventos.filter((e) => e.estado === filtroEstado);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Eventos</h1>
          <p className="text-sm text-text-secondary mt-0.5">Boletería · QR · Control de acceso</p>
        </div>
        {esAdmin && (
          <button
            onClick={() => setModalCrear(true)}
            className="px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition-all inline-flex items-center gap-1.5"
          >
            <Icono nombre="agregar" tamano={16} />
            Nuevo evento
          </button>
        )}
      </div>

      {/* Filtro de estado */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { id: "todos", label: "Todos" },
          { id: "en_vivo", label: "En vivo" },
          { id: "preventa", label: "Preventa" },
          { id: "borrador", label: "Borrador" },
          { id: "cerrado", label: "Cerrado" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltroEstado(f.id)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-semibold border whitespace-nowrap transition-all",
              filtroEstado === f.id
                ? "bg-lime/20 border-lime text-lime"
                : "bg-surface-2 border-border text-text-secondary hover:border-lime/40"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista de eventos */}
      {cargando ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-lime border-t-transparent rounded-full animate-spin" />
        </div>
      ) : eventosFiltrados.length === 0 ? (
        <div className="text-center py-16 text-text-secondary">
          <Icono nombre="eventos" tamano={40} className="mx-auto mb-3 text-text-muted" />
          <p className="text-sm">Sin eventos. {esAdmin && "Creá uno para empezar."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {eventosFiltrados.map((ev) => {
            const pctAforo = ev.capacidad > 0 ? Math.round((ev.aforoActual / ev.capacidad) * 100) : 0;
            return (
              <button
                key={ev.id}
                onClick={() => setEventoActual(ev)}
                className="w-full text-left flex gap-4 px-4 py-4 rounded-xl bg-surface-2 border border-border hover:border-lime/40 transition-all group"
              >
                {/* Indicador de estado */}
                <div className={cn(
                  "w-1 rounded-full flex-shrink-0",
                  ev.estado === "en_vivo" ? "bg-green-400" :
                  ev.estado === "preventa" ? "bg-blue-400" :
                  ev.estado === "cancelado" ? "bg-danger" : "bg-border"
                )} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-text-primary group-hover:text-lime transition-colors">{ev.nombre}</p>
                    <BadgeEstado estado={ev.estado} />
                  </div>
                  <p className="text-sm text-text-secondary mt-1">{fechaCorta(ev.fechaInicio)}</p>

                  {/* Barra de aforo */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", pctAforo >= 90 ? "bg-danger" : pctAforo >= 70 ? "bg-yellow-400" : "bg-lime")}
                        style={{ width: `${pctAforo}%` }}
                      />
                    </div>
                    <span className="text-xs text-text-secondary flex-shrink-0">
                      {ev.aforoActual}/{ev.capacidad}
                    </span>
                  </div>
                </div>

                <Icono
                  nombre="avanzar"
                  tamano={16}
                  className="text-text-secondary group-hover:text-lime transition-colors self-center flex-shrink-0"
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Modal crear evento */}
      {modalCrear && (
        <ModalEvento
          onCerrar={() => setModalCrear(false)}
          onGuardado={() => { setModalCrear(false); void cargarEventos(); }}
        />
      )}
    </div>
  );
}

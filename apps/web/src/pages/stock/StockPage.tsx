/**
 * Módulo 8 — Stock
 * Inventario por depósito + historial de movimientos + alertas.
 */

import React, { useState, useEffect } from "react";
import { cn } from "@niagara/ui";
import {
  useStockStore,
  TIPO_MOVIMIENTO_CONFIG,
  configTipoMovimiento,
  type ProductoStock,
  type StockMovimiento,
} from "@/stores/stockStore";

type Tab = "inventario" | "movimientos" | "alertas";

// ── Helpers ───────────────────────────────────────────────────────

function formatFecha(iso: string) {
  return new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ── Componente principal ──────────────────────────────────────────

export function StockPage() {
  const [tab, setTab] = useState<Tab>("inventario");
  const {
    depositos, alertas, cargando, error, limpiarError,
    cargarDepositos, cargarNivel, cargarAlertas, cargarMovimientos,
    depositoSeleccionado, setDepositoSeleccionado,
  } = useStockStore();

  useEffect(() => {
    void cargarDepositos();
    void cargarNivel();
    void cargarAlertas();
    void cargarMovimientos();
  }, [cargarDepositos, cargarNivel, cargarAlertas, cargarMovimientos]);

  const cambiarDeposito = (id: string | null) => {
    setDepositoSeleccionado(id);
    void cargarNivel(id ?? undefined);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Inventario</h1>
          <p className="text-sm text-text-secondary mt-0.5">Control de stock por depósito</p>
        </div>
        <div className="flex items-center gap-2">
          {alertas.length > 0 && (
            <button
              onClick={() => setTab("alertas")}
              className="flex items-center gap-2 px-3 py-1.5 bg-danger/10 border border-danger/30 rounded-xl text-xs font-medium text-danger hover:bg-danger/20 transition-colors"
            >
              ⚠️ {alertas.length} bajo mínimo
            </button>
          )}
          <BotonNuevoDeposito />
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-danger">{error}</p>
          <button onClick={limpiarError} className="text-danger ml-4">✕</button>
        </div>
      )}

      {/* Selector de depósito */}
      {depositos.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => cambiarDeposito(null)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-sm font-medium border transition-all",
              !depositoSeleccionado
                ? "bg-accent text-black border-accent"
                : "text-text-secondary border-border hover:border-accent"
            )}
          >
            Todos
          </button>
          {depositos.map((d) => (
            <button
              key={d.id}
              onClick={() => cambiarDeposito(d.id)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-sm font-medium border transition-all",
                depositoSeleccionado === d.id
                  ? "bg-accent text-black border-accent"
                  : "text-text-secondary border-border hover:border-accent"
              )}
            >
              {d.nombre}
              {d.esPrincipal && <span className="ml-1 text-[10px] opacity-70">★</span>}
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-2 rounded-xl p-1 w-fit">
        {(["inventario", "movimientos", "alertas"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all relative",
              tab === t ? "bg-accent text-black shadow" : "text-text-secondary hover:text-text-primary"
            )}
          >
            {{ inventario: "📦 Inventario", movimientos: "📋 Movimientos", alertas: "⚠️ Alertas" }[t]}
            {t === "alertas" && alertas.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-danger text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                {alertas.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "inventario"  && <TabInventario cargando={cargando} />}
      {tab === "movimientos" && <TabMovimientos />}
      {tab === "alertas"     && <TabAlertas />}
    </div>
  );
}

// ── Botón nuevo depósito ──────────────────────────────────────────

function BotonNuevoDeposito() {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [principal, setPrincipal] = useState(false);
  const { crearDeposito, procesando } = useStockStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = await crearDeposito({ nombre: nombre.trim(), esPrincipal: principal });
    if (d) { setNombre(""); setPrincipal(false); setAbierto(false); }
  };

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="px-4 py-2 bg-surface-2 border border-border rounded-xl text-sm text-text-secondary hover:border-accent hover:text-accent transition-colors"
      >
        + Depósito
      </button>
      {abierto && (
        <Modal titulo="Nuevo depósito" onCerrar={() => setAbierto(false)}>
          <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">Nombre *</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} required />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={principal} onChange={(e) => setPrincipal(e.target.checked)}
                className="w-4 h-4 accent-accent" />
              <span className="text-sm text-text-secondary">Marcar como depósito principal</span>
            </label>
            <div className="flex gap-3">
              <button type="button" onClick={() => setAbierto(false)} className={btnSecundario}>Cancelar</button>
              <button type="submit" disabled={procesando} className={btnPrimario}>{procesando ? "..." : "Crear"}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ── Tab Inventario ────────────────────────────────────────────────

function TabInventario({ cargando }: { cargando: boolean }) {
  const { productos } = useStockStore();
  const [busqueda, setBusqueda] = useState("");
  const [modalMovimiento, setModalMovimiento] = useState<ProductoStock | null>(null);
  const [modalMinimo, setModalMinimo] = useState<ProductoStock | null>(null);

  // Agrupar por categoría
  const filtrados = productos.filter((p) =>
    !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.categoria?.toLowerCase().includes(busqueda.toLowerCase())
  );
  const categorias = [...new Set(filtrados.map((p) => p.categoria ?? "Sin categoría"))].sort();

  if (cargando) return <Skeleton />;

  if (productos.length === 0) {
    return (
      <div className="py-16 text-center text-text-secondary">
        <span className="text-4xl block mb-3">📦</span>
        <p>No hay productos con movimientos de stock registrados.</p>
        <p className="text-sm mt-1">Cargá productos desde la sección de Caja y luego registrá un ingreso aquí.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar producto o categoría..."
        className={inputCls}
      />

      {categorias.map((cat) => {
        const prods = filtrados.filter((p) => (p.categoria ?? "Sin categoría") === cat);
        return (
          <div key={cat} className="bg-surface rounded-2xl border border-border overflow-hidden">
            <div className="px-4 py-2 bg-surface-2/50 border-b border-border">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{cat}</span>
            </div>
            <div className="divide-y divide-border">
              {prods.map((p) => (
                <FilaProducto
                  key={p.id}
                  producto={p}
                  onMovimiento={() => setModalMovimiento(p)}
                  onEditarMinimo={() => setModalMinimo(p)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {modalMovimiento && (
        <ModalMovimiento
          producto={modalMovimiento}
          onCerrar={() => setModalMovimiento(null)}
        />
      )}
      {modalMinimo && (
        <ModalStockMinimo
          producto={modalMinimo}
          onCerrar={() => setModalMinimo(null)}
        />
      )}
    </div>
  );
}

// ── Fila de producto en inventario ────────────────────────────────

function FilaProducto({ producto: p, onMovimiento, onEditarMinimo }: {
  producto: ProductoStock;
  onMovimiento: () => void;
  onEditarMinimo: () => void;
}) {
  const [expandido, setExpandido] = useState(false);

  const colorStock = p.bajoMinimo
    ? "text-danger"
    : p.stockTotal <= 0
    ? "text-danger"
    : p.stockTotal < 5
    ? "text-yellow-400"
    : "text-green-400";

  return (
    <div>
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/30 transition-colors cursor-pointer"
        onClick={() => setExpandido(!expandido)}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">{p.nombre}</p>
          {p.stockMinimo !== null && (
            <p className="text-xs text-text-secondary">Mínimo: {p.stockMinimo}</p>
          )}
        </div>

        <div className="flex items-center gap-4">
          {p.bajoMinimo && (
            <span className="text-xs bg-danger/10 text-danger border border-danger/20 px-2 py-0.5 rounded-lg">
              ⚠️ Bajo mínimo
            </span>
          )}
          <div className="text-right">
            <p className={cn("text-2xl font-bold tabular-nums", colorStock)}>{p.stockTotal}</p>
            <p className="text-xs text-text-secondary">en stock</p>
          </div>
        </div>

        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onMovimiento}
            className="px-3 py-1.5 bg-accent/10 text-accent border border-accent/30 rounded-xl text-xs font-medium hover:bg-accent/20 transition-colors"
          >
            + Movimiento
          </button>
          <button
            onClick={onEditarMinimo}
            className="px-3 py-1.5 bg-surface-2 border border-border rounded-xl text-xs text-text-secondary hover:border-accent transition-colors"
          >
            ≥ Mínimo
          </button>
        </div>

        <span className="text-text-secondary text-sm">{expandido ? "▲" : "▼"}</span>
      </div>

      {/* Detalle por depósito */}
      {expandido && p.porDeposito.length > 0 && (
        <div className="bg-surface-2/20 px-6 py-3 border-t border-border">
          <div className="flex flex-col gap-1.5">
            {p.porDeposito.map((d) => (
              <div key={d.depositoId} className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">
                  {d.depositoNombre}
                  {d.esPrincipal && <span className="ml-1 text-[10px] text-accent">★</span>}
                </span>
                <span className={cn("font-semibold tabular-nums", d.stock <= 0 ? "text-danger" : "text-text-primary")}>
                  {d.stock}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal movimiento ──────────────────────────────────────────────

function ModalMovimiento({ producto, onCerrar }: { producto: ProductoStock; onCerrar: () => void }) {
  const { depositos, registrarMovimiento, procesando } = useStockStore();
  const [depositoId, setDepositoId] = useState(depositos.find((d) => d.esPrincipal)?.id ?? depositos[0]?.id ?? "");
  const [tipo, setTipo] = useState<"ingreso" | "egreso_merma" | "ajuste">("ingreso");
  const [cantidad, setCantidad] = useState("1");
  const [motivo, setMotivo] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await registrarMovimiento({
      depositoId,
      productoId: producto.id,
      tipo,
      cantidad: Number(cantidad),
      motivo: motivo.trim() || undefined,
    });
    if (ok) onCerrar();
  };

  const cfg = configTipoMovimiento(tipo);

  return (
    <Modal titulo={`Movimiento — ${producto.nombre}`} onCerrar={onCerrar}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        {/* Stock actual */}
        <div className="bg-surface-2 rounded-xl p-3 flex items-center justify-between">
          <span className="text-sm text-text-secondary">Stock actual total</span>
          <span className="text-xl font-bold text-text-primary">{producto.stockTotal}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-text-secondary">Depósito *</label>
          <select value={depositoId} onChange={(e) => setDepositoId(e.target.value)} className={inputCls} required>
            {depositos.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre}{d.esPrincipal ? " ★" : ""}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-text-secondary">Tipo de movimiento</label>
          <div className="grid grid-cols-3 gap-2">
            {(["ingreso", "egreso_merma", "ajuste"] as const).map((t) => {
              const c = configTipoMovimiento(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={cn(
                    "py-2 rounded-xl text-sm font-medium border transition-all",
                    tipo === t ? cn(c.color, "bg-current/10 border-current/30") : "text-text-secondary border-border"
                  )}
                >
                  {c.icono} {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-text-secondary">
            Cantidad {tipo === "ajuste" ? "(negativo para reducir)" : ""} *
          </label>
          <input
            type="number"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            className={cn(inputCls, "text-center text-xl font-bold")}
            required
          />
        </div>

        {/* Preview del resultado */}
        <div className={cn("rounded-xl p-3 text-center text-sm border", cfg.color, "bg-current/5 border-current/20")}>
          <span className="text-text-secondary">Resultado estimado: </span>
          <span className="font-bold">
            {tipo === "ingreso"
              ? producto.stockTotal + Number(cantidad || 0)
              : tipo === "egreso_merma"
              ? producto.stockTotal - Number(cantidad || 0)
              : producto.stockTotal + Number(cantidad || 0)
            } unidades
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-text-secondary">Motivo (opcional)</label>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: Carga del proveedor, botella rota..." className={inputCls} />
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={onCerrar} className={btnSecundario}>Cancelar</button>
          <button type="submit" disabled={procesando || !depositoId} className={btnPrimario}>
            {procesando ? "Registrando..." : "Confirmar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Modal stock mínimo ────────────────────────────────────────────

function ModalStockMinimo({ producto, onCerrar }: { producto: ProductoStock; onCerrar: () => void }) {
  const { actualizarProducto, procesando } = useStockStore();
  const [minimo, setMinimo] = useState(String(producto.stockMinimo ?? ""));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await actualizarProducto(producto.id, {
      stockMinimo: minimo !== "" ? Number(minimo) : null,
    });
    if (ok) onCerrar();
  };

  return (
    <Modal titulo={`Stock mínimo — ${producto.nombre}`} onCerrar={onCerrar}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">
          Cuando el stock baje de este umbral, el producto aparecerá en la sección de Alertas.
        </p>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-text-secondary">Stock mínimo (vacío = sin alerta)</label>
          <input
            type="number" min={0}
            value={minimo}
            onChange={(e) => setMinimo(e.target.value)}
            placeholder="Ej: 5"
            className={cn(inputCls, "text-xl font-bold text-center")}
          />
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onCerrar} className={btnSecundario}>Cancelar</button>
          <button type="submit" disabled={procesando} className={btnPrimario}>
            {procesando ? "..." : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Tab Movimientos ───────────────────────────────────────────────

function TabMovimientos() {
  const { movimientos, movimientosTotal, cargandoMovimientos, cargarMovimientos } = useStockStore();
  const [tipo, setTipo] = useState("");

  const aplicarFiltro = (t: string) => {
    setTipo(t);
    void cargarMovimientos({ tipo: t || undefined });
  };

  if (cargandoMovimientos) return <Skeleton />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 flex-wrap items-center">
        <select value={tipo} onChange={(e) => aplicarFiltro(e.target.value)} className={cn(inputCls, "w-44")}>
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_MOVIMIENTO_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <p className="text-sm text-text-secondary">{movimientosTotal} movimientos</p>
      </div>

      {movimientos.length === 0 ? (
        <div className="py-16 text-center text-text-secondary">
          <span className="text-4xl block mb-3">📋</span>
          <p>Sin movimientos registrados</p>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
          <div className="divide-y divide-border">
            {movimientos.map((m) => <FilaMovimiento key={m.id} movimiento={m} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function FilaMovimiento({ movimiento: m }: { movimiento: StockMovimiento }) {
  const cfg = configTipoMovimiento(m.tipo);
  const esIngreso = m.tipo === "ingreso" || (m.tipo === "ajuste" && m.cantidad > 0);
  const stockNuevo = m.cantidadAnterior + (esIngreso ? m.cantidad : -m.cantidad);

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/30 transition-colors">
      <span className="text-lg">{cfg.icono}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{m.producto.nombre}</p>
        <p className="text-xs text-text-secondary">
          {m.deposito.nombre} · {formatFecha(m.createdAt)}
          {m.motivo && ` · ${m.motivo}`}
        </p>
      </div>
      <div className="text-right">
        <p className={cn("font-bold", cfg.color)}>
          {cfg.signo}{Math.abs(m.cantidad)}
        </p>
        <p className="text-xs text-text-secondary">
          {m.cantidadAnterior} → {stockNuevo}
        </p>
      </div>
    </div>
  );
}

// ── Tab Alertas ───────────────────────────────────────────────────

function TabAlertas() {
  const { alertas } = useStockStore();

  if (alertas.length === 0) {
    return (
      <div className="py-16 text-center text-text-secondary">
        <span className="text-4xl block mb-3">✅</span>
        <p>Sin alertas — todos los productos están sobre su mínimo</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {alertas.map((alerta) => (
        <div
          key={alerta.id}
          className="bg-danger/5 border border-danger/30 rounded-xl px-4 py-3 flex items-center justify-between"
        >
          <div>
            <p className="font-medium text-text-primary">{alerta.nombre}</p>
            <p className="text-xs text-text-secondary">{alerta.categoria ?? "Sin categoría"}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-danger">{alerta.stockActual}</p>
            <p className="text-xs text-text-secondary">mínimo: {alerta.stockMinimo}</p>
          </div>
        </div>
      ))}
    </div>
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
          <button onClick={onCerrar} className="text-text-secondary text-xl">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="h-16 bg-surface rounded-xl border border-border animate-pulse" />
      ))}
    </div>
  );
}

const inputCls = "w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent transition-colors";
const btnPrimario = "flex-1 py-2.5 bg-accent text-black rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
const btnSecundario = "flex-1 py-2.5 bg-surface-2 border border-border text-text-secondary rounded-xl text-sm hover:border-text-secondary transition-colors";

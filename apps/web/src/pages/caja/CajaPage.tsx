/**
 * Módulo 3 — Caja / POS
 *
 * Layout split:
 *   Izquierda: búsqueda + lista de productos
 *   Derecha:   carrito + modal de pago
 *
 * Offline-first: vende sin internet, sincroniza al reconectar.
 */

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@niagara/ui";
import { useCajaStore } from "@/stores/cajaStore";
import type { MetodoPago, Producto } from "@niagara/core";
import { useAuthStore } from "@/stores/authStore";

// ── Helpers ─────────────────────────────────────────────────────

const ARS = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

const METODOS: { id: MetodoPago; label: string; icono: string }[] = [
  { id: "efectivo", label: "Efectivo", icono: "💵" },
  { id: "tarjeta", label: "Tarjeta", icono: "💳" },
  { id: "qr_mp", label: "QR / MP", icono: "📱" },
  { id: "cashless", label: "Cashless", icono: "🪙" },
  { id: "cortesia", label: "Cortesía", icono: "🎁" },
];

// ── Sub-componente: Badge de estado ─────────────────────────────

function BadgeEstado() {
  const { online, cola, sincronizando } = useCajaStore();

  if (sincronizando) {
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
        Sincronizando…
      </span>
    );
  }

  if (!online) {
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-danger/15 text-danger border border-danger/30">
        <span className="w-1.5 h-1.5 rounded-full bg-danger" />
        Sin conexión {cola.length > 0 && `· ${cola.length} pendiente${cola.length !== 1 ? "s" : ""}`}
      </span>
    );
  }

  if (cola.length > 0) {
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
        {cola.length} venta{cola.length !== 1 ? "s" : ""} por sync
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/30">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
      En línea
    </span>
  );
}

// ── Sub-componente: Selector de barra ───────────────────────────

function SelectorBarra() {
  const { barras, barraSeleccionada, seleccionarBarra } = useCajaStore();

  if (!barras.length) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-secondary">Barra:</span>
      <div className="flex gap-1">
        {barras.map((b) => (
          <button
            key={b.id}
            onClick={() => seleccionarBarra(b)}
            className={cn(
              "px-3 py-1 rounded-lg text-xs font-medium border transition-all",
              barraSeleccionada?.id === b.id
                ? "bg-lime/20 border-lime text-lime"
                : "bg-surface border-border text-text-secondary hover:border-lime/50"
            )}
          >
            {b.nombre}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Sub-componente: Tarjeta de producto ─────────────────────────

function TarjetaProducto({ producto }: { producto: Producto }) {
  const { agregarProducto } = useCajaStore();

  return (
    <button
      onClick={() => agregarProducto(producto)}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl",
        "bg-surface border border-border",
        "hover:border-lime/50 hover:bg-surface-2",
        "active:scale-[0.98] transition-all text-left group"
      )}
    >
      {/* Ícono categoría */}
      <div className="w-10 h-10 rounded-lg bg-surface-2 flex items-center justify-center text-lg flex-shrink-0">
        {getCategoriaIcon(producto.categoria)}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-primary truncate group-hover:text-lime transition-colors">
          {producto.nombre}
        </p>
        <p className="text-xs text-text-secondary">{producto.categoria}</p>
      </div>

      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-lime">{ARS(Number(producto.precio))}</p>
      </div>
    </button>
  );
}

function getCategoriaIcon(cat: string): string {
  const mapa: Record<string, string> = {
    Cerveza: "🍺",
    Tragos: "🍹",
    Destilados: "🥃",
    Espumantes: "🥂",
    "Sin Alcohol": "🧃",
    Vinos: "🍷",
    Shots: "🥃",
    Snacks: "🍟",
  };
  return mapa[cat] ?? "🛒";
}

// ── Sub-componente: Item del carrito ────────────────────────────

function ItemCarritoRow({
  item,
}: {
  item: { producto: Producto; cantidad: number; subtotal: number };
}) {
  const { cambiarCantidad, quitarProducto } = useCajaStore();

  return (
    <div className="flex items-center gap-2 py-2 border-b border-border/50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{item.producto.nombre}</p>
        <p className="text-xs text-text-secondary">{ARS(Number(item.producto.precio))} c/u</p>
      </div>

      {/* Controles de cantidad */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => cambiarCantidad(item.producto.id, item.cantidad - 1)}
          className="w-7 h-7 rounded-lg bg-surface-2 border border-border text-text-secondary hover:border-lime/50 hover:text-lime transition-colors text-sm font-bold"
        >
          −
        </button>
        <span className="w-6 text-center text-sm font-semibold text-text-primary">
          {item.cantidad}
        </span>
        <button
          onClick={() => cambiarCantidad(item.producto.id, item.cantidad + 1)}
          className="w-7 h-7 rounded-lg bg-surface-2 border border-border text-text-secondary hover:border-lime/50 hover:text-lime transition-colors text-sm font-bold"
        >
          +
        </button>
      </div>

      <div className="w-20 text-right">
        <p className="text-sm font-semibold text-lime">{ARS(item.subtotal)}</p>
      </div>

      <button
        onClick={() => quitarProducto(item.producto.id)}
        className="w-7 h-7 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors text-xs"
        title="Quitar"
      >
        ✕
      </button>
    </div>
  );
}

// ── Sub-componente: Modal de pago ───────────────────────────────

function ModalPago({
  eventoId,
  onCerrar,
  onExito,
}: {
  eventoId?: string;
  onCerrar: () => void;
  onExito: () => void;
}) {
  const {
    metodoPago,
    montoCobrado,
    procesando,
    setMetodoPago,
    setMontoCobrado,
    confirmarVenta,
    carrito,
  } = useCajaStore();

  const total = carrito.reduce((acc, i) => acc + i.subtotal, 0);
  const vuelto = Math.max(0, montoCobrado - total);
  const puedeConfirmar =
    metodoPago !== "efectivo" || montoCobrado >= total;

  const handleConfirmar = async () => {
    const ok = await confirmarVenta(eventoId);
    if (ok) onExito();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Fondo oscuro */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCerrar}
      />

      <div className="relative w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-text-primary">Cobrar</h2>
            <p className="text-2xl font-black text-lime mt-0.5">{ARS(total)}</p>
          </div>
          <button
            onClick={onCerrar}
            className="w-9 h-9 rounded-xl bg-surface-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Selector de método de pago */}
          <div>
            <p className="text-xs text-text-secondary mb-2 uppercase tracking-wider">
              Método de pago
            </p>
            <div className="grid grid-cols-5 gap-2">
              {METODOS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMetodoPago(m.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 py-3 rounded-xl border transition-all",
                    metodoPago === m.id
                      ? "border-lime bg-lime/15 text-lime"
                      : "border-border bg-surface-2 text-text-secondary hover:border-lime/40"
                  )}
                >
                  <span className="text-xl">{m.icono}</span>
                  <span className="text-[10px] font-medium leading-tight text-center">
                    {m.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Panel específico por método */}
          {metodoPago === "efectivo" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-secondary uppercase tracking-wider">
                  Recibido
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="0"
                  value={montoCobrado || ""}
                  onChange={(e) => setMontoCobrado(Number(e.target.value))}
                  className={cn(
                    "mt-1 w-full px-4 py-3 rounded-xl bg-surface-2 border text-text-primary",
                    "text-xl font-bold focus:outline-none focus:ring-2 focus:ring-lime/50",
                    "border-border placeholder-text-tertiary"
                  )}
                  autoFocus
                />
              </div>
              {montoCobrado > 0 && (
                <div
                  className={cn(
                    "flex items-center justify-between px-4 py-3 rounded-xl",
                    vuelto > 0 ? "bg-green-500/10 border border-green-500/30" : "bg-danger/10 border border-danger/30"
                  )}
                >
                  <span className="text-sm font-medium text-text-secondary">Vuelto</span>
                  <span
                    className={cn(
                      "text-xl font-black",
                      vuelto > 0 ? "text-green-400" : "text-danger"
                    )}
                  >
                    {ARS(vuelto)}
                  </span>
                </div>
              )}
              {/* Botones rápidos de monto */}
              <div className="flex gap-2 flex-wrap">
                {[total, ...calculaMontosRapidos(total)].map((monto) => (
                  <button
                    key={monto}
                    onClick={() => setMontoCobrado(monto)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-2 border border-border text-text-secondary hover:border-lime/50 hover:text-lime transition-colors"
                  >
                    {ARS(monto)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {metodoPago === "tarjeta" && (
            <div className="p-4 rounded-xl bg-surface-2 border border-border text-center space-y-1">
              <p className="text-2xl">💳</p>
              <p className="text-sm font-medium text-text-primary">
                Pasá la tarjeta en el posnet
              </p>
              <p className="text-xs text-text-secondary">
                Confirmá una vez que el pago esté aprobado
              </p>
            </div>
          )}

          {metodoPago === "qr_mp" && (
            <div className="p-4 rounded-xl bg-surface-2 border border-border text-center space-y-2">
              <p className="text-2xl">📱</p>
              <p className="text-sm font-medium text-text-primary">
                QR de Mercado Pago
              </p>
              <p className="text-xs text-text-secondary">
                Integración con MP disponible en el módulo Cashless (M4)
              </p>
              <p className="text-xs text-lime font-medium">
                Por ahora: confirmá manualmente cuando cobres
              </p>
            </div>
          )}

          {metodoPago === "cashless" && (
            <div className="p-4 rounded-xl bg-surface-2 border border-border text-center space-y-2">
              <p className="text-2xl">🪙</p>
              <p className="text-sm font-medium text-text-primary">
                Tarjeta / pulsera cashless
              </p>
              <p className="text-xs text-text-secondary">
                Sistema cashless disponible en el módulo 4
              </p>
              <p className="text-xs text-lime font-medium">
                Por ahora: registrar para reporte y sync posterior
              </p>
            </div>
          )}

          {metodoPago === "cortesia" && (
            <div className="p-4 rounded-xl bg-surface-2 border border-yellow-500/30 text-center space-y-1">
              <p className="text-2xl">🎁</p>
              <p className="text-sm font-medium text-yellow-400">
                Cortesía — sin cobro
              </p>
              <p className="text-xs text-text-secondary">
                Se registra para el control de stock e inventario
              </p>
            </div>
          )}

          {/* Botón confirmar */}
          <button
            onClick={() => void handleConfirmar()}
            disabled={!puedeConfirmar || procesando}
            className={cn(
              "w-full py-4 rounded-xl font-bold text-lg transition-all",
              puedeConfirmar && !procesando
                ? "bg-lime text-background hover:brightness-110 active:scale-[0.98]"
                : "bg-surface-2 text-text-secondary cursor-not-allowed border border-border"
            )}
          >
            {procesando ? "Procesando…" : "✓ Confirmar cobro"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Genera montos rápidos (billetes comunes) para pago en efectivo */
function calculaMontosRapidos(total: number): number[] {
  const billetes = [100, 200, 500, 1000, 2000, 5000, 10000];
  const sugeridos = new Set<number>();
  for (const b of billetes) {
    // Redondear al billete superior más cercano
    const redondeado = Math.ceil(total / b) * b;
    if (redondeado !== total && redondeado < total * 3) {
      sugeridos.add(redondeado);
    }
    if (sugeridos.size >= 3) break;
  }
  return [...sugeridos].slice(0, 3);
}

// ── Toast de éxito ───────────────────────────────────────────────

function ToastExito({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
      <div className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-green-500/20 border border-green-500/40 backdrop-blur-sm shadow-xl">
        <span className="text-2xl">✅</span>
        <div>
          <p className="text-sm font-bold text-green-400">Venta registrada</p>
          <p className="text-xs text-text-secondary">Carrito limpio para la siguiente venta</p>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────

export function CajaPage() {
  const {
    productos,
    cargandoProductos,
    carrito,
    online,
    setOnline,
    cargarProductos,
    cargarBarras,
    sincronizarCola,
    limpiarCarrito,
  } = useCajaStore();

  const { staff } = useAuthStore();
  const [busqueda, setBusqueda] = useState("");
  const [modalPago, setModalPago] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const busquedaRef = useRef<HTMLInputElement>(null);

  const total = carrito.reduce((acc, i) => acc + i.subtotal, 0);

  // Carga inicial
  useEffect(() => {
    void cargarProductos();
    void cargarBarras();
  }, [cargarProductos, cargarBarras]);

  // Escuchar cambios de conectividad
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [setOnline]);

  // Sincronizar al volver a estar online
  useEffect(() => {
    if (online) void sincronizarCola();
  }, [online, sincronizarCola]);

  // Productos filtrados por búsqueda
  const productosFiltrados = productos.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.categoria.toLowerCase().includes(busqueda.toLowerCase())
  );

  // Chequeo de rol
  const rolesPermitidos = ["cajero", "admin", "encargado", "barman"];
  if (staff && !rolesPermitidos.includes(staff.rol)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <span className="text-4xl">🔒</span>
        <p className="text-text-secondary">No tenés acceso a la caja</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-0 -m-6">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-text-primary">Caja</h1>
          <SelectorBarra />
        </div>
        <BadgeEstado />
      </div>

      {/* ── Contenido split ────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Panel izquierdo: Productos ────────────────── */}
        <div className="flex-1 flex flex-col border-r border-border overflow-hidden">
          {/* Búsqueda */}
          <div className="px-4 py-3 border-b border-border">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">🔍</span>
              <input
                ref={busquedaRef}
                type="text"
                placeholder="Buscar producto o categoría…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className={cn(
                  "w-full pl-9 pr-4 py-2.5 rounded-xl bg-surface-2 border border-border",
                  "text-text-primary text-sm placeholder-text-tertiary",
                  "focus:outline-none focus:ring-2 focus:ring-lime/40 focus:border-lime/50 transition-all"
                )}
              />
              {busqueda && (
                <button
                  onClick={() => { setBusqueda(""); busquedaRef.current?.focus(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors text-sm"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Lista de productos */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {cargandoProductos ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-text-secondary">
                <div className="w-6 h-6 border-2 border-lime border-t-transparent rounded-full animate-spin" />
                <p className="text-sm">Cargando productos…</p>
              </div>
            ) : productosFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-text-secondary">
                <span className="text-3xl">🔍</span>
                <p className="text-sm">
                  {busqueda ? `Sin resultados para "${busqueda}"` : "Sin productos disponibles"}
                </p>
                {busqueda && (
                  <button onClick={() => setBusqueda("")} className="text-lime text-xs hover:underline">
                    Limpiar búsqueda
                  </button>
                )}
              </div>
            ) : (
              productosFiltrados.map((p) => (
                <TarjetaProducto key={p.id} producto={p} />
              ))
            )}
          </div>

          {/* Cantidad de resultados */}
          {!cargandoProductos && (
            <div className="px-4 py-2 border-t border-border text-xs text-text-secondary">
              {productosFiltrados.length} producto{productosFiltrados.length !== 1 ? "s" : ""}
              {busqueda && ` · filtrado de ${productos.length}`}
            </div>
          )}
        </div>

        {/* ── Panel derecho: Carrito ────────────────────── */}
        <div className="w-80 flex flex-col bg-surface/50">
          {/* Header carrito */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
            <span className="text-sm font-semibold text-text-primary">
              Carrito {carrito.length > 0 && <span className="text-lime">({carrito.length})</span>}
            </span>
            {carrito.length > 0 && (
              <button
                onClick={limpiarCarrito}
                className="text-xs text-text-secondary hover:text-danger transition-colors"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Items del carrito */}
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {carrito.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-text-secondary py-8">
                <span className="text-4xl opacity-30">🛒</span>
                <p className="text-sm text-center">
                  Tocá un producto para agregarlo
                </p>
              </div>
            ) : (
              <div>
                {carrito.map((item) => (
                  <ItemCarritoRow key={item.producto.id} item={item} />
                ))}
              </div>
            )}
          </div>

          {/* Footer: total + botón cobrar */}
          <div className="p-4 border-t border-border flex-shrink-0 space-y-3">
            {/* Desglose si hay varios items */}
            {carrito.length > 1 && (
              <div className="space-y-1">
                {carrito.map((i) => (
                  <div key={i.producto.id} className="flex justify-between text-xs text-text-secondary">
                    <span className="truncate mr-2">{i.producto.nombre} x{i.cantidad}</span>
                    <span className="flex-shrink-0">{ARS(i.subtotal)}</span>
                  </div>
                ))}
                <div className="border-t border-border/50 mt-1" />
              </div>
            )}

            {/* Total */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary font-medium">Total</span>
              <span className="text-2xl font-black text-lime">{ARS(total)}</span>
            </div>

            {/* Botón cobrar */}
            <button
              onClick={() => setModalPago(true)}
              disabled={carrito.length === 0}
              className={cn(
                "w-full py-4 rounded-xl font-bold text-base transition-all",
                carrito.length > 0
                  ? "bg-lime text-background hover:brightness-110 active:scale-[0.98] shadow-lg shadow-lime/20"
                  : "bg-surface-2 text-text-secondary cursor-not-allowed border border-border"
              )}
            >
              {carrito.length > 0 ? `Cobrar ${ARS(total)}` : "Carrito vacío"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal de pago ──────────────────────────────────── */}
      {modalPago && (
        <ModalPago
          onCerrar={() => setModalPago(false)}
          onExito={() => {
            setModalPago(false);
            setToastVisible(true);
          }}
        />
      )}

      {/* ── Toast de éxito ─────────────────────────────────── */}
      {toastVisible && (
        <ToastExito onClose={() => setToastVisible(false)} />
      )}
    </div>
  );
}

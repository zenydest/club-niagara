/**
 * Módulo 3 — Caja / POS
 *
 * Layout split:
 *   Izquierda: búsqueda + lista de productos
 *   Derecha:   carrito + modal de pago
 *
 * Offline-first: vende sin internet, sincroniza al reconectar.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@niagara/ui";
import { useCajaStore } from "@/stores/cajaStore";
import { useCashlessStore } from "@/stores/cashlessStore";
import type { MetodoPago, Producto } from "@niagara/core";
import { useAuthStore } from "@/stores/authStore";
import { Icono, type NombreIcono } from "@/components/Icono";
import { useCobroPointStore } from "@/stores/cobroPointStore";
import { ModalCobroPoint } from "@/components/ModalCobroPoint";

// ── Helpers ─────────────────────────────────────────────────────

const ARS = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

const METODOS: { id: MetodoPago; label: string; icono: NombreIcono }[] = [
  { id: "efectivo", label: "Efectivo", icono: "efectivo" },
  { id: "tarjeta", label: "Tarjeta", icono: "tarjeta" },
  { id: "qr_mp", label: "QR / MP", icono: "qrMp" },
  { id: "cashless", label: "Cashless", icono: "fichas" },
  { id: "cortesia", label: "Cortesía", icono: "cortesia" },
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
      <div className="w-10 h-10 rounded-lg bg-surface-2 flex items-center justify-center text-text-secondary flex-shrink-0">
        <Icono nombre={getCategoriaIcon(producto.categoria)} tamano={20} />
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

/**
 * La categoría llega como texto libre desde la carta, así que normalizamos
 * antes de buscar: el encargado puede escribir "cervezas" o "Cerveza".
 */
function getCategoriaIcon(cat: string): NombreIcono {
  // Claves en singular: abajo se le saca la "s" final a lo que venga.
  const mapa: Record<string, NombreIcono> = {
    cerveza: "cerveza",
    trago: "trago",
    destilado: "destilado",
    espumante: "espumante",
    "sin alcohol": "sinAlcohol",
    vino: "vino",
    shot: "destilado",
    snack: "snack",
  };
  const clave = cat.trim().toLowerCase().replace(/s$/, "");
  return mapa[clave] ?? "carrito";
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
        className="w-7 h-7 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors flex items-center justify-center"
        title="Quitar"
        aria-label="Quitar del carrito"
      >
        <Icono nombre="cerrar" tamano={14} />
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
  // Estado para cashless: código y validación de saldo
  const [codigoCashless, setCodigoCashless] = useState("");
  const {
    tarjetaConsultada,
    consultando: consultandoCashless,
    errorConsulta: errorCashless,
    procesando: procesandoCashless,
    consultarTarjeta,
    cobrar: cobrarCashless,
    limpiarConsulta,
  } = useCashlessStore();

  const saldoCashlessSuficiente =
    tarjetaConsultada ? tarjetaConsultada.saldo >= total : false;

  // ── Cobro con terminal Point ────────────────────────────────
  const {
    terminales: todasLasTerminales,
    terminalId,
    cargarTerminales,
    setTerminal,
    cobrar: cobrarConPoint,
  } = useCobroPointStore();

  const { barraSeleccionada } = useCajaStore();
  const [modalPoint, setModalPoint] = useState(false);

  useEffect(() => {
    void cargarTerminales();
  }, [cargarTerminales]);

  /**
   * Terminales de esta barra.
   *
   * Con dos barras y una terminal cada una, mostrar las dos es pedir que
   * alguien cobre en la terminal de al lado: la plata entra igual, pero queda
   * atribuida a la otra barra y el corte de caja no cierra.
   *
   * Si ninguna terminal está asignada a la barra elegida se muestran todas, en
   * vez de dejar al cajero sin poder cobrar. Es el caso de un boliche que
   * todavía no asignó las terminales.
   */
  const terminales = useMemo(() => {
    if (!barraSeleccionada) return todasLasTerminales;

    const deLaBarra = todasLasTerminales.filter(
      (t) => t.barraId === barraSeleccionada.id
    );
    return deLaBarra.length > 0 ? deLaBarra : todasLasTerminales;
  }, [todasLasTerminales, barraSeleccionada]);

  const terminalesSinAsignar =
    barraSeleccionada !== null &&
    todasLasTerminales.length > 0 &&
    !todasLasTerminales.some((t) => t.barraId === barraSeleccionada.id);

  // Al cambiar de barra, la terminal guardada puede no pertenecer a la nueva.
  // Se reasigna sola cuando hay una sola candidata; si hay varias se limpia
  // para que el cajero elija a propósito y no cobre en la que quedó pegada.
  useEffect(() => {
    if (terminales.length === 0) return;
    if (terminalId && terminales.some((t) => t.id === terminalId)) return;

    setTerminal(terminales.length === 1 ? (terminales[0]?.id ?? null) : null);
  }, [terminales, terminalId, setTerminal]);

  // Si no hay ninguna terminal en PDV, el cobro sigue siendo manual, como era
  // antes. Es lo que corresponde: el boliche puede tener un posnet común que
  // no habla con el sistema.
  const hayTerminales = terminales.length > 0;

  // Tarjeta y QR van los dos por la terminal: el posnet ofrece las dos formas
  // sobre la misma orden. Lo que cambia es qué eligió el cajero de antemano,
  // y eso después se corrige con lo que MP informa que se usó realmente.
  const metodoVaPorTerminal = metodoPago === "tarjeta" || metodoPago === "qr_mp";
  const cobroPointDisponible = metodoVaPorTerminal && hayTerminales;

  // `!procesandoCashless` evita el doble débito: sin eso, un segundo clic
  // mientras el cobro está en vuelo vuelve a descontar saldo de la tarjeta.
  const puedeConfirmar =
    !procesandoCashless &&
    (metodoPago === "efectivo"
      ? montoCobrado >= total
      : metodoPago === "cashless"
        ? saldoCashlessSuficiente
        : cobroPointDisponible
          // Sin terminal elegida el cobro falla del otro lado; mejor no dejar
          // apretar el botón.
          ? terminalId !== null
          : true); // qr_mp, cortesía y tarjeta sin terminal: siempre habilitados

  const handleConfirmar = async () => {
    // Si es cashless: primero debitar saldo de la tarjeta
    if (metodoPago === "cashless") {
      if (!tarjetaConsultada) return;
      const cobro = await cobrarCashless(tarjetaConsultada.codigo, total);
      if (!cobro?.ok) return; // el error se muestra via errorConsulta
    }

    // Con terminal Point el orden importa: primero se cobra de verdad y recién
    // después se registra la venta. Al revés quedarían ventas registradas que
    // nunca se cobraron.
    //
    // El id se genera acá y se usa en los dos lados: como referencia de la
    // orden en MP y como id de la venta. Si el navegador se cierra entre el
    // cobro y el registro, ese id es lo que permite encontrar el cobro
    // huérfano desde el panel.
    if (cobroPointDisponible) {
      const ventaId = crypto.randomUUID();

      setModalPoint(true);
      const res = await cobrarConPoint({
        ventaId,
        monto: total,
        descripcion: `Consumo — ${carrito.length} ítem${carrito.length !== 1 ? "s" : ""}`,
      });

      if (!res.ok) return; // el modal muestra el motivo y lo cierra el cajero

      setModalPoint(false);

      // Se registra con lo que MP dice que se usó, no con lo que tocó el
      // cajero. Si MP no lo informa, queda el elegido.
      const ok = await confirmarVenta(
        eventoId,
        ventaId,
        ...(res.metodoReal ? [res.metodoReal] as const : [])
      );
      if (ok) {
        limpiarConsulta();
        onExito();
      }
      return;
    }

    const ok = await confirmarVenta(eventoId);
    if (ok) {
      limpiarConsulta();
      onExito();
    }
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
            className="w-9 h-9 rounded-xl bg-surface-2 text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center"
            aria-label="Cerrar"
          >
            <Icono nombre="cerrar" tamano={18} />
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
                  <Icono nombre={m.icono} tamano={20} />
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

          {/* Tarjeta y QR comparten panel: los dos se cobran con la terminal.
              Lo único que cambia es qué se le va a pedir al cliente. */}
          {metodoVaPorTerminal && (
            hayTerminales ? (
              <div className="p-4 rounded-xl bg-surface-2 border border-border space-y-3">
                <div className="flex items-center gap-2">
                  <Icono nombre="terminales" tamano={18} className="text-accent" />
                  <p className="text-sm font-medium text-text-primary">
                    {metodoPago === "qr_mp"
                      ? "Cobrar con QR en la terminal"
                      : "Cobrar con tarjeta en la terminal"}
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="terminal-cobro"
                    className="text-xs text-text-secondary uppercase tracking-wider"
                  >
                    Terminal
                  </label>
                  <select
                    id="terminal-cobro"
                    value={terminalId ?? ""}
                    onChange={(e) => setTerminal(e.target.value || null)}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl bg-surface border border-border text-text-primary text-sm focus:outline-none focus:border-accent transition-colors"
                  >
                    <option value="">Elegí una terminal…</option>
                    {terminales.map((t) => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </select>
                </div>

                <p className="text-xs text-text-secondary">
                  {metodoPago === "qr_mp"
                    ? "Al confirmar, el monto le llega a la terminal y ahí elegís Código QR para que el cliente lo escanee."
                    : "Al confirmar, el monto le llega sola a la terminal."}{" "}
                  La venta se registra recién cuando el pago sale aprobado.
                </p>

                {terminalesSinAsignar && (
                  <p className="text-xs text-warning">
                    Ninguna terminal está asignada a {barraSeleccionada?.nombre}.
                    Asignalas en Terminales para que cada barra vea solo la suya.
                  </p>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-surface-2 border border-border text-center space-y-1">
                <Icono
                  nombre={metodoPago === "qr_mp" ? "qrMp" : "tarjeta"}
                  tamano={26}
                  className="mx-auto text-text-secondary"
                />
                <p className="text-sm font-medium text-text-primary">
                  {metodoPago === "qr_mp"
                    ? "Cobrá el QR desde la app de Mercado Pago"
                    : "Pasá la tarjeta en el posnet"}
                </p>
                <p className="text-xs text-text-secondary">
                  Confirmá una vez que el pago esté aprobado
                </p>
              </div>
            )
          )}

          {metodoPago === "cashless" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Código de tarjeta / pulsera"
                  value={codigoCashless}
                  onChange={(e) => {
                    setCodigoCashless(e.target.value.toUpperCase());
                    limpiarConsulta();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && codigoCashless.trim()) {
                      void consultarTarjeta(codigoCashless.trim());
                    }
                  }}
                  className="flex-1 px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary font-mono text-sm focus:outline-none focus:ring-2 focus:ring-lime/40"
                  autoFocus
                />
                <button
                  onClick={() => void consultarTarjeta(codigoCashless.trim())}
                  disabled={!codigoCashless.trim() || consultandoCashless}
                  className="px-3 py-2.5 rounded-xl bg-lime/20 border border-lime/40 text-lime text-sm font-semibold hover:bg-lime/30 disabled:opacity-50 transition-all"
                >
                  {consultandoCashless ? "…" : "OK"}
                </button>
              </div>

              {errorCashless && (
                <p className="text-xs text-danger">{errorCashless}</p>
              )}

              {tarjetaConsultada && (
                <div className={cn(
                  "px-4 py-3 rounded-xl border",
                  saldoCashlessSuficiente
                    ? "bg-green-500/10 border-green-500/30"
                    : "bg-danger/10 border-danger/30"
                )}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono font-bold text-lime text-sm">{tarjetaConsultada.codigo}</p>
                      {tarjetaConsultada.clienteNombre && (
                        <p className="text-xs text-text-secondary">{tarjetaConsultada.clienteNombre}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className={cn("text-lg font-black", saldoCashlessSuficiente ? "text-green-400" : "text-danger")}>
                        {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(tarjetaConsultada.saldo)}
                      </p>
                      <p className="text-[10px] text-text-secondary">saldo disponible</p>
                    </div>
                  </div>
                  {!saldoCashlessSuficiente && (
                    <p className="text-xs text-danger mt-1.5">
                      Saldo insuficiente — faltan{" "}
                      {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(total - tarjetaConsultada.saldo)}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {metodoPago === "cortesia" && (
            <div className="p-4 rounded-xl bg-surface-2 border border-yellow-500/30 text-center space-y-1">
              <Icono nombre="cortesia" tamano={26} className="mx-auto text-yellow-400" />
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
              "flex items-center justify-center gap-2",
              puedeConfirmar && !procesando
                ? "bg-accent text-white hover:brightness-110 active:scale-[0.98]"
                : "bg-surface-2 text-text-secondary cursor-not-allowed border border-border"
            )}
          >
            {procesando ? (
              <>
                <Icono nombre="cargando" tamano={20} girando />
                Procesando…
              </>
            ) : (
              <>
                <Icono nombre="ok" tamano={20} />
                Confirmar cobro
              </>
            )}
          </button>
        </div>
      </div>

      {modalPoint && (
        <ModalCobroPoint monto={total} onCerrar={() => setModalPoint(false)} />
      )}

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
        <Icono nombre="ok" tamano={24} className="text-green-400" />
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
        <Icono nombre="cerrarCaja" tamano={40} className="text-text-muted" />
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
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
                <Icono nombre="buscar" tamano={16} />
              </span>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors"
                  aria-label="Limpiar búsqueda"
                >
                  <Icono nombre="cerrar" tamano={14} />
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
                <Icono nombre="buscar" tamano={30} className="text-text-muted" />
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
                <Icono nombre="carrito" tamano={40} className="opacity-30" />
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
                  ? "bg-accent text-white hover:brightness-110 active:scale-[0.98] shadow-lg shadow-lime/20"
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

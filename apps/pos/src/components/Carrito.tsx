import React, { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { cn } from "@niagara/ui";
import { usePosStore, selectTotal, selectCantidadItems } from "@/stores/posStore";
import { useCobroPointStore } from "@/stores/cobroPointStore";
import { ModalCobroPoint } from "@/components/ModalCobroPoint";
import type { MetodoPago } from "@niagara/core";
import { METODO_PAGO_LABELS } from "@niagara/core";

const METODOS: MetodoPago[] = ["efectivo", "tarjeta", "cashless", "qr_mp", "cortesia"];

const ICONO_METODO: Record<MetodoPago, string> = {
  efectivo: "💵",
  tarjeta: "💳",
  cashless: "🏷️",
  qr_mp: "📱",
  cortesia: "🎁",
};

/**
 * Panel del carrito del POS.
 * Lista de items + total + botones de cobro por método de pago.
 */
export function Carrito() {
  const {
    carrito,
    quitarProducto,
    actualizarCantidad,
    limpiarCarrito,
    cobrarVenta,
  } = usePosStore();

  const total = usePosStore(selectTotal);
  const cantidadItems = usePosStore(selectCantidadItems);

  const { cobrar: cobrarConPoint, terminalId } = useCobroPointStore();

  const [cobrando, setCobrando] = useState(false);
  const [ultimaVenta, setUltimaVenta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [montoEnCobro, setMontoEnCobro] = useState<number | null>(null);

  const formatearPesos = (monto: number) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(monto);

  const registrarExito = (ventaId: string) => {
    setUltimaVenta(ventaId.slice(0, 8).toUpperCase());
    setTimeout(() => setUltimaVenta(null), 4000);
  };

  /**
   * Tarjeta va por la terminal Point: primero se cobra y solo si el pago se
   * aprueba se registra la venta. El id se genera acá porque se usa como
   * referencia de la orden en MP y tiene que coincidir con la venta.
   */
  const handleCobrarConTerminal = async () => {
    if (!terminalId) {
      setError("Elegí una terminal antes de cobrar con tarjeta");
      return;
    }

    const ventaId = uuidv4();
    setError(null);
    setCobrando(true);
    setMontoEnCobro(total);

    const cobro = await cobrarConPoint({
      ventaId,
      monto: total,
      descripcion: `Club Niágara · ${cantidadItems} ítem${cantidadItems > 1 ? "s" : ""}`,
    });

    if (cobro.ok) {
      // El cobro ya entró: la venta se registra con el mismo id, y si falla
      // queda en la cola offline para reintentarse.
      const resultado = await cobrarVenta("tarjeta", { ventaId });
      if (resultado.ok) {
        registrarExito(ventaId);
      } else {
        setError(
          `El pago se aprobó pero la venta no se registró: ${resultado.error ?? "error desconocido"}`
        );
      }
    }

    setCobrando(false);
  };

  const handleCobrar = async (metodoPago: MetodoPago) => {
    if (metodoPago === "tarjeta") {
      await handleCobrarConTerminal();
      return;
    }

    setCobrando(true);
    setError(null);

    const resultado = await cobrarVenta(metodoPago);

    if (resultado.ok && resultado.ventaId) {
      registrarExito(resultado.ventaId);
    } else {
      setError(resultado.error ?? "Error al procesar la venta");
    }

    setCobrando(false);
  };

  return (
    <div className="flex flex-col h-full">
      {montoEnCobro !== null && (
        <ModalCobroPoint monto={montoEnCobro} onCerrar={() => setMontoEnCobro(null)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border">
        <span className="font-bold text-text-primary">
          Carrito{" "}
          {cantidadItems > 0 && (
            <span className="text-lime">({cantidadItems})</span>
          )}
        </span>
        {carrito.length > 0 && (
          <button
            onClick={limpiarCarrito}
            className="text-xs text-text-muted hover:text-danger transition-colors"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Éxito de venta */}
      {ultimaVenta && (
        <div className="mx-4 mt-3 bg-success/10 border border-success/30 rounded-xl px-4 py-3 text-success text-sm font-semibold text-center animate-fade-in">
          ✓ Venta #{ultimaVenta} guardada
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-danger text-xs">
          {error}
        </div>
      )}

      {/* Items del carrito */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {carrito.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <span className="text-3xl">🛒</span>
            <p className="text-text-muted text-sm">Sin productos</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {carrito.map((item) => (
              <li
                key={item.producto.id}
                className="flex items-center gap-3 py-2 border-b border-border last:border-0"
              >
                {/* Nombre */}
                <span className="flex-1 text-sm text-text-primary leading-tight min-w-0 truncate">
                  {item.producto.nombre}
                </span>

                {/* Cantidad */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => actualizarCantidad(item.producto.id, item.cantidad - 1)}
                    className="w-6 h-6 rounded-md bg-surface-2 text-text-secondary hover:text-danger transition-colors text-sm font-bold"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-bold text-text-primary">
                    {item.cantidad}
                  </span>
                  <button
                    onClick={() => actualizarCantidad(item.producto.id, item.cantidad + 1)}
                    className="w-6 h-6 rounded-md bg-surface-2 text-text-secondary hover:text-lime transition-colors text-sm font-bold"
                  >
                    +
                  </button>
                </div>

                {/* Subtotal */}
                <span className="text-sm font-bold text-lime w-20 text-right">
                  {formatearPesos(item.subtotal)}
                </span>

                {/* Quitar */}
                <button
                  onClick={() => quitarProducto(item.producto.id)}
                  className="text-text-muted hover:text-danger transition-colors text-xs ml-1"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Total y cobro */}
      <div className="border-t border-border p-4 flex flex-col gap-3">
        {/* Total */}
        <div className="flex items-center justify-between">
          <span className="text-text-secondary font-medium">Total</span>
          <span className="text-2xl font-black text-lime">{formatearPesos(total)}</span>
        </div>

        {/* Botones de cobro */}
        {carrito.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {METODOS.map((metodo) => (
              <button
                key={metodo}
                onClick={() => void handleCobrar(metodo)}
                disabled={cobrando}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-bold",
                  "border border-border bg-surface-2",
                  "hover:border-lime/50 hover:bg-lime/5 hover:text-lime",
                  "active:scale-95 transition-all duration-100",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  metodo === "efectivo" && "col-span-2 border-lime/30 text-lime"
                )}
              >
                <span>{ICONO_METODO[metodo]}</span>
                <span>{METODO_PAGO_LABELS[metodo]}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center text-text-muted text-xs py-2">
            Agregá productos para cobrar
          </div>
        )}
      </div>
    </div>
  );
}

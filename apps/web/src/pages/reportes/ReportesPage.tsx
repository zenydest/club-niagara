/**
 * Módulo 7 — Reportes + Corte de Caja
 *
 * Tabs:
 *  - Resumen: KPIs del período, desglose por método de pago, gráfico por hora
 *  - Productos: top N productos vendidos
 *  - Ventas: listado paginado con filtros
 *  - Corte de caja: crear y cerrar cortes
 */

import React, { useState, useEffect, useCallback } from "react";
import { cn } from "@niagara/ui";
import { Icono, type NombreIcono } from "@/components/Icono";
import {
  useReportesStore,
  METODO_PAGO_CONFIG,
  configMetodoPago,
  type CorteCaja,
  type VentaReporte,
  type ResumenKPI,
} from "@/stores/reportesStore";

// ── Tipos locales ─────────────────────────────────────────────────

type Tab = "resumen" | "productos" | "ventas" | "corte";

// ── Helpers ───────────────────────────────────────────────────────

function formatPeso(n: number): string {
  return `$${n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatFechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function labelFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    weekday: "short", day: "numeric", month: "short",
  });
}

// ── Componente principal ──────────────────────────────────────────

export function ReportesPage() {
  const [tab, setTab] = useState<Tab>("resumen");
  const {
    filtros, setFiltros, cargarTodo, cargandoResumen, error, limpiarError,
  } = useReportesStore();

  useEffect(() => {
    void cargarTodo();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const aplicarFiltros = useCallback(() => {
    void cargarTodo();
  }, [cargarTodo]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Reportes</h1>
          <p className="text-sm text-text-secondary mt-0.5">Análisis y corte de caja</p>
        </div>

        {/* Selector de período */}
        <div className="flex items-center gap-2 flex-wrap">
          <BotonesRapidosFecha onChange={(desde, hasta) => {
            setFiltros({ fechaDesde: desde, fechaHasta: hasta });
            setTimeout(() => void cargarTodo(), 0);
          }} />
          <input
            type="datetime-local"
            value={filtros.fechaDesde.slice(0, 16)}
            onChange={(e) => setFiltros({ fechaDesde: new Date(e.target.value).toISOString() })}
            className={inputCls}
          />
          <Icono nombre="avanzar" tamano={14} className="text-text-secondary" />
          <input
            type="datetime-local"
            value={filtros.fechaHasta.slice(0, 16)}
            onChange={(e) => setFiltros({ fechaHasta: new Date(e.target.value).toISOString() })}
            className={inputCls}
          />
          <button
            onClick={aplicarFiltros}
            disabled={cargandoResumen}
            className="px-4 py-2 bg-accent text-black rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors disabled:opacity-60"
          >
            {cargandoResumen ? "Cargando..." : "Aplicar"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-danger">{error}</p>
          <button onClick={limpiarError} className="text-danger ml-4" aria-label="Cerrar">
            <Icono nombre="cerrar" tamano={16} />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-2 rounded-xl p-1 w-fit flex-wrap">
        {(["resumen", "productos", "ventas", "corte"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all",
              tab === t ? "bg-accent text-black shadow" : "text-text-secondary hover:text-text-primary"
            )}
          >
            {{ resumen: "Resumen", productos: "Productos", ventas: "Ventas", corte: "Corte de caja" }[t]}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === "resumen"   && <TabResumen />}
      {tab === "productos" && <TabProductos />}
      {tab === "ventas"    && <TabVentas />}
      {tab === "corte"     && <TabCorte />}
    </div>
  );
}

// ── Botones rápidos de fecha ──────────────────────────────────────

function BotonesRapidosFecha({ onChange }: { onChange: (desde: string, hasta: string) => void }) {
  const hoy = () => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const h = new Date(); h.setHours(23, 59, 59, 999);
    return [d.toISOString(), h.toISOString()] as const;
  };

  const ayer = () => {
    const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(0, 0, 0, 0);
    const h = new Date(); h.setDate(h.getDate() - 1); h.setHours(23, 59, 59, 999);
    return [d.toISOString(), h.toISOString()] as const;
  };

  const semana = () => {
    const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(0, 0, 0, 0);
    const h = new Date(); h.setHours(23, 59, 59, 999);
    return [d.toISOString(), h.toISOString()] as const;
  };

  return (
    <div className="flex gap-1">
      {[
        { label: "Hoy",    fn: hoy },
        { label: "Ayer",   fn: ayer },
        { label: "7 días", fn: semana },
      ].map(({ label, fn }) => (
        <button
          key={label}
          onClick={() => { const [d, h] = fn(); onChange(d, h); }}
          className="px-3 py-1.5 bg-surface-2 border border-border rounded-lg text-xs text-text-secondary hover:border-accent hover:text-accent transition-colors"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Tab Resumen ───────────────────────────────────────────────────

function TabResumen() {
  const { resumen, ventasPorHora, cargandoResumen } = useReportesStore();

  if (cargandoResumen) return <SkeletonKPIs />;
  if (!resumen) return <EstadoVacio mensaje="No hay datos para el período seleccionado" />;

  const { ventas, recargas, entradas, accesos, ingresosBrutos } = resumen;

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          titulo="Ingresos brutos"
          valor={formatPeso(ingresosBrutos)}
          subtitulo="ventas + entradas"
          icono="reportes"
          destacado
        />
        <KPICard
          titulo="Ventas caja"
          valor={formatPeso(ventas.total)}
          subtitulo={`${ventas.cantidad} transacciones`}
          icono="caja"
        />
        <KPICard
          titulo="Entradas"
          valor={formatPeso(entradas.total)}
          subtitulo={`${entradas.cantidad} vendidas · ${entradas.usadas} usadas`}
          icono="entrada"
        />
        <KPICard
          titulo="Recargas cashless"
          valor={formatPeso(recargas.total)}
          subtitulo={`${recargas.cantidad} recargas`}
          icono="billetera"
        />
      </div>

      {/* Aforo */}
      <div className="grid grid-cols-3 gap-4">
        <KPICard titulo="Ingresos" valor={String(accesos.ingresos)} icono="ingreso" />
        <KPICard titulo="Egresos"  valor={String(accesos.egresos)}  icono="egreso" />
        <KPICard titulo="En local" valor={String(accesos.aforoActual)} icono="aforo" destacado={accesos.aforoActual > 0} />
      </div>

      {/* Desglose por método de pago */}
      <div className="bg-surface rounded-2xl border border-border p-5">
        <h3 className="text-sm font-semibold text-text-secondary mb-4">Ventas por método de pago</h3>
        <div className="flex flex-col gap-3">
          {Object.entries(ventas.porMetodo).map(([metodo, datos]) => {
            const cfg = configMetodoPago(metodo);
            const porcentaje = ventas.total > 0 ? (datos.monto / ventas.total) * 100 : 0;
            return (
              <div key={metodo} className="flex items-center gap-3">
                <Icono nombre={cfg.icono} tamano={18} className={cn("w-6", cfg.color)} />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-text-primary font-medium">{cfg.label}</span>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-text-secondary">{datos.cantidad} ventas</span>
                      <span className={cn("font-bold", cfg.color)}>{formatPeso(datos.monto)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all"
                      style={{ width: `${porcentaje}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs text-text-secondary w-10 text-right">
                  {porcentaje.toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gráfico ventas por hora */}
      {ventasPorHora.length > 0 && (
        <GraficoVentasPorHora datos={ventasPorHora} />
      )}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────

function KPICard({
  titulo, valor, subtitulo, icono, destacado,
}: {
  titulo: string;
  valor: string;
  subtitulo?: string;
  icono: NombreIcono;
  destacado?: boolean;
}) {
  return (
    <div className={cn(
      "bg-surface rounded-2xl border p-4 flex flex-col gap-2",
      destacado ? "border-accent/30 bg-accent/5" : "border-border"
    )}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary font-medium">{titulo}</span>
        <Icono
          nombre={icono}
          tamano={18}
          className={destacado ? "text-accent" : "text-text-muted"}
        />
      </div>
      <p className={cn("text-2xl font-bold", destacado ? "text-accent" : "text-text-primary")}>
        {valor}
      </p>
      {subtitulo && <p className="text-xs text-text-secondary">{subtitulo}</p>}
    </div>
  );
}

// ── Gráfico barras por hora ───────────────────────────────────────

function GraficoVentasPorHora({ datos }: { datos: { hora: number; total: number; cantidad: number }[] }) {
  const maxTotal = Math.max(...datos.map((d) => d.total), 1);
  // Mostrar solo horas con actividad + contexto
  const horasConActividad = datos
    .map((d, i) => ({ ...d, i }))
    .filter(
      (d) =>
        d.total > 0 ||
        (datos[d.i - 1]?.total ?? 0) > 0 ||
        (datos[d.i + 1]?.total ?? 0) > 0
    );

  if (horasConActividad.length === 0) return null;

  return (
    <div className="bg-surface rounded-2xl border border-border p-5">
      <h3 className="text-sm font-semibold text-text-secondary mb-4">Ventas por hora</h3>
      <div className="flex items-end gap-1 h-32 overflow-x-auto pb-6 relative">
        {datos.map(({ hora, total, cantidad }) => {
          const pct = (total / maxTotal) * 100;
          return (
            <div key={hora} className="flex flex-col items-center gap-1 flex-shrink-0 group" style={{ width: "3.5%" }}>
              {/* Tooltip */}
              {total > 0 && (
                <div className="absolute -top-1 opacity-0 group-hover:opacity-100 transition-opacity bg-surface-2 border border-border rounded-lg px-2 py-1 text-xs text-text-primary whitespace-nowrap z-10 pointer-events-none -translate-y-full">
                  {hora}:00 — {formatPeso(total)} ({cantidad})
                </div>
              )}
              <div className="flex-1 w-full flex items-end">
                <div
                  className={cn(
                    "w-full rounded-t transition-all",
                    total > 0 ? "bg-accent/80 group-hover:bg-accent" : "bg-surface-2"
                  )}
                  style={{ height: `${Math.max(pct, total > 0 ? 4 : 0)}%` }}
                />
              </div>
              <span className="text-[9px] text-text-secondary leading-none absolute bottom-0">
                {hora % 4 === 0 ? `${hora}h` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab Productos ─────────────────────────────────────────────────

function TabProductos() {
  const { productosTop, cargandoProductos } = useReportesStore();

  if (cargandoProductos) return <Skeleton />;

  if (productosTop.length === 0) {
    return <EstadoVacio mensaje="Sin ventas en el período seleccionado" />;
  }

  const maxMonto = Math.max(...productosTop.map((p) => p.montoTotal), 1);

  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
      <div className="p-5 border-b border-border">
        <h3 className="font-semibold text-text-primary">Top productos</h3>
        <p className="text-xs text-text-secondary mt-0.5">Por monto total vendido</p>
      </div>
      <div className="divide-y divide-border">
        {productosTop.map((p, idx) => {
          const pct = (p.montoTotal / maxMonto) * 100;
          return (
            <div key={p.productoId} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2/30 transition-colors">
              {/* Posición */}
              <span className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0",
                idx === 0 ? "bg-yellow-400/20 text-yellow-400" :
                idx === 1 ? "bg-zinc-400/20 text-zinc-400" :
                idx === 2 ? "bg-orange-400/20 text-orange-400" :
                "bg-surface-2 text-text-secondary"
              )}>
                {idx + 1}
              </span>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{p.nombre}</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                    <div className="h-full bg-accent/60 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>

              {/* Métricas */}
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-text-primary">{formatPeso(p.montoTotal)}</p>
                <p className="text-xs text-text-secondary">{p.cantidadVendida} unidades</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab Ventas ────────────────────────────────────────────────────

function TabVentas() {
  const { ventas, ventasTotal, ventasPagina, cargandoVentas, filtros, setFiltros, cargarVentas } = useReportesStore();
  const [expandida, setExpandida] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={filtros.metodoPago ?? ""}
          onChange={(e) => { setFiltros({ metodoPago: e.target.value || undefined }); void cargarVentas(1); }}
          className={cn(inputCls, "w-40")}
        >
          <option value="">Todos los métodos</option>
          {Object.entries(METODO_PAGO_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <p className="text-sm text-text-secondary self-center">
          {ventasTotal} venta{ventasTotal !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Lista */}
      {cargandoVentas ? <Skeleton /> : (
        <>
          {ventas.length === 0 ? (
            <EstadoVacio mensaje="Sin ventas en el período" />
          ) : (
            <div className="flex flex-col gap-2">
              {ventas.map((venta) => (
                <TarjetaVenta
                  key={venta.id}
                  venta={venta}
                  expandida={expandida === venta.id}
                  onToggle={() => setExpandida(expandida === venta.id ? null : venta.id)}
                />
              ))}
            </div>
          )}

          {/* Paginación */}
          {ventasTotal > 50 && (
            <div className="flex justify-center gap-2 mt-2">
              <button
                disabled={ventasPagina === 1}
                onClick={() => void cargarVentas(ventasPagina - 1)}
                className="px-4 py-2 rounded-xl text-sm border border-border text-text-secondary hover:border-accent disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                <Icono nombre="volver" tamano={14} />
                Anterior
              </button>
              <span className="px-4 py-2 text-sm text-text-secondary">
                Pág. {ventasPagina} de {Math.ceil(ventasTotal / 50)}
              </span>
              <button
                disabled={ventasPagina >= Math.ceil(ventasTotal / 50)}
                onClick={() => void cargarVentas(ventasPagina + 1)}
                className="px-4 py-2 rounded-xl text-sm border border-border text-text-secondary hover:border-accent disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                Siguiente
                <Icono nombre="avanzar" tamano={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Tarjeta de venta ──────────────────────────────────────────────

function TarjetaVenta({ venta, expandida, onToggle }: {
  venta: VentaReporte;
  expandida: boolean;
  onToggle: () => void;
}) {
  const cfg = configMetodoPago(venta.metodoPago);

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-surface-2/30 transition-colors"
        onClick={onToggle}
      >
        <Icono nombre={cfg.icono} tamano={18} className={cfg.color} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {venta.barra?.nombre ?? "Sin barra"} · {venta.staff.nombre} {venta.staff.apellido}
          </p>
          <p className="text-xs text-text-secondary">{formatFechaCorta(venta.createdAt)}</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-text-primary">{formatPeso(venta.total)}</p>
          {venta.descuento > 0 && (
            <p className="text-xs text-danger">-{formatPeso(venta.descuento)}</p>
          )}
        </div>
        <span className="text-text-secondary text-sm ml-2">{expandida ? "▲" : "▼"}</span>
      </div>

      {expandida && (
        <div className="border-t border-border px-4 py-3">
          <p className="text-xs text-text-secondary mb-2 font-medium">Detalle de items</p>
          <div className="flex flex-col gap-1.5">
            {venta.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">
                  {item.cantidad}× {item.producto.nombre}
                </span>
                <span className="text-text-primary font-medium">{formatPeso(item.subtotal)}</span>
              </div>
            ))}
          </div>
          {venta.nota && (
            <p className="text-xs text-text-secondary mt-2 italic">{venta.nota}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab Corte de Caja ─────────────────────────────────────────────

function TabCorte() {
  const { cortes, resumen, crearCorte, cerrarCorte, cargandoCortes, procesando } = useReportesStore();
  const [modalNuevoCorte, setModalNuevoCorte] = useState(false);
  const [corteCerrando, setCorteCerrando] = useState<CorteCaja | null>(null);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-text-primary">Historial de cortes</h3>
          <p className="text-xs text-text-secondary mt-0.5">{cortes.length} cortes registrados</p>
        </div>
        <button
          onClick={() => setModalNuevoCorte(true)}
          className="px-4 py-2 bg-accent text-black rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors"
        >
          + Nuevo corte
        </button>
      </div>

      {/* Vista previa del resumen actual */}
      {resumen && (
        <div className="bg-accent/5 border border-accent/20 rounded-2xl p-4">
          <p className="text-xs font-semibold text-accent mb-3">Resumen del período actual</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div>
              <p className="text-lg font-bold text-text-primary">{formatPeso(resumen.ventas.porMetodo.efectivo.monto)}</p>
              <p className="text-xs text-text-secondary">Efectivo esperado</p>
            </div>
            <div>
              <p className="text-lg font-bold text-text-primary">{formatPeso(resumen.ventas.porMetodo.tarjeta.monto)}</p>
              <p className="text-xs text-text-secondary">Tarjeta</p>
            </div>
            <div>
              <p className="text-lg font-bold text-text-primary">{formatPeso(resumen.ventas.porMetodo.cashless.monto)}</p>
              <p className="text-xs text-text-secondary">Cashless</p>
            </div>
            <div>
              <p className="text-lg font-bold text-accent">{formatPeso(resumen.ventas.total)}</p>
              <p className="text-xs text-text-secondary">Total ventas</p>
            </div>
          </div>
        </div>
      )}

      {/* Lista de cortes */}
      {cargandoCortes ? <Skeleton /> : (
        cortes.length === 0 ? (
          <EstadoVacio mensaje="No hay cortes registrados" />
        ) : (
          <div className="flex flex-col gap-3">
            {cortes.map((corte) => (
              <TarjetaCorte
                key={corte.id}
                corte={corte}
                onCerrar={() => setCorteCerrando(corte)}
                procesando={procesando}
              />
            ))}
          </div>
        )
      )}

      {/* Modal nuevo corte */}
      {modalNuevoCorte && (
        <Modal titulo="Nuevo corte de caja" onCerrar={() => setModalNuevoCorte(false)}>
          <ModalNuevoCorte
            resumen={resumen}
            onCrear={async (datos) => {
              const corte = await crearCorte(datos);
              if (corte) setModalNuevoCorte(false);
            }}
            onCancelar={() => setModalNuevoCorte(false)}
          />
        </Modal>
      )}

      {/* Modal cerrar corte */}
      {corteCerrando && (
        <Modal titulo="Cerrar corte" onCerrar={() => setCorteCerrando(null)}>
          <ModalCerrarCorte
            corte={corteCerrando}
            onCerrar={async (efectivoReal, nota) => {
              const ok = await cerrarCorte(corteCerrando.id, efectivoReal, nota);
              if (ok) setCorteCerrando(null);
            }}
            onCancelar={() => setCorteCerrando(null)}
          />
        </Modal>
      )}
    </div>
  );
}

// ── Tarjeta de corte ──────────────────────────────────────────────

function TarjetaCorte({ corte, onCerrar, procesando }: {
  corte: CorteCaja;
  onCerrar: () => void;
  procesando: boolean;
}) {
  const [expandida, setExpandida] = useState(false);
  const cerrado = Boolean(corte.cerradoAt);
  const diferencia = corte.diferencia ?? 0;

  return (
    <div className={cn(
      "bg-surface rounded-xl border overflow-hidden",
      cerrado ? "border-border" : "border-accent/30"
    )}>
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-surface-2/30 transition-colors"
        onClick={() => setExpandida(!expandida)}
      >
        {/* Estado */}
        <div className={cn(
          "w-2 self-stretch rounded-full flex-shrink-0",
          cerrado ? (diferencia >= 0 ? "bg-green-400" : "bg-danger") : "bg-accent"
        )} />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-text-primary">
              {corte.staff.nombre} {corte.staff.apellido}
            </span>
            <span className={cn(
              "px-2 py-0.5 rounded text-[11px] font-medium",
              cerrado ? "bg-surface-2 text-text-secondary" : "bg-accent/20 text-accent"
            )}>
              {cerrado ? "Cerrado" : "Abierto"}
            </span>
            {corte.barra && (
              <span className="text-xs text-text-secondary bg-surface-2 px-2 py-0.5 rounded">
                {corte.barra.nombre}
              </span>
            )}
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            {labelFecha(corte.createdAt)}
            {corte.cerradoAt && ` → ${labelFecha(corte.cerradoAt)}`}
          </p>
        </div>

        {/* Total + diferencia */}
        <div className="text-right flex-shrink-0">
          <p className="font-bold text-text-primary">{formatPeso(corte.totalVentas)}</p>
          {cerrado && corte.diferencia !== null && (
            <p className={cn("text-xs font-medium", diferencia >= 0 ? "text-green-400" : "text-danger")}>
              {diferencia >= 0 ? "+" : ""}{formatPeso(diferencia)}
            </p>
          )}
        </div>

        {/* Acciones */}
        {!cerrado && (
          <button
            onClick={(e) => { e.stopPropagation(); onCerrar(); }}
            disabled={procesando}
            className="px-3 py-1.5 bg-accent text-black rounded-lg text-xs font-semibold hover:bg-accent/90 transition-colors flex-shrink-0"
          >
            Cerrar
          </button>
        )}

        <span className="text-text-secondary text-sm">{expandida ? "▲" : "▼"}</span>
      </div>

      {expandida && (
        <div className="border-t border-border px-4 py-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-text-secondary">Efectivo esperado</p>
              <p className="font-semibold text-text-primary">{formatPeso(corte.ventasEfectivo)}</p>
            </div>
            {cerrado && corte.efectivoReal !== null && (
              <div>
                <p className="text-xs text-text-secondary">Efectivo declarado</p>
                <p className="font-semibold text-text-primary">{formatPeso(corte.efectivoReal)}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-text-secondary">Tarjeta</p>
              <p className="font-semibold text-text-primary">{formatPeso(corte.ventasTarjeta)}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">Cashless</p>
              <p className="font-semibold text-text-primary">{formatPeso(corte.ventasCashless)}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">QR/MP</p>
              <p className="font-semibold text-text-primary">{formatPeso(corte.ventasQr)}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">Cortesía</p>
              <p className="font-semibold text-text-primary">{formatPeso(corte.ventasCortesia)}</p>
            </div>
          </div>
          {corte.nota && (
            <p className="text-xs text-text-secondary mt-3 italic">{corte.nota}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Modal nuevo corte ─────────────────────────────────────────────

function ModalNuevoCorte({ resumen, onCrear, onCancelar }: {
  // `ReturnType<typeof useReportesStore>` resuelve a `unknown` (zustand tiene
  // sobrecargas para la versión con selector), así que el tipo se importa directo.
  resumen: ResumenKPI | null;
  onCrear: (datos: { nota?: string }) => Promise<void>;
  onCancelar: () => void;
}) {
  const [nota, setNota] = useState("");
  const { procesando } = useReportesStore();

  return (
    <div className="flex flex-col gap-4">
      {resumen && (
        <div className="bg-surface-2 rounded-xl p-4 text-sm">
          <p className="text-text-secondary mb-2 text-xs font-medium">Se calculará automáticamente:</p>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="text-text-secondary">Efectivo esperado</span>
              <span className="font-semibold text-text-primary">{formatPeso(resumen.ventas.porMetodo.efectivo.monto)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Total ventas</span>
              <span className="font-semibold text-accent">{formatPeso(resumen.ventas.total)}</span>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-text-secondary">Nota (opcional)</label>
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Observaciones del corte..."
          rows={3}
          className={cn(inputCls, "resize-none")}
        />
      </div>
      <div className="flex gap-3">
        <button onClick={onCancelar} className={btnSecundario}>Cancelar</button>
        <button
          onClick={() => void onCrear({ nota: nota.trim() || undefined })}
          disabled={procesando}
          className={btnPrimario}
        >
          {procesando ? "Creando..." : "Crear corte"}
        </button>
      </div>
    </div>
  );
}

// ── Modal cerrar corte ────────────────────────────────────────────

function ModalCerrarCorte({ corte, onCerrar, onCancelar }: {
  corte: CorteCaja;
  onCerrar: (efectivoReal: number, nota?: string) => Promise<void>;
  onCancelar: () => void;
}) {
  const [efectivo, setEfectivo] = useState(String(corte.ventasEfectivo));
  const [nota, setNota] = useState(corte.nota ?? "");
  const { procesando } = useReportesStore();

  const efectivoReal = Number(efectivo) || 0;
  const diferencia = efectivoReal - corte.ventasEfectivo;

  return (
    <div className="flex flex-col gap-4">
      {/* Resumen del corte */}
      <div className="bg-surface-2 rounded-xl p-4 text-sm flex flex-col gap-2">
        <div className="flex justify-between">
          <span className="text-text-secondary">Efectivo esperado</span>
          <span className="font-semibold">{formatPeso(corte.ventasEfectivo)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Total ventas</span>
          <span className="font-semibold text-accent">{formatPeso(corte.totalVentas)}</span>
        </div>
      </div>

      {/* Input efectivo real */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-text-secondary">Efectivo real en caja *</label>
        <input
          type="number" min={0} step={100}
          value={efectivo}
          onChange={(e) => setEfectivo(e.target.value)}
          className={cn(inputCls, "text-lg font-bold")}
          autoFocus
        />
      </div>

      {/* Diferencia en tiempo real */}
      <div className={cn(
        "rounded-xl p-3 text-center",
        diferencia >= 0 ? "bg-green-500/10 border border-green-500/20" : "bg-danger/10 border border-danger/20"
      )}>
        <p className="text-xs text-text-secondary mb-1">Diferencia</p>
        <p className={cn("text-2xl font-bold", diferencia >= 0 ? "text-green-400" : "text-danger")}>
          {diferencia >= 0 ? "+" : ""}{formatPeso(diferencia)}
        </p>
        <p className="text-xs text-text-secondary mt-0.5">
          {diferencia >= 0 ? "Sobrante en caja" : "Faltante en caja"}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-text-secondary">Nota (opcional)</label>
        <textarea
          value={nota} onChange={(e) => setNota(e.target.value)}
          rows={2} className={cn(inputCls, "resize-none")}
        />
      </div>

      <div className="flex gap-3">
        <button onClick={onCancelar} className={btnSecundario}>Cancelar</button>
        <button
          onClick={() => void onCerrar(efectivoReal, nota.trim() || undefined)}
          disabled={procesando}
          className={btnPrimario}
        >
          {procesando ? "Cerrando..." : "Confirmar cierre"}
        </button>
      </div>
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
          <button
            onClick={onCerrar}
            className="text-text-secondary hover:text-text-primary"
            aria-label="Cerrar"
          >
            <Icono nombre="cerrar" tamano={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EstadoVacio({ mensaje }: { mensaje: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-text-secondary">
      <Icono nombre="reportes" tamano={40} className="text-text-muted" />
      <p className="text-sm">{mensaje}</p>
    </div>
  );
}

function SkeletonKPIs() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 bg-surface rounded-2xl border border-border animate-pulse" />
        ))}
      </div>
      <div className="h-48 bg-surface rounded-2xl border border-border animate-pulse" />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-16 bg-surface rounded-xl border border-border animate-pulse" />
      ))}
    </div>
  );
}

const inputCls =
  "bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent transition-colors";

const btnPrimario =
  "flex-1 py-2.5 bg-accent text-black rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

const btnSecundario =
  "flex-1 py-2.5 bg-surface-2 border border-border text-text-secondary rounded-xl text-sm hover:border-text-secondary transition-colors";

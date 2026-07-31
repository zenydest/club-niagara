/**
 * Módulo 4 — Cashless
 *
 * Tabs:
 *   1. Tarjetas    — lista, crear, recargar, activar/desactivar
 *   2. Cobro rápido — consultar saldo y cobrar desde esta pantalla
 *   3. QR / MP      — generar QR de Mercado Pago para un monto
 */

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@niagara/ui";
import {
  useCashlessStore,
  type TarjetaCashless,
} from "@/stores/cashlessStore";
import { useAuthStore } from "@/stores/authStore";

// ── Helpers ──────────────────────────────────────────────────────

const ARS = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);

// ── QR simple con SVG (para mostrar el qrData de MP) ─────────────
// Usamos la librería nativa del browser cuando esté disponible.
// Por ahora mostramos el código en texto y un placeholder visual.

function QRPlaceholder({ valor, tamaño = 180 }: { valor: string; tamaño?: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center border-2 border-lime/40 rounded-2xl bg-white"
      style={{ width: tamaño, height: tamaño }}
    >
      {/* Grid simulado de QR */}
      <svg viewBox="0 0 100 100" width={tamaño - 16} height={tamaño - 16}>
        {/* Esquinas */}
        {([
          [5, 5], [65, 5], [5, 65],
        ] as const).map(([x, y], i) => (
          <g key={i}>
            <rect x={x} y={y} width={30} height={30} rx={3} fill="#1a1a2e" />
            <rect x={x + 5} y={y + 5} width={20} height={20} rx={2} fill="white" />
            <rect x={x + 9} y={y + 9} width={12} height={12} rx={1} fill="#1a1a2e" />
          </g>
        ))}
        {/* Puntos aleatorios simulados */}
        {Array.from({ length: 40 }, (_, i) => {
          const px = 5 + (i * 37) % 60;
          const py = 38 + (i * 53) % 45;
          if ((px < 40 && py < 40) || (px > 60 && py < 40) || (px < 40 && py > 60)) return null;
          return <rect key={`p${i}`} x={px} y={py} width={5} height={5} fill="#1a1a2e" />;
        })}
        {/* Logo central */}
        <rect x={40} y={40} width={20} height={20} rx={3} fill="#C2FF00" />
        <text x={50} y={53} textAnchor="middle" fontSize={10} fill="#06060F" fontWeight="bold">N</text>
      </svg>
      {valor.includes("MOCK") && (
        <p className="text-[9px] text-gray-500 mt-1 px-2 text-center">Simulado</p>
      )}
    </div>
  );
}

// ── Tab 1: Lista de tarjetas ──────────────────────────────────────

function TabTarjetas() {
  const {
    tarjetas,
    cargando,
    procesando,
    cargarTarjetas,
    crearTarjeta,
    recargar,
    cambiarEstado,
  } = useCashlessStore();

  const [busqueda, setBusqueda] = useState("");
  const [modalCrear, setModalCrear] = useState(false);
  const [modalRecargar, setModalRecargar] = useState<TarjetaCashless | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);

  // Formulario nueva tarjeta
  const [nuevoCodigo, setNuevoCodigo] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoEmail, setNuevoEmail] = useState("");
  const [saldoInicial, setSaldoInicial] = useState("");

  // Formulario recarga
  const [montoRecarga, setMontoRecarga] = useState("");
  const [metodoRecarga, setMetodoRecarga] = useState<"efectivo" | "tarjeta" | "cortesia">("efectivo");

  const busquedaTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void cargarTarjetas();
  }, [cargarTarjetas]);

  const handleBusqueda = (v: string) => {
    setBusqueda(v);
    if (busquedaTimeout.current) clearTimeout(busquedaTimeout.current);
    busquedaTimeout.current = setTimeout(() => void cargarTarjetas(v || undefined), 400);
  };

  const handleCrear = async () => {
    if (!nuevoCodigo.trim()) return;
    const t = await crearTarjeta({
      codigo: nuevoCodigo.trim().toUpperCase(),
      clienteNombre: nuevoNombre || undefined,
      clienteEmail: nuevoEmail || undefined,
      saldoInicial: saldoInicial ? Number(saldoInicial) : 0,
    });
    if (t) {
      setModalCrear(false);
      setNuevoCodigo(""); setNuevoNombre(""); setNuevoEmail(""); setSaldoInicial("");
    }
  };

  const handleRecargar = async () => {
    if (!modalRecargar || !montoRecarga) return;
    const res = await recargar(modalRecargar.codigo, Number(montoRecarga), metodoRecarga);
    if (res) {
      setModalRecargar(null);
      setMontoRecarga("");
    }
  };

  const saldoColor = (saldo: number) => {
    if (saldo <= 0) return "text-danger";
    if (saldo < 1000) return "text-yellow-400";
    return "text-green-400";
  };

  return (
    <div className="space-y-4">
      {/* Barra de acciones */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">🔍</span>
          <input
            type="text"
            placeholder="Buscar por código, nombre o email…"
            value={busqueda}
            onChange={(e) => handleBusqueda(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary text-sm placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-lime/40"
          />
        </div>
        <button
          onClick={() => setModalCrear(true)}
          className="px-4 py-2.5 rounded-xl bg-lime text-background text-sm font-bold hover:brightness-110 transition-all"
        >
          + Nueva tarjeta
        </button>
      </div>

      {/* Lista */}
      {cargando ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-lime border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tarjetas.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          <p className="text-3xl mb-2">🪙</p>
          <p className="text-sm">No hay tarjetas cashless aún</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tarjetas.map((t) => (
            <div
              key={t.id}
              className={cn(
                "rounded-xl border transition-all",
                t.activa ? "bg-surface border-border" : "bg-surface/50 border-border/50 opacity-60"
              )}
            >
              {/* Fila principal */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                onClick={() => setExpandida(expandida === t.id ? null : t.id)}
              >
                {/* Ícono */}
                <div className="w-10 h-10 rounded-xl bg-lime/10 border border-lime/30 flex items-center justify-center text-lg flex-shrink-0">
                  🪙
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-lime text-sm">{t.codigo}</span>
                    {!t.activa && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-danger/20 text-danger border border-danger/30">
                        INACTIVA
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary truncate">
                    {t.clienteNombre ?? "Sin nombre asignado"}
                    {t.clienteEmail && ` · ${t.clienteEmail}`}
                  </p>
                </div>

                {/* Saldo */}
                <div className="text-right flex-shrink-0">
                  <p className={cn("text-lg font-black", saldoColor(t.saldo))}>
                    {ARS(t.saldo)}
                  </p>
                  <p className="text-[10px] text-text-secondary">saldo</p>
                </div>

                {/* Chevron */}
                <span className={cn("text-text-secondary text-xs transition-transform", expandida === t.id ? "rotate-180" : "")}>▼</span>
              </div>

              {/* Panel expandido */}
              {expandida === t.id && (
                <div className="px-4 pb-3 pt-0 border-t border-border/50 flex gap-2 flex-wrap">
                  <button
                    onClick={() => setModalRecargar(t)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-lime/15 border border-lime/40 text-lime hover:bg-lime/25 transition-colors"
                  >
                    + Recargar
                  </button>
                  <button
                    onClick={() => void cambiarEstado(t.codigo, !t.activa)}
                    disabled={procesando}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                      t.activa
                        ? "bg-danger/10 border-danger/40 text-danger hover:bg-danger/20"
                        : "bg-green-500/10 border-green-500/40 text-green-400 hover:bg-green-500/20"
                    )}
                  >
                    {t.activa ? "Desactivar" : "Activar"}
                  </button>
                  {t.recargas && t.recargas.length > 0 && (
                    <div className="w-full mt-2 space-y-1">
                      <p className="text-[10px] text-text-secondary uppercase tracking-wider">Últimas recargas</p>
                      {t.recargas.slice(0, 3).map((r, i) => (
                        <div key={i} className="flex justify-between text-xs text-text-secondary">
                          <span>{new Date(r.createdAt).toLocaleDateString("es-AR")} · {r.metodoPago}</span>
                          <span className="text-green-400 font-medium">+{ARS(r.monto)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal: crear tarjeta */}
      {modalCrear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setModalCrear(false)} />
          <div className="relative w-full max-w-sm bg-surface border border-border rounded-2xl shadow-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-text-primary">Nueva tarjeta cashless</h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-secondary uppercase tracking-wider">Código *</label>
                <input
                  autoFocus
                  type="text"
                  placeholder="Ej: PULSERA-001"
                  value={nuevoCodigo}
                  onChange={(e) => setNuevoCodigo(e.target.value.toUpperCase())}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary font-mono text-sm focus:outline-none focus:ring-2 focus:ring-lime/40"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary uppercase tracking-wider">Nombre del cliente</label>
                <input
                  type="text"
                  placeholder="Opcional"
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-lime/40"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary uppercase tracking-wider">Saldo inicial</label>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="0"
                  value={saldoInicial}
                  onChange={(e) => setSaldoInicial(e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-lime/40"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setModalCrear(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-text-secondary text-sm hover:border-lime/40 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleCrear()}
                disabled={!nuevoCodigo.trim() || procesando}
                className="flex-1 py-2.5 rounded-xl bg-lime text-background text-sm font-bold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {procesando ? "Creando…" : "Crear tarjeta"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: recargar */}
      {modalRecargar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setModalRecargar(null)} />
          <div className="relative w-full max-w-sm bg-surface border border-border rounded-2xl shadow-2xl p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-text-primary">Recargar saldo</h3>
              <p className="text-sm text-text-secondary">
                <span className="font-mono text-lime">{modalRecargar.codigo}</span>
                {modalRecargar.clienteNombre && ` · ${modalRecargar.clienteNombre}`}
              </p>
              <p className="text-xs text-text-secondary mt-0.5">
                Saldo actual: <span className="text-green-400 font-semibold">{ARS(modalRecargar.saldo)}</span>
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-secondary uppercase tracking-wider">Monto a recargar</label>
                <input
                  autoFocus
                  type="number"
                  inputMode="numeric"
                  placeholder="0"
                  value={montoRecarga}
                  onChange={(e) => setMontoRecarga(e.target.value)}
                  className="mt-1 w-full px-3 py-3 rounded-xl bg-surface-2 border border-border text-text-primary text-xl font-bold focus:outline-none focus:ring-2 focus:ring-lime/40"
                />
                {/* Montos rápidos */}
                <div className="flex gap-2 mt-2 flex-wrap">
                  {[1000, 2000, 5000, 10000].map((m) => (
                    <button
                      key={m}
                      onClick={() => setMontoRecarga(String(m))}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-surface-2 border border-border text-text-secondary hover:border-lime/50 hover:text-lime transition-colors"
                    >
                      {ARS(m)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-text-secondary uppercase tracking-wider">Método de pago</label>
                <div className="flex gap-2 mt-1">
                  {(["efectivo", "tarjeta", "cortesia"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMetodoRecarga(m)}
                      className={cn(
                        "flex-1 py-2 rounded-xl text-xs font-semibold border transition-all capitalize",
                        metodoRecarga === m
                          ? "bg-lime/20 border-lime text-lime"
                          : "bg-surface-2 border-border text-text-secondary hover:border-lime/40"
                      )}
                    >
                      {m === "cortesia" ? "Cortesía" : m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {montoRecarga && (
                <div className="px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20 text-sm">
                  Nuevo saldo:{" "}
                  <span className="font-bold text-green-400">
                    {ARS(modalRecargar.saldo + Number(montoRecarga))}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setModalRecargar(null); setMontoRecarga(""); }}
                className="flex-1 py-2.5 rounded-xl border border-border text-text-secondary text-sm hover:border-lime/40 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleRecargar()}
                disabled={!montoRecarga || Number(montoRecarga) <= 0 || procesando}
                className="flex-1 py-2.5 rounded-xl bg-lime text-background text-sm font-bold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {procesando ? "Recargando…" : `Recargar ${montoRecarga ? ARS(Number(montoRecarga)) : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 2: Cobro rápido ──────────────────────────────────────────

function TabCobro() {
  const { tarjetaConsultada, consultando, errorConsulta, procesando, errorOperacion, consultarTarjeta, cobrar, limpiarConsulta } = useCashlessStore();
  const [codigo, setCodigo] = useState("");
  const [monto, setMonto] = useState("");
  const [resultado, setResultado] = useState<{ ok: boolean; nuevoSaldo: number } | null>(null);

  const handleConsultar = async () => {
    if (!codigo.trim()) return;
    setResultado(null);
    await consultarTarjeta(codigo.trim().toUpperCase());
  };

  const handleCobrar = async () => {
    if (!tarjetaConsultada || !monto) return;
    const res = await cobrar(tarjetaConsultada.codigo, Number(monto));
    if (res?.ok) {
      setResultado(res);
      setMonto("");
    }
  };

  const saldoSuficiente = tarjetaConsultada && monto
    ? tarjetaConsultada.saldo >= Number(monto)
    : true;

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* Buscador de tarjeta */}
      <div>
        <label className="text-xs text-text-secondary uppercase tracking-wider">Código de tarjeta / pulsera</label>
        <div className="flex gap-2 mt-1">
          <input
            type="text"
            placeholder="Ej: PULSERA-001"
            value={codigo}
            onChange={(e) => { setCodigo(e.target.value.toUpperCase()); limpiarConsulta(); setResultado(null); }}
            onKeyDown={(e) => e.key === "Enter" && void handleConsultar()}
            className="flex-1 px-4 py-3 rounded-xl bg-surface-2 border border-border text-text-primary font-mono text-sm focus:outline-none focus:ring-2 focus:ring-lime/40"
          />
          <button
            onClick={() => void handleConsultar()}
            disabled={!codigo.trim() || consultando}
            className="px-4 py-3 rounded-xl bg-lime text-background text-sm font-bold hover:brightness-110 disabled:opacity-50 transition-all"
          >
            {consultando ? "…" : "Consultar"}
          </button>
        </div>
        {errorConsulta && (
          <p className="mt-1.5 text-xs text-danger">{errorConsulta}</p>
        )}
      </div>

      {/* Tarjeta encontrada */}
      {tarjetaConsultada && (
        <div className="rounded-xl border border-lime/30 bg-lime/5 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono font-bold text-lime text-lg">{tarjetaConsultada.codigo}</p>
              {tarjetaConsultada.clienteNombre && (
                <p className="text-sm text-text-secondary">{tarjetaConsultada.clienteNombre}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-green-400">{ARS(tarjetaConsultada.saldo)}</p>
              <p className="text-xs text-text-secondary">saldo disponible</p>
            </div>
          </div>

          {/* Monto a cobrar */}
          <div>
            <label className="text-xs text-text-secondary uppercase tracking-wider">Monto a cobrar</label>
            <input
              autoFocus
              type="number"
              inputMode="numeric"
              placeholder="0"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className={cn(
                "mt-1 w-full px-4 py-3 rounded-xl bg-surface-2 border text-text-primary text-xl font-bold focus:outline-none focus:ring-2",
                !saldoSuficiente
                  ? "border-danger focus:ring-danger/40"
                  : "border-border focus:ring-lime/40"
              )}
            />
            {!saldoSuficiente && monto && (
              <p className="mt-1 text-xs text-danger">
                Saldo insuficiente. Faltan {ARS(Number(monto) - tarjetaConsultada.saldo)}
              </p>
            )}
          </div>

          <button
            onClick={() => void handleCobrar()}
            disabled={!monto || Number(monto) <= 0 || !saldoSuficiente || procesando}
            className="w-full py-4 rounded-xl bg-lime text-background font-bold text-base hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {procesando ? "Procesando…" : `Cobrar ${monto ? ARS(Number(monto)) : ""}`}
          </button>

          {errorOperacion && (
            <p className="text-xs text-danger text-center">{errorOperacion}</p>
          )}
        </div>
      )}

      {/* Resultado del cobro */}
      {resultado?.ok && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-center space-y-1">
          <p className="text-2xl">✅</p>
          <p className="text-sm font-bold text-green-400">Cobro exitoso</p>
          <p className="text-xs text-text-secondary">
            Nuevo saldo: <span className="font-semibold text-green-400">{ARS(resultado.nuevoSaldo)}</span>
          </p>
          <button
            onClick={() => { setResultado(null); setCodigo(""); limpiarConsulta(); }}
            className="mt-2 text-xs text-text-secondary hover:text-lime transition-colors"
          >
            Nueva consulta
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tab 3: QR Mercado Pago ───────────────────────────────────────

function TabQRMP() {
  const { preferenciaMP, cargandoQR, crearPreferenciaMP, limpiarPreferenciaMP } = useCashlessStore();
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("Consumición Club Niágara");

  const handleGenerar = async () => {
    if (!monto || Number(monto) <= 0) return;
    await crearPreferenciaMP(Number(monto), descripcion || undefined);
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* Info sobre modo simulado */}
      <div className="px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-400 flex items-start gap-2">
        <span>⚠️</span>
        <div>
          <p className="font-semibold">Modo simulado</p>
          <p className="text-text-secondary mt-0.5">
            Configurá <code className="bg-surface px-1 rounded">MP_ACCESS_TOKEN</code> en las variables de Render para activar pagos reales.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-text-secondary uppercase tracking-wider">Monto</label>
          <input
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={monto}
            onChange={(e) => { setMonto(e.target.value); limpiarPreferenciaMP(); }}
            className="mt-1 w-full px-4 py-3 rounded-xl bg-surface-2 border border-border text-text-primary text-xl font-bold focus:outline-none focus:ring-2 focus:ring-lime/40"
          />
        </div>
        <div>
          <label className="text-xs text-text-secondary uppercase tracking-wider">Descripción</label>
          <input
            type="text"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="mt-1 w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-lime/40"
          />
        </div>

        <button
          onClick={() => void handleGenerar()}
          disabled={!monto || Number(monto) <= 0 || cargandoQR}
          className="w-full py-3 rounded-xl bg-lime text-background font-bold text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {cargandoQR ? "Generando QR…" : "Generar QR de pago"}
        </button>
      </div>

      {/* QR generado */}
      {preferenciaMP && (
        <div className="rounded-xl border border-lime/30 bg-surface p-6 text-center space-y-4">
          <p className="text-sm font-bold text-text-primary">
            QR para pago de {ARS(Number(monto))}
          </p>

          <div className="flex justify-center">
            <QRPlaceholder valor={preferenciaMP.qrData ?? preferenciaMP.preferenciaId} tamaño={200} />
          </div>

          {preferenciaMP.simulado && (
            <p className="text-xs text-yellow-400">
              Este QR es simulado. Con MP configurado aparecerá el QR real.
            </p>
          )}

          <div className="text-xs text-text-secondary font-mono bg-surface-2 rounded-lg px-3 py-2 break-all">
            ID: {preferenciaMP.preferenciaId}
          </div>

          <button
            onClick={limpiarPreferenciaMP}
            className="text-xs text-text-secondary hover:text-lime transition-colors"
          >
            Generar otro
          </button>
        </div>
      )}
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────

type Tab = "tarjetas" | "cobro" | "qrmp";

const TABS: { id: Tab; label: string; icono: string; roles: string[] }[] = [
  { id: "tarjetas", label: "Tarjetas", icono: "🪙", roles: ["admin", "encargado", "cajero"] },
  { id: "cobro", label: "Cobro rápido", icono: "⚡", roles: ["admin", "encargado", "cajero", "barman"] },
  { id: "qrmp", label: "QR / MP", icono: "📱", roles: ["admin", "encargado", "cajero", "barman"] },
];

export function CashlessPage() {
  const { staff } = useAuthStore();
  const [tabActual, setTabActual] = useState<Tab>("tarjetas");

  const rolesPermitidos = ["admin", "encargado", "cajero", "barman"];
  if (staff && !rolesPermitidos.includes(staff.rol)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <span className="text-4xl">🔒</span>
        <p className="text-text-secondary">No tenés acceso al módulo cashless</p>
      </div>
    );
  }

  const tabsVisibles = TABS.filter((t) => !staff || t.roles.includes(staff.rol));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary">Cashless</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Tarjetas/pulseras con saldo · Recargas · QR Mercado Pago
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface-2 rounded-xl border border-border w-fit">
        {tabsVisibles.map((t) => (
          <button
            key={t.id}
            onClick={() => setTabActual(t.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              tabActual === t.id
                ? "bg-lime text-background"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            <span>{t.icono}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido del tab */}
      {tabActual === "tarjetas" && <TabTarjetas />}
      {tabActual === "cobro" && <TabCobro />}
      {tabActual === "qrmp" && <TabQRMP />}
    </div>
  );
}

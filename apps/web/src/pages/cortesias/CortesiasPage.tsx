/**
 * Cortesías — generar tandas de accesos gratuitos y repartirlas.
 *
 * El flujo real: el encargado genera 200 códigos con hora límite, copia los
 * links y se los manda al RRPP. El RRPP los reparte por WhatsApp. Quien recibe
 * uno abre el link y muestra el QR en la puerta.
 */

import React, { useEffect, useMemo, useState } from "react";
import { cn } from "@niagara/ui";
import {
  useCortesiasStore,
  linkCortesia,
  type LoteCortesias,
} from "@/stores/cortesiasStore";
import { useEventosStore } from "@/stores/eventosStore";
import { usePersonalStore } from "@/stores/personalStore";
import { useAuthStore } from "@/stores/authStore";
import { Icono } from "@/components/Icono";
import { exportarCSV } from "@/lib/exportar";

const horaCorta = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });

export function CortesiasPage() {
  const { lotes, cargando, error, cargarLotes, limpiarError } = useCortesiasStore();
  const { eventos, cargarEventos } = useEventosStore();
  const { staff } = useAuthStore();

  const puedeGestionar = staff?.rol === "admin" || staff?.rol === "encargado";

  const [modalCrear, setModalCrear] = useState(false);
  const [loteAbierto, setLoteAbierto] = useState<LoteCortesias | null>(null);

  useEffect(() => {
    void cargarLotes();
    void cargarEventos();
  }, [cargarLotes, cargarEventos]);

  const activas = lotes.reduce((acc, l) => acc + (l.anulado ? 0 : l.total - l.usadas), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Cortesías</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {activas} pase{activas !== 1 ? "s" : ""} sin usar
          </p>
        </div>

        {puedeGestionar && (
          <button
            onClick={() => setModalCrear(true)}
            className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:brightness-110 transition-all inline-flex items-center gap-1.5"
          >
            <Icono nombre="agregar" tamano={16} />
            Generar tanda
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl px-4 py-3 flex items-start justify-between gap-4 border border-danger/30 bg-danger/10 text-sm text-danger">
          <p>{error}</p>
          <button onClick={limpiarError} aria-label="Cerrar">
            <Icono nombre="cerrar" tamano={16} />
          </button>
        </div>
      )}

      {cargando ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-20 bg-surface rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : lotes.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center">
          <Icono nombre="cortesia" tamano={40} className="mx-auto mb-3 text-text-muted" />
          <p className="text-text-primary font-semibold">Todavía no generaste cortesías</p>
          <p className="text-sm text-text-secondary mt-2 max-w-md mx-auto">
            Generá una tanda, copiá los links y pasáselos al RRPP. Quien reciba
            uno lo abre y muestra el QR en la puerta.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {lotes.map((l) => (
            <FilaLote
              key={l.id}
              lote={l}
              onAbrir={() => setLoteAbierto(l)}
              puedeGestionar={puedeGestionar}
            />
          ))}
        </div>
      )}

      {modalCrear && (
        <ModalGenerar
          eventos={eventos.filter((e) => e.estado !== "cerrado" && e.estado !== "cancelado")}
          onCerrar={() => setModalCrear(false)}
        />
      )}

      {loteAbierto && (
        <ModalCodigos lote={loteAbierto} onCerrar={() => setLoteAbierto(null)} />
      )}
    </div>
  );
}

// ── Fila de una tanda ────────────────────────────────────────────

function FilaLote({
  lote,
  onAbrir,
  puedeGestionar,
}: {
  lote: LoteCortesias;
  onAbrir: () => void;
  puedeGestionar: boolean;
}) {
  const { anularLote, procesando } = useCortesiasStore();
  const [confirmar, setConfirmar] = useState(false);

  const restantes = lote.total - lote.usadas;
  const pctUsado = lote.total > 0 ? Math.round((lote.usadas / lote.total) * 100) : 0;
  const vencido = new Date(lote.validaHasta) <= new Date();

  return (
    <div
      className={cn(
        "bg-surface border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4",
        lote.anulado ? "border-border opacity-50" : "border-border"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-text-primary">{lote.nombre}</span>
          {lote.anulado && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-danger/15 text-danger border border-danger/30">
              Anulada
            </span>
          )}
          {!lote.anulado && vencido && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-text-secondary border border-border">
              Venció
            </span>
          )}
        </div>

        <p className="text-xs text-text-secondary mt-0.5">
          {lote.evento}
          {lote.rrpp && ` · ${lote.rrpp}`}
        </p>

        <p className="text-xs text-warning mt-1">
          Entrada hasta {horaCorta(lote.validaHasta)}
        </p>

        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 w-32 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full"
              style={{ width: `${pctUsado}%` }}
            />
          </div>
          <span className="text-xs text-text-secondary">
            {lote.usadas} de {lote.total} usadas
          </span>
        </div>
      </div>

      <div className="flex gap-2 flex-shrink-0">
        <button
          onClick={onAbrir}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-text-secondary hover:text-accent hover:border-accent/40 transition-colors"
        >
          Ver links
        </button>

        {puedeGestionar && !lote.anulado && restantes > 0 && (
          <button
            onClick={() => setConfirmar(true)}
            className="px-3 py-1.5 rounded-lg text-xs border border-transparent text-text-secondary hover:text-danger hover:border-danger/40 transition-colors"
          >
            Anular
          </button>
        )}
      </div>

      {confirmar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setConfirmar(false)} />
          <div className="relative w-full max-w-sm bg-surface border border-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Icono nombre="alerta" tamano={24} className="text-danger flex-shrink-0" />
              <h2 className="text-base font-bold text-text-primary">Anular {lote.nombre}</h2>
            </div>
            <p className="text-sm text-text-secondary">
              Los {restantes} pases sin usar dejan de servir. Los {lote.usadas} ya
              usados no se tocan: esa gente ya entró.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmar(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-text-secondary text-sm hover:border-text-secondary transition-colors"
              >
                Volver
              </button>
              <button
                onClick={async () => {
                  const ok = await anularLote(lote.id);
                  if (ok) setConfirmar(false);
                }}
                disabled={procesando}
                className="flex-1 py-2.5 rounded-xl bg-danger text-white text-sm font-bold hover:brightness-110 disabled:opacity-50 transition-all"
              >
                {procesando ? "Anulando…" : "Anular"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Generar tanda ────────────────────────────────────────────────

function ModalGenerar({
  eventos,
  onCerrar,
}: {
  eventos: { id: string; nombre: string; fechaInicio: string }[];
  onCerrar: () => void;
}) {
  const { crearLote, procesando } = useCortesiasStore();
  const { staff: listaStaff } = usePersonalStore();

  const [eventoId, setEventoId] = useState(eventos[0]?.id ?? "");
  const [nombre, setNombre] = useState("");
  const [cantidad, setCantidad] = useState("200");
  const [rrppId, setRrppId] = useState("");
  const [validaHasta, setValidaHasta] = useState("");

  const eventoElegido = eventos.find((e) => e.id === eventoId);

  /**
   * Sugerencia de hora límite: la 1:30 del día siguiente al evento.
   *
   * Es el caso típico del boliche —el evento arranca a la noche y las
   * cortesías valen hasta la madrugada—, así que se precarga para no tener que
   * pensar la fecha cada vez. Igual se puede cambiar.
   */
  const sugerida = useMemo(() => {
    if (!eventoElegido) return "";
    const d = new Date(eventoElegido.fechaInicio);
    d.setDate(d.getDate() + 1);
    d.setHours(1, 30, 0, 0);
    // `toISOString` da UTC; el input necesita hora local.
    const off = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - off).toISOString().slice(0, 16);
  }, [eventoElegido]);

  useEffect(() => {
    if (sugerida && !validaHasta) setValidaHasta(sugerida);
  }, [sugerida, validaHasta]);

  const rrpps = listaStaff.filter((s) => s.rol === "rrpp" && s.activo);

  const cantidadNum = Number(cantidad);
  const valido =
    eventoId &&
    nombre.trim().length >= 2 &&
    Number.isFinite(cantidadNum) &&
    cantidadNum >= 1 &&
    cantidadNum <= 1000 &&
    validaHasta;

  const guardar = async () => {
    if (!valido) return;
    const ok = await crearLote({
      eventoId,
      nombre: nombre.trim(),
      cantidad: cantidadNum,
      validaHasta: new Date(validaHasta).toISOString(),
      ...(rrppId && { rrppId }),
    });
    if (ok) onCerrar();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCerrar} />

      <div className="relative w-full max-w-md bg-surface border border-border rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">Generar cortesías</h2>
          <button onClick={onCerrar} className="text-text-secondary hover:text-text-primary" aria-label="Cerrar">
            <Icono nombre="cerrar" tamano={18} />
          </button>
        </div>

        {eventos.length === 0 ? (
          <p className="text-sm text-warning">
            No hay eventos abiertos. Creá uno antes de generar cortesías.
          </p>
        ) : (
          <>
            <Campo etiqueta="Evento *">
              <select value={eventoId} onChange={(e) => setEventoId(e.target.value)} className={inputCls}>
                {eventos.map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
            </Campo>

            <Campo etiqueta="Nombre de la tanda *">
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="RRPP Juan · Sorteo Instagram"
                className={inputCls}
                autoFocus
              />
            </Campo>

            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Cantidad *">
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className={inputCls}
                />
              </Campo>

              <Campo etiqueta="RRPP">
                <select value={rrppId} onChange={(e) => setRrppId(e.target.value)} className={inputCls}>
                  <option value="">Sin asignar</option>
                  {rrpps.map((r) => (
                    <option key={r.id} value={r.id}>{r.nombre} {r.apellido}</option>
                  ))}
                </select>
              </Campo>
            </div>

            <Campo etiqueta="Entrada hasta *">
              <input
                type="datetime-local"
                value={validaHasta}
                onChange={(e) => setValidaHasta(e.target.value)}
                className={inputCls}
              />
            </Campo>

            <p className="text-xs text-text-secondary">
              Pasada esa hora el código no sirve más y quien llegue tiene que
              pagar la entrada.
            </p>

            <div className="flex gap-3 pt-1">
              <button onClick={onCerrar} className="flex-1 py-2.5 rounded-xl border border-border text-text-secondary text-sm hover:border-text-secondary transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => void guardar()}
                disabled={!valido || procesando}
                className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {procesando ? "Generando…" : "Generar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Links de una tanda ───────────────────────────────────────────

function ModalCodigos({ lote, onCerrar }: { lote: LoteCortesias; onCerrar: () => void }) {
  const { codigos, cargandoCodigos, cargarCodigos } = useCortesiasStore();
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    void cargarCodigos(lote.id);
  }, [lote.id, cargarCodigos]);

  const sinUsar = codigos.filter((c) => !c.usada);

  /** Todos los links en un texto, listo para pegar en WhatsApp. */
  const copiarTodos = async () => {
    const texto = sinUsar.map((c) => linkCortesia(c.codigo)).join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles queda la opción de bajar la planilla.
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCerrar} />

      <div className="relative w-full max-w-lg bg-surface border border-border rounded-2xl p-6 space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-text-primary">{lote.nombre}</h2>
            <p className="text-xs text-text-secondary mt-0.5">
              {sinUsar.length} sin usar de {codigos.length}
            </p>
          </div>
          <button onClick={onCerrar} className="text-text-secondary hover:text-text-primary" aria-label="Cerrar">
            <Icono nombre="cerrar" tamano={18} />
          </button>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => void copiarTodos()}
            disabled={sinUsar.length === 0}
            className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:brightness-110 disabled:opacity-40 transition-all"
          >
            {copiado ? "¡Copiado!" : `Copiar ${sinUsar.length} links`}
          </button>

          <button
            onClick={() =>
              exportarCSV({
                nombre: `cortesias-${lote.nombre.replace(/\s+/g, "-").toLowerCase()}`,
                columnas: [
                  { titulo: "Código", valor: (c) => c.codigo },
                  { titulo: "Link", valor: (c) => linkCortesia(c.codigo) },
                  { titulo: "Estado", valor: (c) => (c.usada ? "Usada" : "Sin usar") },
                ],
                filas: codigos,
              })
            }
            disabled={codigos.length === 0}
            className="px-4 py-2.5 rounded-xl border border-border text-text-secondary text-sm hover:text-accent hover:border-accent/40 disabled:opacity-40 transition-colors"
          >
            Planilla
          </button>
        </div>

        <p className="text-xs text-text-secondary flex-shrink-0">
          Pegá los links en WhatsApp y mandale uno a cada persona. Cada link
          sirve una sola vez.
        </p>

        <div className="flex-1 overflow-y-auto flex flex-col gap-1">
          {cargandoCodigos ? (
            <p className="text-sm text-text-secondary py-4 text-center">Cargando…</p>
          ) : (
            codigos.map((c) => (
              <div
                key={c.codigo}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-xs",
                  c.usada ? "bg-surface-2 opacity-50" : "bg-surface-2"
                )}
              >
                <span className="font-mono text-text-primary">{c.codigo}</span>
                <span className="flex-1 text-text-muted truncate">
                  {linkCortesia(c.codigo)}
                </span>
                {c.usada && (
                  <span className="text-[10px] text-text-secondary flex-shrink-0">
                    Usada
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-text-secondary uppercase tracking-wider">
        {etiqueta}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border text-text-primary text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors";

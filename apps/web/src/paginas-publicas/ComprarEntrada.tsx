/**
 * Compra de entradas por link, sin cuenta.
 *
 * La abre gente que recibió el link de un RRPP o del boliche. Es la primera
 * impresión del lugar para mucha gente, así que la portada va grande y el
 * formulario pide lo mínimo: nombre, email y teléfono opcional.
 *
 * Después del pago, Mercado Pago devuelve a `/pago-ok?ref=...`, donde se
 * muestran los links de cada entrada.
 */

import React, { useEffect, useState } from "react";
import { Icono } from "@/components/Icono";

const API = import.meta.env["VITE_API_URL"] ?? "";

interface TipoEntrada {
  id: string;
  nombre: string;
  tipo: string;
  precio: number;
  disponibles: number | null;
}

interface EventoPublico {
  id: string;
  nombre: string;
  descripcion: string | null;
  fechaInicio: string;
  imagenUrl: string | null;
  entradasTipo: TipoEntrada[];
}

const ARS = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);

export function ComprarEntrada({ eventoId, rrpp }: { eventoId: string; rrpp?: string }) {
  const [evento, setEvento] = useState<EventoPublico | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tipoId, setTipoId] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vigente = true;

    fetch(`${API}/api/publico/eventos/${eventoId}`)
      .then(async (res) => {
        const cuerpo = await res.json();
        if (!res.ok) throw new Error(cuerpo.error ?? "El evento no está disponible");
        return cuerpo as { evento: EventoPublico };
      })
      .then((d) => {
        if (!vigente) return;
        setEvento(d.evento);
        // Se preselecciona la más barata, que es la que más se vende.
        setTipoId(d.evento.entradasTipo[0]?.id ?? null);
      })
      .catch((err: Error) => vigente && setError(err.message));

    return () => { vigente = false; };
  }, [eventoId]);

  const tipo = evento?.entradasTipo.find((t) => t.id === tipoId) ?? null;
  const agotada = tipo?.disponibles !== null && (tipo?.disponibles ?? 0) <= 0;
  const total = tipo ? tipo.precio * cantidad : 0;

  const valido =
    tipo && !agotada && nombre.trim().length >= 2 && /\S+@\S+\.\S+/.test(email);

  const comprar = async () => {
    if (!valido || !tipo) return;
    setEnviando(true);
    setError(null);

    try {
      const res = await fetch(`${API}/api/publico/comprar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entradaTipoId: tipo.id,
          cantidad,
          nombre: nombre.trim(),
          email: email.trim(),
          ...(telefono.trim() && { telefono: telefono.trim() }),
          ...(rrpp && { rrpp }),
        }),
      });

      const cuerpo = await res.json();
      if (!res.ok) throw new Error(cuerpo.error ?? "No se pudo completar la compra");

      // Se va a Mercado Pago. Vuelve a /pago-ok cuando termina.
      window.location.href = cuerpo.linkPago;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la compra");
      setEnviando(false);
    }
  };

  if (error && !evento) {
    return (
      <Marco>
        <Icono nombre="alerta" tamano={48} className="text-danger" />
        <p className="text-lg font-bold text-text-primary mt-4 text-center">{error}</p>
      </Marco>
    );
  }

  if (!evento) {
    return (
      <Marco>
        <Icono nombre="cargando" tamano={36} girando className="text-accent" />
      </Marco>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {evento.imagenUrl && (
        <div className="w-full h-48 sm:h-64 overflow-hidden">
          <img src={evento.imagenUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="max-w-md mx-auto px-5 py-6">
        <p className="text-xs uppercase tracking-[0.2em] text-accent font-bold">
          Club Niágara
        </p>
        <h1 className="text-2xl font-black text-text-primary mt-1">{evento.nombre}</h1>
        <p className="text-sm text-text-secondary mt-1 capitalize">
          {new Date(evento.fechaInicio).toLocaleDateString("es-AR", {
            weekday: "long", day: "numeric", month: "long",
          })}
        </p>

        {evento.descripcion && (
          <p className="text-sm text-text-secondary mt-3">{evento.descripcion}</p>
        )}

        {/* Tipos de entrada */}
        <div className="mt-6 flex flex-col gap-2">
          {evento.entradasTipo.map((t) => {
            const sinCupo = t.disponibles !== null && t.disponibles <= 0;
            const elegida = t.id === tipoId;

            return (
              <button
                key={t.id}
                onClick={() => !sinCupo && setTipoId(t.id)}
                disabled={sinCupo}
                className={`flex items-center justify-between p-4 rounded-2xl border text-left transition-all ${
                  elegida
                    ? "border-accent bg-accent/10"
                    : "border-border bg-surface hover:border-accent/40"
                } ${sinCupo ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <div>
                  <p className="text-sm font-bold text-text-primary">{t.nombre}</p>
                  {sinCupo ? (
                    <p className="text-xs text-danger mt-0.5">Agotada</p>
                  ) : (
                    t.disponibles !== null && t.disponibles <= 20 && (
                      <p className="text-xs text-warning mt-0.5">
                        Quedan {t.disponibles}
                      </p>
                    )
                  )}
                </div>
                <p className="text-base font-black text-accent">{ARS(t.precio)}</p>
              </button>
            );
          })}
        </div>

        {tipo && !agotada && (
          <>
            {/* Cantidad */}
            <div className="flex items-center justify-between mt-6">
              <span className="text-sm text-text-secondary">Cantidad</span>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                  className="w-10 h-10 rounded-full bg-surface border border-border text-text-primary text-xl font-bold"
                >
                  −
                </button>
                <span className="w-6 text-center text-lg font-black text-text-primary">
                  {cantidad}
                </span>
                <button
                  onClick={() => setCantidad((c) => Math.min(10, c + 1))}
                  className="w-10 h-10 rounded-full bg-surface border border-border text-text-primary text-xl font-bold"
                >
                  +
                </button>
              </div>
            </div>

            {/* Datos. Lo mínimo: el email es para poder recuperar la entrada si
                pierde el link, y el nombre para que el portero lo vea. */}
            <div className="mt-6 flex flex-col gap-3">
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Tu nombre y apellido"
                className={inputCls}
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Tu email"
                className={inputCls}
              />
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Teléfono (opcional)"
                className={inputCls}
              />
            </div>

            <div className="flex justify-between items-center mt-6 pt-4 border-t border-border">
              <span className="text-text-secondary">Total</span>
              <span className="text-2xl font-black text-text-primary">{ARS(total)}</span>
            </div>

            {error && <p className="text-sm text-danger mt-3">{error}</p>}

            <button
              onClick={() => void comprar()}
              disabled={!valido || enviando}
              className="w-full mt-4 py-4 rounded-2xl bg-accent text-white font-black disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {enviando ? "Abriendo el pago…" : "Pagar con Mercado Pago"}
            </button>

            <p className="text-[11px] text-text-muted text-center mt-3">
              Después de pagar vas a recibir tu código QR. Guardá el link.
            </p>
          </>
        )}

        <div className="h-10" />
      </div>
    </div>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      {children}
    </div>
  );
}

const inputCls =
  "w-full px-4 py-3 rounded-xl bg-surface border border-border text-text-primary text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors";

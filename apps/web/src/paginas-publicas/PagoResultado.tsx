/**
 * Pantalla a la que vuelve el comprador desde Mercado Pago.
 *
 * El pago se confirma por webhook, no acá: la persona puede llegar a esta
 * pantalla antes de que Mercado Pago haya avisado. Por eso se consulta el
 * estado unas cuantas veces antes de dar el pago por no acreditado.
 */

import React, { useEffect, useState } from "react";
import { Icono } from "@/components/Icono";

const API = import.meta.env.VITE_API_URL ?? "";

/** Cada cuánto se vuelve a preguntar, y cuántas veces. */
const ESPERA_MS = 2000;
const INTENTOS = 10;

interface Compra {
  pagadas: number;
  total: number;
  evento: { nombre: string; fechaInicio: string } | null;
  nombre: string | null;
  codigos: string[];
}

export function PagoResultado({ referencia }: { referencia: string }) {
  const [compra, setCompra] = useState<Compra | null>(null);
  const [esperando, setEsperando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    let intentos = 0;

    const consultar = async () => {
      try {
        const res = await fetch(`${API}/api/publico/compra/${referencia}`);
        if (!res.ok) throw new Error("No encontramos esa compra");

        const d = (await res.json()) as Compra;
        if (!vigente) return;

        setCompra(d);

        // Ya acreditó: no hace falta seguir preguntando.
        if (d.pagadas > 0) {
          setEsperando(false);
          return;
        }

        intentos += 1;
        if (intentos >= INTENTOS) {
          setEsperando(false);
          return;
        }

        setTimeout(() => void consultar(), ESPERA_MS);
      } catch (err) {
        if (!vigente) return;
        setError(err instanceof Error ? err.message : "Algo salió mal");
        setEsperando(false);
      }
    };

    void consultar();
    return () => { vigente = false; };
  }, [referencia]);

  if (error) {
    return (
      <Marco>
        <Icono nombre="alerta" tamano={48} className="text-danger" />
        <p className="text-lg font-bold text-text-primary mt-4 text-center">{error}</p>
      </Marco>
    );
  }

  if (esperando) {
    return (
      <Marco>
        <Icono nombre="cargando" tamano={40} girando className="text-accent" />
        <p className="text-sm text-text-secondary mt-4 text-center">
          Confirmando el pago…
        </p>
        <p className="text-xs text-text-muted mt-2 text-center">
          No cierres esta pantalla.
        </p>
      </Marco>
    );
  }

  const acreditado = (compra?.pagadas ?? 0) > 0;

  return (
    <Marco>
      {acreditado ? (
        <>
          <Icono nombre="ok" tamano={56} className="text-success" />
          <h1 className="text-xl font-black text-text-primary mt-4 text-center">
            ¡Listo{compra?.nombre ? `, ${compra.nombre.split(" ")[0]}` : ""}!
          </h1>
          <p className="text-sm text-text-secondary mt-1 text-center">
            {compra?.evento?.nombre}
          </p>

          <div className="w-full mt-8 flex flex-col gap-3">
            {compra?.codigos.map((codigo, i) => (
              <a
                key={codigo}
                href={`/entrada/${codigo}`}
                className="flex items-center justify-between px-4 py-4 rounded-2xl bg-surface border border-accent/40 hover:border-accent transition-colors"
              >
                <div>
                  <p className="text-sm font-bold text-text-primary">
                    Entrada {i + 1} de {compra.codigos.length}
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Tocá para ver tu QR
                  </p>
                </div>
                <Icono nombre="avanzar" tamano={20} className="text-accent" />
              </a>
            ))}
          </div>

          <div className="mt-6 px-4 py-3 rounded-xl border border-warning/40 bg-warning/10">
            <p className="text-xs text-warning text-center">
              Guardá esta página en favoritos o sacale una captura a los links.
              Los vas a necesitar en la puerta.
            </p>
          </div>
        </>
      ) : (
        <>
          <Icono nombre="reloj" tamano={48} className="text-warning" />
          <h1 className="text-lg font-bold text-text-primary mt-4 text-center">
            El pago todavía no se acreditó
          </h1>
          <p className="text-sm text-text-secondary mt-2 text-center">
            A veces Mercado Pago tarda unos minutos. Volvé a esta misma
            dirección más tarde y vas a ver tus entradas.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-6 py-3 rounded-xl bg-accent text-white text-sm font-bold"
          >
            Volver a consultar
          </button>
        </>
      )}
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm flex flex-col items-center">{children}</div>
    </div>
  );
}

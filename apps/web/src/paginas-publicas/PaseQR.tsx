/**
 * Pantalla del pase, para quien recibió el link por WhatsApp.
 *
 * Es la única parte del sistema que abre gente de la calle: sin sesión, sin
 * app, sin datos. Solo el QR grande y lo necesario para saber si sirve.
 *
 * Cubre los dos casos con la misma pantalla:
 *   /free/CODIGO   — cortesía, con hora límite de ingreso
 *   /entrada/UUID  — entrada vendida, con código rotativo
 *
 * Está pensada para leerse de noche, en la calle, con el brillo al mango y
 * alguien esperando atrás: el QR ocupa casi toda la pantalla y el estado se
 * entiende de un vistazo.
 */

import React, { useEffect, useState } from "react";
import { CodigoQR } from "@/components/CodigoQR";
import { Icono } from "@/components/Icono";

const API = import.meta.env["VITE_API_URL"] ?? "";

type Tipo = "free" | "entrada";

interface DatosPase {
  qr: string;
  titulo: string;
  subtitulo: string;
  evento: { nombre: string; fechaInicio: string; imagenUrl?: string | null };
  /** Motivo por el que no sirve, si no sirve. */
  problema: string | null;
  validaHasta?: string | null;
}

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

export function PaseQR({ tipo, codigo }: { tipo: Tipo; codigo: string }) {
  const [datos, setDatos] = useState<DatosPase | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;

    const cargar = async () => {
      try {
        const url =
          tipo === "free"
            ? `${API}/api/cortesias/publica/${codigo}`
            : `${API}/api/entradas/publica/${codigo}`;

        const res = await fetch(url);
        if (!res.ok) {
          const cuerpo = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(cuerpo.error ?? "No se pudo cargar el pase");
        }

        const d = (await res.json()) as Record<string, never>;
        if (!vigente) return;

        setDatos(tipo === "free" ? normalizarFree(d) : normalizarEntrada(d));
      } catch (err) {
        if (vigente) {
          setError(err instanceof Error ? err.message : "No se pudo cargar el pase");
        }
      }
    };

    void cargar();
    return () => { vigente = false; };
  }, [tipo, codigo]);

  if (error) {
    return (
      <Marco>
        <Icono nombre="alerta" tamano={48} className="text-danger" />
        <p className="text-lg font-bold text-text-primary mt-4">{error}</p>
        <p className="text-sm text-text-secondary mt-2">
          Si te lo pasaron por error, pedile el link de nuevo a quien te lo mandó.
        </p>
      </Marco>
    );
  }

  if (!datos) {
    return (
      <Marco>
        <Icono nombre="cargando" tamano={36} girando className="text-accent" />
      </Marco>
    );
  }

  return (
    <Marco>
      <p className="text-xs uppercase tracking-[0.2em] text-accent font-bold">
        Club Niágara
      </p>

      <h1 className="text-2xl font-black text-text-primary mt-2 text-center">
        {datos.evento.nombre}
      </h1>
      <p className="text-sm text-text-secondary mt-1 capitalize">
        {fechaLarga(datos.evento.fechaInicio)}
      </p>

      {datos.problema ? (
        <div className="mt-8 w-full rounded-2xl border border-danger/40 bg-danger/10 p-6 text-center">
          <Icono nombre="alerta" tamano={40} className="mx-auto text-danger" />
          <p className="text-lg font-bold text-danger mt-3">{datos.problema}</p>
        </div>
      ) : (
        <>
          <div className="mt-8">
            <CodigoQR valor={datos.qr} tamano={260} descripcion="Código de acceso" />
          </div>

          <p className="text-sm font-semibold text-text-primary mt-5">
            {datos.titulo}
          </p>
          <p className="text-xs text-text-secondary mt-1 text-center">
            {datos.subtitulo}
          </p>

          {datos.validaHasta && (
            <div className="mt-5 px-4 py-2 rounded-xl border border-warning/40 bg-warning/10">
              <p className="text-sm font-bold text-warning text-center">
                Entrada hasta las {hora(datos.validaHasta)}
              </p>
            </div>
          )}
        </>
      )}

      <p className="text-[11px] text-text-muted mt-8 text-center">
        Subí el brillo de la pantalla para que el código se lea mejor.
      </p>
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-10">
      {children}
    </div>
  );
}

// ── Normalización de cada tipo ───────────────────────────────────

function normalizarFree(d: Record<string, never>): DatosPase {
  const usada = d["usada"] as unknown as boolean;
  const anulada = d["anulada"] as unknown as boolean;
  const vencida = d["vencida"] as unknown as boolean;

  return {
    qr: d["qr"] as unknown as string,
    titulo: "Pase de cortesía",
    subtitulo: "Mostrá este código en la puerta",
    evento: d["evento"] as unknown as DatosPase["evento"],
    validaHasta: d["validaHasta"] as unknown as string,
    problema: usada
      ? "Este pase ya se usó"
      : anulada
        ? "Este pase fue dado de baja"
        : vencida
          ? "Se pasó el horario. Ya no sirve para entrar gratis."
          : null,
  };
}

function normalizarEntrada(d: Record<string, never>): DatosPase {
  const usada = d["usada"] as unknown as boolean;
  const cancelada = d["cancelada"] as unknown as boolean;
  const pagada = d["pagada"] as unknown as boolean;
  const nombre = d["nombre"] as unknown as string | null;

  return {
    /**
     * El QR de una entrada lleva el payload que espera la puerta, no el código
     * suelto. Va sin el código rotativo: quien abre el link no puede
     * calcularlo sin el secreto, y meterlo en la página lo dejaría a la vista
     * de cualquiera que reciba el enlace.
     */
    qr: JSON.stringify({
      tipo: "entrada",
      id: d["qrCode"] as unknown as string,
      localId: d["localId"] as unknown as string,
    }),
    titulo: nombre ? `Entrada de ${nombre}` : "Tu entrada",
    subtitulo: pagada
      ? "Mostrá este código en la puerta"
      : "Pagás en la puerta al ingresar",
    evento: d["evento"] as unknown as DatosPase["evento"],
    problema: usada
      ? "Esta entrada ya se usó"
      : cancelada
        ? "Esta entrada fue cancelada"
        : null,
  };
}

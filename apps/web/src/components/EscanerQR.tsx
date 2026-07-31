/**
 * Escáner de QR para la puerta.
 *
 * Usa `BarcodeDetector`, que viene en Chrome/Edge Android y de escritorio. No
 * se agrega una librería de decodificación como fallback a propósito: en la
 * puerta se usa un dispositivo conocido, y si el navegador no lo soporta se
 * avisa y se cae al ingreso manual, que ya existe.
 *
 * Requiere HTTPS (o localhost) para acceder a la cámara.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@niagara/ui";

/** Mínimo entre lecturas del mismo código, para no disparar validaciones repetidas */
const MS_ANTIRREBOTE = 2500;

interface DetectorCodigos {
  detect: (fuente: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}

interface ConstructorDetector {
  new (opciones?: { formats?: string[] }): DetectorCodigos;
  getSupportedFormats?: () => Promise<string[]>;
}

function obtenerDetector(): ConstructorDetector | null {
  const g = globalThis as { BarcodeDetector?: ConstructorDetector };
  return g.BarcodeDetector ?? null;
}

interface EscanerQRProps {
  onLeer: (codigo: string) => void;
  /** Pausa la lectura mientras se muestra el resultado del escaneo anterior */
  pausado?: boolean;
}

export function EscanerQR({ onLeer, pausado = false }: EscanerQRProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ultimaLecturaRef = useRef<{ codigo: string; ts: number } | null>(null);
  const pausadoRef = useRef(pausado);

  const [error, setError] = useState<string | null>(null);
  const [activo, setActivo] = useState(false);

  // Se guarda en ref para que el loop de detección lea el valor actual sin
  // tener que reiniciarse en cada cambio.
  useEffect(() => {
    pausadoRef.current = pausado;
  }, [pausado]);

  const manejarCodigo = useCallback(
    (codigo: string) => {
      const previa = ultimaLecturaRef.current;
      const ahora = Date.now();

      if (previa?.codigo === codigo && ahora - previa.ts < MS_ANTIRREBOTE) {
        return;
      }

      ultimaLecturaRef.current = { codigo, ts: ahora };
      onLeer(codigo);
    },
    [onLeer]
  );

  useEffect(() => {
    const Detector = obtenerDetector();
    if (!Detector) {
      setError(
        "Este navegador no puede leer QR con la cámara. Usá Chrome en Android, o cargá el código a mano."
      );
      return;
    }

    let cancelado = false;
    let frame: number | null = null;
    const detector = new Detector({ formats: ["qr_code"] });

    const iniciar = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // La cámara trasera es la que se usa apuntando a la entrada.
          video: { facingMode: "environment" },
        });

        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setActivo(true);

        const detectar = async () => {
          if (cancelado) return;

          const video = videoRef.current;
          if (video && video.readyState === video.HAVE_ENOUGH_DATA && !pausadoRef.current) {
            try {
              const codigos = await detector.detect(video);
              const primero = codigos[0];
              if (primero?.rawValue) manejarCodigo(primero.rawValue);
            } catch {
              // Un frame que no se puede analizar no es un error: se sigue.
            }
          }

          frame = requestAnimationFrame(() => void detectar());
        };

        frame = requestAnimationFrame(() => void detectar());
      } catch (err) {
        if (cancelado) return;
        setError(
          err instanceof Error && err.name === "NotAllowedError"
            ? "Hay que permitir el acceso a la cámara para escanear"
            : "No se pudo abrir la cámara"
        );
      }
    };

    void iniciar();

    return () => {
      cancelado = true;
      if (frame !== null) cancelAnimationFrame(frame);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [manejarCodigo]);

  if (error) {
    return (
      <div className="bg-warning/10 border border-warning/30 rounded-xl px-4 py-3 text-sm text-warning">
        {error}
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3]">
      <video
        ref={videoRef}
        playsInline
        muted
        className="w-full h-full object-cover"
      />

      {/* Mira de encuadre */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className={cn(
            "w-48 h-48 border-2 rounded-2xl transition-colors",
            pausado ? "border-warning" : "border-lime"
          )}
        />
      </div>

      {!activo && (
        <div className="absolute inset-0 flex items-center justify-center text-text-secondary text-sm">
          Abriendo cámara…
        </div>
      )}

      {pausado && (
        <div className="absolute bottom-3 left-0 right-0 text-center">
          <span className="px-3 py-1 rounded-full bg-black/70 text-xs text-warning font-semibold">
            Pausado
          </span>
        </div>
      )}
    </div>
  );
}

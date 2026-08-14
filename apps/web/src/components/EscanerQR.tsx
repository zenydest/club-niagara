/**
 * Escáner de QR para la puerta.
 *
 * Dos caminos de decodificación:
 *
 *   1. `BarcodeDetector`, nativo del navegador. Lo tienen Chrome y Edge, y es
 *      bastante más rápido porque lo resuelve el sistema.
 *   2. `jsQR`, en JavaScript. Es el que corre en Safari —iPhone y iPad—, que
 *      no implementa `BarcodeDetector`.
 *
 * Antes solo estaba el primero, así que en iPhone el escáner no arrancaba y
 * quedaba únicamente la carga manual. En la puerta de un boliche eso es la
 * diferencia entre una fila que avanza y una que no.
 *
 * Requiere HTTPS (o localhost) para acceder a la cámara.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { cn } from "@niagara/ui";

/** Mínimo entre lecturas del mismo código, para no disparar validaciones repetidas */
const MS_ANTIRREBOTE = 2500;

/**
 * Cada cuánto se analiza un frame con jsQR.
 *
 * Con `BarcodeDetector` se puede mirar cada frame porque lo resuelve el
 * sistema. jsQR corre en el hilo principal, así que analizar 60 veces por
 * segundo traba la interfaz: 8 por segundo alcanza de sobra para alguien que
 * acerca un celular.
 */
const MS_ENTRE_ANALISIS = 120;

/**
 * Ancho al que se reduce el frame antes de analizarlo.
 *
 * jsQR recorre pixel por pixel: sobre un frame de 1080p tarda cientos de
 * milisegundos. A 480 px un QR de pantalla se lee igual y el análisis baja a
 * unas pocas decenas.
 */
const ANCHO_ANALISIS = 480;

interface DetectorCodigos {
  detect: (fuente: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}

interface ConstructorDetector {
  new (opciones?: { formats?: string[] }): DetectorCodigos;
}

function obtenerDetectorNativo(): ConstructorDetector | null {
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ultimaLecturaRef = useRef<{ codigo: string; ts: number } | null>(null);
  const pausadoRef = useRef(pausado);

  const [error, setError] = useState<string | null>(null);
  const [activo, setActivo] = useState(false);
  const [necesitaGesto, setNecesitaGesto] = useState(false);

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

  /** Analiza el frame actual con jsQR, reduciéndolo primero. */
  const leerConJsQR = useCallback((video: HTMLVideoElement): string | null => {
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;

    const escala = ANCHO_ANALISIS / video.videoWidth;
    const ancho = Math.round(video.videoWidth * escala);
    const alto = Math.round(video.videoHeight * escala);

    if (ancho === 0 || alto === 0) return null;

    canvas.width = ancho;
    canvas.height = alto;

    // `willReadFrequently` evita que el navegador mantenga el canvas en la GPU:
    // acá se lee el contenido en cada análisis, y sin esto cada lectura obliga
    // a traerlo de vuelta a memoria.
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, ancho, alto);
    const imagen = ctx.getImageData(0, 0, ancho, alto);

    const resultado = jsQR(imagen.data, imagen.width, imagen.height, {
      // El QR se muestra en una pantalla: no hay que invertir colores.
      inversionAttempts: "dontInvert",
    });

    return resultado?.data ?? null;
  }, []);

  useEffect(() => {
    let cancelado = false;
    let frame: number | null = null;
    let temporizador: ReturnType<typeof setTimeout> | null = null;

    const DetectorNativo = obtenerDetectorNativo();
    const detector = DetectorNativo ? new DetectorNativo({ formats: ["qr_code"] }) : null;

    const iniciar = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // La cámara trasera es la que se usa apuntando a la entrada.
          video: {
            facingMode: "environment",
            // Pedir una resolución moderada: en iPhone la cámara arranca en
            // muy alta y solo agrega trabajo de escalado.
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            // Safari puede rechazar el play automático. Se ofrece un botón:
            // con un toque del usuario sí lo permite.
            if (!cancelado) setNecesitaGesto(true);
            return;
          }
        }

        setActivo(true);

        const analizar = async () => {
          if (cancelado) return;

          const v = videoRef.current;
          if (v && v.readyState === v.HAVE_ENOUGH_DATA && !pausadoRef.current) {
            try {
              if (detector) {
                const codigos = await detector.detect(v);
                const primero = codigos[0];
                if (primero?.rawValue) manejarCodigo(primero.rawValue);
              } else {
                const codigo = leerConJsQR(v);
                if (codigo) manejarCodigo(codigo);
              }
            } catch {
              // Un frame que no se puede analizar no es un error: se sigue.
            }
          }

          if (detector) {
            frame = requestAnimationFrame(() => void analizar());
          } else {
            // Con jsQR se espacia el análisis para no trabar la interfaz.
            temporizador = setTimeout(() => void analizar(), MS_ENTRE_ANALISIS);
          }
        };

        void analizar();
      } catch (err) {
        if (cancelado) return;

        const nombre = err instanceof Error ? err.name : "";

        setError(
          nombre === "NotAllowedError"
            ? "Hay que permitir el acceso a la cámara. En iPhone: Ajustes → Safari → Cámara → Preguntar o Permitir."
            : nombre === "NotFoundError"
              ? "No se encontró ninguna cámara en este dispositivo"
              : "No se pudo abrir la cámara. Probá recargar la página."
        );
      }
    };

    void iniciar();

    return () => {
      cancelado = true;
      if (frame !== null) cancelAnimationFrame(frame);
      if (temporizador !== null) clearTimeout(temporizador);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [manejarCodigo, leerConJsQR]);

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
        autoPlay
        className="w-full h-full object-cover"
      />

      {/* Mira de encuadre */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className={cn(
            "w-48 h-48 border-2 rounded-2xl transition-colors",
            pausado ? "border-warning" : "border-accent"
          )}
        />
      </div>

      {necesitaGesto && (
        <button
          onClick={() => {
            void videoRef.current?.play();
            setNecesitaGesto(false);
            setActivo(true);
          }}
          className="absolute inset-0 flex items-center justify-center bg-black/80 text-white font-bold"
        >
          Tocá para activar la cámara
        </button>
      )}

      {!activo && !necesitaGesto && (
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

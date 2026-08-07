/**
 * Campo de imagen con dos formas de cargarla: subir un archivo de la
 * computadora o pegar la URL de una que ya esté publicada.
 *
 * El archivo se achica en el navegador antes de subirlo (ver `redimensionar`)
 * y va directo a Cloudinary: la API solo firma el pedido, los bytes no pasan
 * por el servidor.
 *
 * Si Cloudinary no está configurado, la pestaña de subir se desactiva sola y
 * queda la de URL, que siempre funciona. La idea es que el panel nunca ofrezca
 * un botón que no va a andar.
 */

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@niagara/ui";
import { api } from "@/lib/apiClient";
import { useAuthStore } from "@/stores/authStore";
import { Icono } from "@/components/Icono";

const ANCHO_MAX = 1200;
const ALTO_MAX = 675;
const CALIDAD_JPEG = 0.85;

/** Tope de lo que aceptamos del disco, antes de comprimir. */
const PESO_MAX_MB = 15;

interface FirmaUpload {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  firma: string;
}

/**
 * Recorta y comprime la imagen a 1200×675 usando un canvas.
 *
 * Recorta al centro en vez de deformar: las portadas se ven en la app dentro de
 * un rectángulo fijo, así que estirar una foto vertical para que entre queda
 * peor que cortarle los bordes.
 *
 * Sale siempre en JPEG. El PNG de una foto pesa varias veces más y acá no hace
 * falta transparencia.
 */
async function redimensionar(archivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo);

  const escala = Math.max(ANCHO_MAX / bitmap.width, ALTO_MAX / bitmap.height);
  // Si la imagen ya es más chica que el destino no la agrandamos: ampliar no
  // agrega detalle, solo peso y bordes borrosos.
  const factor = Math.min(escala, 1);

  const anchoEscalado = Math.round(bitmap.width * factor);
  const altoEscalado = Math.round(bitmap.height * factor);

  const ancho = Math.min(ANCHO_MAX, anchoEscalado);
  const alto = Math.min(ALTO_MAX, altoEscalado);

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no pudo procesar la imagen");

  ctx.drawImage(
    bitmap,
    // Origen: el recorte centrado sobre la imagen original.
    (bitmap.width - ancho / factor) / 2,
    (bitmap.height - alto / factor) / 2,
    ancho / factor,
    alto / factor,
    0, 0, ancho, alto
  );

  bitmap.close();

  return new Promise((resolver, rechazar) => {
    canvas.toBlob(
      (blob) => blob ? resolver(blob) : rechazar(new Error("No se pudo comprimir la imagen")),
      "image/jpeg",
      CALIDAD_JPEG
    );
  });
}

async function subirACloudinary(blob: Blob, firma: FirmaUpload): Promise<string> {
  const form = new FormData();
  form.append("file", blob);
  form.append("api_key", firma.apiKey);
  form.append("timestamp", String(firma.timestamp));
  form.append("folder", firma.folder);
  form.append("signature", firma.firma);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${firma.cloudName}/image/upload`,
    { method: "POST", body: form }
  );

  const data = (await res.json()) as { secure_url?: string; error?: { message?: string } };

  if (!res.ok || !data.secure_url) {
    throw new Error(data.error?.message ?? "Cloudinary rechazó la imagen");
  }

  return data.secure_url;
}

/**
 * Detecta links que la gente pega creyendo que son la imagen, pero que en
 * realidad son la página del visor. Drive, Dropbox y OneDrive devuelven HTML
 * con su propio reproductor: puestos en un `<img>` no cargan nada.
 *
 * Vale la pena avisar por separado porque el error genérico ("no se pudo
 * cargar") manda a revisar la dirección, y la dirección está bien — lo que
 * está mal es qué tipo de link es.
 */
function esLinkDeVisor(url: string): boolean {
  return /drive\.google\.com|docs\.google\.com|dropbox\.com\/s\/|1drv\.ms|onedrive\.live\.com/i
    .test(url);
}

type Modo = "archivo" | "url";

interface CampoImagenProps {
  valor: string;
  onCambio: (url: string) => void;
  carpeta?: "eventos" | "productos";
  ayuda?: string;
}

export function CampoImagen({
  valor,
  onCambio,
  carpeta = "eventos",
  ayuda,
}: CampoImagenProps) {
  const [modo, setModo] = useState<Modo>("archivo");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [puedeSubir, setPuedeSubir] = useState<boolean | null>(null);

  const inputArchivo = useRef<HTMLInputElement>(null);
  const localId = useAuthStore((s) => s.staff?.localId);

  // Se pregunta una sola vez si hay credenciales cargadas. Mientras no se sabe
  // (`null`) no se muestra ningún cartel, para no parpadear un error que no es.
  useEffect(() => {
    let vigente = true;

    api.get<{ configurado: boolean; detalle?: string; advertencia?: string }>(
      "/uploads/estado", localId
    )
      .then((r) => {
        if (!vigente) return;
        setPuedeSubir(r.configurado);
        if (!r.configurado) {
          setModo("url");
          // El detalle dice *por qué* no se puede subir. Sin esto, la pestaña
          // aparecía deshabilitada sin explicación y había que ir a los logs.
          if (r.detalle) setError(r.detalle);
        } else if (r.advertencia) {
          // Se deja intentar igual: la advertencia es una pista para cuando
          // falle, no un motivo para no dejar probar.
          setError(r.advertencia);
        }
      })
      .catch(() => {
        if (!vigente) return;
        setPuedeSubir(false);
        setModo("url");
      });

    return () => { vigente = false; };
  }, [localId]);

  const handleArchivo = async (archivo: File) => {
    setError(null);

    if (!archivo.type.startsWith("image/")) {
      setError("Ese archivo no es una imagen");
      return;
    }
    if (archivo.size > PESO_MAX_MB * 1024 * 1024) {
      setError(`La imagen no puede pesar más de ${PESO_MAX_MB} MB`);
      return;
    }

    setSubiendo(true);
    try {
      const blob = await redimensionar(archivo);
      const firma = await api.get<FirmaUpload>(`/uploads/firma?carpeta=${carpeta}`, localId);
      const url = await subirACloudinary(blob, firma);
      onCambio(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la imagen");
    } finally {
      setSubiendo(false);
      // Se limpia el input para que elegir el mismo archivo otra vez vuelva a
      // disparar el evento (si no, el navegador lo considera "sin cambios").
      if (inputArchivo.current) inputArchivo.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Selector de modo */}
      <div className="flex gap-1 p-1 bg-surface-2 rounded-xl border border-border w-fit">
        {([
          { id: "archivo" as Modo, label: "Subir archivo" },
          { id: "url" as Modo, label: "Pegar URL" },
        ]).map((m) => {
          const deshabilitado = m.id === "archivo" && puedeSubir === false;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => !deshabilitado && setModo(m.id)}
              disabled={deshabilitado}
              title={deshabilitado ? "Falta configurar Cloudinary en el servidor" : undefined}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                modo === m.id
                  ? "bg-accent text-white"
                  : "text-text-secondary hover:text-text-primary",
                deshabilitado && "opacity-40 cursor-not-allowed"
              )}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {modo === "archivo" ? (
        <div>
          <input
            ref={inputArchivo}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const archivo = e.target.files?.[0];
              if (archivo) void handleArchivo(archivo);
            }}
          />
          <button
            type="button"
            onClick={() => inputArchivo.current?.click()}
            disabled={subiendo}
            className={cn(
              "w-full py-6 rounded-xl border border-dashed border-border",
              "flex flex-col items-center justify-center gap-2",
              "text-sm text-text-secondary",
              "hover:border-accent hover:text-text-primary transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {subiendo ? (
              <>
                <Icono nombre="cargando" tamano={22} girando />
                Subiendo…
              </>
            ) : (
              <>
                <Icono nombre="agregar" tamano={22} />
                Elegir imagen de la computadora
              </>
            )}
          </button>
        </div>
      ) : (
        <input
          type="url"
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          placeholder="https://..."
          className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
        />
      )}

      {error && <p className="text-xs text-danger">{error}</p>}

      {ayuda && !error && <p className="text-xs text-text-secondary">{ayuda}</p>}

      {/* Vista previa. `onError` cubre el caso de una URL pegada que no carga:
          sin esto el usuario cree que quedó bien hasta que abre la app. */}
      {valor && (
        <div className="relative">
          <img
            src={valor}
            alt="Vista previa de la portada"
            className="w-full max-h-40 object-cover rounded-xl border border-border"
            onError={() =>
              setError(
                esLinkDeVisor(valor)
                  ? "Ese es el link para ver el archivo en Drive, no la imagen en sí. " +
                    "Lo más simple es usar la pestaña “Subir archivo”."
                  : "No se pudo cargar esa imagen. Revisá la dirección."
              )
            }
            onLoad={() => setError(null)}
          />
          <button
            type="button"
            onClick={() => { onCambio(""); setError(null); }}
            className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-background/80 border border-border text-text-secondary hover:text-danger flex items-center justify-center transition-colors"
            aria-label="Quitar imagen"
          >
            <Icono nombre="cerrar" tamano={14} />
          </button>
        </div>
      )}
    </div>
  );
}

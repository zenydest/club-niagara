/**
 * Código QR generado en el navegador.
 *
 * Antes esto se resolvía pidiéndole la imagen a `api.qrserver.com`. Andaba,
 * pero mandaba el contenido del código a un servidor ajeno: aceptable para un
 * número de entrada, no para una cadena de cobro de Mercado Pago. Además, sin
 * internet hacia ese servicio el QR no aparecía, justo en la pantalla donde
 * hace falta.
 *
 * Se dibuja siempre sobre fondo blanco con margen: los lectores necesitan
 * contraste y zona de silencio, y el panel es negro.
 */

import React from "react";
import { QRCodeSVG as QRCodeSVGLib } from "qrcode.react";

/**
 * Mismo tema que en `Icono.tsx`: pnpm sube `@types/react` 19 —el de la app
 * móvil— a la raíz del monorepo, y TypeScript lo encuentra desde
 * `qrcode.react`. Como el panel está en React 18, el componente de la librería
 * "no es un JSX válido" acá. Las props que usamos son las mismas en las dos
 * versiones, así que se describe la forma en vez de arrastrar el tipo ajeno.
 */
type ComponenteQR = React.ComponentType<{
  value: string;
  size?: number;
  level?: "L" | "M" | "Q" | "H";
  bgColor?: string;
  fgColor?: string;
}>;

const QRCodeSVG = QRCodeSVGLib as unknown as ComponenteQR;

interface CodigoQRProps {
  valor: string;
  /** Lado del cuadrado en px. Para escanear de lejos, 220 o más. */
  tamano?: number;
  /** Texto alternativo para lectores de pantalla. */
  descripcion?: string;
}

export function CodigoQR({ valor, tamano = 180, descripcion }: CodigoQRProps) {
  return (
    <div
      className="inline-flex items-center justify-center bg-white rounded-xl p-3"
      role="img"
      aria-label={descripcion ?? "Código QR"}
    >
      <QRCodeSVG
        value={valor}
        size={tamano}
        // `M` corrige hasta un 15% del código dañado. Alcanza para una pantalla
        // y mantiene el dibujo menos denso que niveles más altos, así que se
        // lee mejor de lejos y con poca luz.
        level="M"
        bgColor="#FFFFFF"
        fgColor="#000000"
      />
    </div>
  );
}

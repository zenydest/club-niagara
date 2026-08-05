/**
 * Set de íconos de Club Niágara — versión POS.
 *
 * Espejo de `apps/web/src/components/Icono.tsx`: mismos nombres, mismo dibujo,
 * para que la tablet de la barra y el panel de la oficina se vean como el mismo
 * producto. Acá el set es más chico porque el POS tiene menos pantallas.
 *
 * Los tamaños son más generosos que en el panel: esto se toca con el dedo, de
 * noche y a veces con la mano ocupada.
 */

import React from "react";
import {
  AlertTriangle,
  Banknote,
  Beer,
  Check,
  Clock,
  Coins,
  CreditCard,
  Gift,
  Loader2,
  ShoppingBasket,
  Smartphone,
  X,
} from "lucide-react";

/**
 * El monorepo tiene React 18 en el POS y en el panel, y React 19 en la app.
 * pnpm sube `@types/react` 19 a la raíz, y TypeScript lo encuentra desde
 * `lucide-react` — entonces cree que sus íconos son componentes de React 19 y
 * no los acepta acá. Las props que usamos son las mismas en las dos versiones,
 * así que describimos la forma nosotros en vez de arrastrar el tipo de lucide.
 */
type ComponenteIcono = React.ComponentType<{
  size?: number;
  className?: string;
  strokeWidth?: number;
  "aria-hidden"?: boolean;
}>;

/**
 * Fija el tipo del mapa sin perder los nombres: `K` sale de las claves que se
 * escriban abajo, así que `NombreIcono` se sigue derivando solo.
 */
function registrar<K extends string>(iconos: Record<K, unknown>): Record<K, ComponenteIcono> {
  return iconos as Record<K, ComponenteIcono>;
}

export const ICONOS = registrar({
  efectivo: Banknote,
  tarjeta: CreditCard,
  fichas: Coins,
  qrMp: Smartphone,
  cortesia: Gift,
  terminales: Smartphone,
  producto: Beer,
  carrito: ShoppingBasket,
  ok: Check,
  cerrar: X,
  alerta: AlertTriangle,
  reloj: Clock,
  cargando: Loader2,
});

export type NombreIcono = keyof typeof ICONOS;

interface IconoProps {
  nombre: NombreIcono;
  /** Tamaño en px. 20 para textos, 28 para botones, 48+ para estados. */
  tamano?: number;
  className?: string;
  girando?: boolean;
}

export function Icono({ nombre, tamano = 20, className, girando }: IconoProps) {
  const Componente = ICONOS[nombre];

  return (
    <Componente
      size={tamano}
      className={[className, girando ? "animate-spin" : ""]
        .filter(Boolean)
        .join(" ")}
      strokeWidth={1.75}
      aria-hidden
    />
  );
}

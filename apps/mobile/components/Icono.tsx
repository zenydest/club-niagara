/**
 * Set de íconos de Club Niágara — versión app.
 *
 * Espejo de `apps/web/src/components/Icono.tsx`: los mismos nombres en español
 * apuntan al mismo dibujo, así la app y el panel se ven como el mismo producto.
 *
 * Se apoya en `react-native-svg`, que ya estaba en el proyecto por el QR, así
 * que no hace falta recompilar el binario: se puede publicar por EAS Update.
 */

import React from "react";
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Disc3,
  type LucideIcon,
  MapPin,
  QrCode,
  Settings,
  Ticket,
  User,
  Users,
  X,
} from "lucide-react-native";

export const ICONOS = {
  eventos: Disc3,
  tarjeta: CreditCard,
  entrada: Ticket,
  perfil: User,
  qr: QrCode,
  fecha: Calendar,
  lugar: MapPin,
  aforo: Users,
  ok: Check,
  cerrar: X,
  alerta: AlertTriangle,
  avanzar: ChevronRight,
  volver: ChevronLeft,
  ajustes: Settings,
} as const;

export type NombreIcono = keyof typeof ICONOS;

interface IconoProps {
  nombre: NombreIcono;
  /** Tamaño en px. 20 para tabs, 16 para textos, 40+ para estados vacíos. */
  tamano?: number;
  color?: string;
  /** Opacidad, para el tab inactivo. */
  opacidad?: number;
}

export function Icono({
  nombre,
  tamano = 20,
  color = "#EDEDF5",
  opacidad = 1,
}: IconoProps) {
  const Componente: LucideIcon = ICONOS[nombre];

  return (
    <Componente
      size={tamano}
      color={color}
      // Igual que en el panel: trazo un poco más fino, que sobre fondo negro
      // el default de lucide se ve pesado.
      strokeWidth={1.75}
      opacity={opacidad}
    />
  );
}

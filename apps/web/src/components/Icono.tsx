/**
 * Set de íconos de Club Niágara.
 *
 * Todo el panel usa estos nombres en vez de emojis. Los emojis se ven distinto
 * en cada sistema operativo —y en algunos ni siquiera existen— así que no
 * sirven para una interfaz que tiene que verse igual en la tablet de la barra,
 * en el celular del portero y en la PC de la oficina.
 *
 * La identidad no la da el dibujo del ícono sino el trazo consistente y la
 * paleta del logo: azul eléctrico, púrpura y magenta sobre negro.
 *
 * Para agregar uno nuevo: importarlo de lucide-react y sumarlo al mapa. No
 * usar `<SomeIcon />` suelto en las pantallas, así el set queda centralizado y
 * se puede cambiar de librería sin tocar 20 archivos.
 */

import React from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  Beer,
  Boxes,
  Calendar,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  Cookie,
  CupSoda,
  CreditCard,
  DoorOpen,
  Gift,
  GlassWater,
  Grape,
  Loader2,
  Lock,
  LogOut,
  Martini,
  Package,
  PackageMinus,
  PackagePlus,
  PartyPopper,
  Pencil,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Sofa,
  Star,
  Ticket,
  Trash2,
  TrendingUp,
  Unlock,
  Users,
  Wallet,
  Wine,
  X,
  Zap,
} from "lucide-react";

/**
 * El monorepo tiene React 18 en el panel y en el POS, y React 19 en la app.
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

/** Nombres disponibles. Usar estos y no los de lucide directamente. */
export const ICONOS = registrar({
  // Navegación
  dashboard: Zap,
  porteria: DoorOpen,
  caja: Banknote,
  cashless: CreditCard,
  eventos: PartyPopper,
  reservas: Sofa,
  reportes: TrendingUp,
  stock: Package,
  guardarropa: Shirt,
  terminales: Smartphone,
  personal: Users,

  // Acciones y estados
  ingreso: ArrowDownToLine,
  egreso: ArrowUpFromLine,
  aforo: Users,
  entrada: Ticket,
  qr: QrCode,
  buscar: Search,
  editar: Pencil,
  eliminar: Trash2,
  cerrar: X,
  ok: Check,
  alerta: AlertTriangle,
  cargando: Loader2,
  avanzar: ChevronRight,
  volver: ChevronLeft,
  reloj: Clock,
  actividad: Activity,
  calendario: Calendar,
  fecha: CalendarDays,
  agregar: Plus,
  refrescar: RefreshCw,
  imprimir: Printer,
  abrir: Unlock,
  cerrarCaja: Lock,
  salir: LogOut,
  principal: Star,

  // Métodos de pago
  efectivo: Banknote,
  tarjeta: CreditCard,
  billetera: Wallet,
  qrMp: Smartphone,
  cortesia: Gift,
  fichas: Coins,

  // Stock y productos
  producto: Beer,
  deposito: Boxes,
  ingresoStock: PackagePlus,
  egresoStock: PackageMinus,

  // Categorías de la carta
  cerveza: Beer,
  trago: Martini,
  destilado: GlassWater,
  espumante: Grape,
  sinAlcohol: CupSoda,
  vino: Wine,
  snack: Cookie,
  carrito: ShoppingBasket,
});

export type NombreIcono = keyof typeof ICONOS;

interface IconoProps {
  nombre: NombreIcono;
  /** Tamaño en px. 16 para textos, 20 para navegación, 24+ para destacados. */
  tamano?: number;
  className?: string;
  /** Anima el ícono girando. Solo tiene sentido con `cargando`. */
  girando?: boolean;
}

export function Icono({ nombre, tamano = 18, className, girando }: IconoProps) {
  const Componente = ICONOS[nombre];

  return (
    <Componente
      size={tamano}
      className={[className, girando ? "animate-spin" : ""]
        .filter(Boolean)
        .join(" ")}
      // Grosor levemente menor que el default: en fondo oscuro, el trazo
      // estándar de lucide se ve más pesado de lo necesario.
      strokeWidth={1.75}
      aria-hidden
    />
  );
}

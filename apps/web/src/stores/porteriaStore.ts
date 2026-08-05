/**
 * Store de Portería — Módulo 2
 *
 * Maneja:
 * - Selección de evento activo
 * - Aforo en tiempo real (socket + polling)
 * - Cola offline en localStorage → auto-sync al recuperar conexión
 */

import { create } from "zustand";
import { api } from "@/lib/apiClient";
import { socket } from "@/lib/socketClient";
import { useAuthStore } from "@/stores/authStore";

// ── Tipos ────────────────────────────────────────────────────────

export interface EventoActivo {
  id: string;
  nombre: string;
  fechaInicio: string;
  capacidad: number;
  aforoActual: number;
  estado: string;
}

export interface AforoData {
  eventoId: string;
  aforoActual: number;
  capacidad: number;
  ingresos: number;
  egresos: number;
  disponibles: number;
  lleno: boolean;
}

export interface AccesoOffline {
  id: string;
  eventoId: string;
  tipo: "ingreso" | "egreso";
  metodo: "manual";
  createdAt: string;
}

/** Entrada tal como la devuelve POST /api/entradas/validar */
export interface EntradaValidada {
  id: string;
  qrCode: string;
  clienteNombre: string | null;
  usada: boolean;
  entradaTipo?: { nombre: string; tipo: string };
  evento?: { id: string; nombre: string; estado: string };
}

/**
 * Resultado de escanear un QR.
 * `no_encontrada` y `ya_usada` son los dos casos que importan en la puerta:
 * el primero es un código inventado, el segundo un intento de reingreso.
 */
export interface ResultadoValidacion {
  resultado:
    | "ok"
    | "ya_usada"
    | "no_encontrada"
    | "otro_evento"
    | "codigo_vencido"
    | "codigo_faltante"
    /** Reserva de la app todavía sin pagar: hay que cobrarla en la puerta */
    | "impaga"
    | "sin_conexion"
    | "error";
  entrada: EntradaValidada | null;
  mensaje?: string;
  /**
   * La entrada se emitió antes del código rotativo y se validó solo por su QR
   * fijo. Sirve para que el portero sepa que ese código no está protegido
   * contra capturas de pantalla.
   */
  sinCodigoRotativo?: boolean;
  /** Cuánto hay que cobrar cuando el resultado es "impaga" */
  aCobrar?: number;
}

interface PorteriaState {
  // Datos
  eventosActivos: EventoActivo[];
  eventoSeleccionado: EventoActivo | null;
  aforo: AforoData | null;
  colaOffline: AccesoOffline[];

  // Estado UI
  cargando: boolean;
  online: boolean;
  sincronizando: boolean;
  error: string | null;

  // Acciones
  cargarEventos: () => Promise<void>;
  seleccionarEvento: (evento: EventoActivo) => Promise<void>;
  registrarAcceso: (tipo: "ingreso" | "egreso") => Promise<void>;
  validarQR: (
    qrCode: string,
    opciones?: { cobrarEnPuerta?: boolean; metodoPagoPuerta?: string }
  ) => Promise<ResultadoValidacion>;
  sincronizarCola: () => Promise<void>;
  setOnline: (online: boolean) => void;
}

// ── Clave en localStorage para la cola offline ───────────────────
const COLA_KEY = "niagara:porteria:cola";

function leerColaLocal(): AccesoOffline[] {
  try {
    return JSON.parse(localStorage.getItem(COLA_KEY) ?? "[]") as AccesoOffline[];
  } catch {
    return [];
  }
}

function guardarColaLocal(cola: AccesoOffline[]) {
  localStorage.setItem(COLA_KEY, JSON.stringify(cola));
}

function generarUUID(): string {
  return crypto.randomUUID();
}

// ── Store ────────────────────────────────────────────────────────

export const usePorteriaStore = create<PorteriaState>((set, get) => ({
  eventosActivos: [],
  eventoSeleccionado: null,
  aforo: null,
  colaOffline: leerColaLocal(),
  cargando: false,
  online: navigator.onLine,
  sincronizando: false,
  error: null,

  setOnline: (online) => {
    set({ online });
    // Al recuperar conexión, sincronizar cola pendiente
    if (online && get().colaOffline.length > 0) {
      void get().sincronizarCola();
    }
  },

  cargarEventos: async () => {
    const { staff } = useAuthStore.getState();
    if (!staff) return;

    set({ cargando: true, error: null });
    try {
      const data = await api.get<{ eventos: EventoActivo[] }>(
        "/accesos/eventos-activos",
        staff.localId
      );
      set({ eventosActivos: data.eventos });

      // Si hay un solo evento, seleccionarlo automáticamente
      const [unicoEvento] = data.eventos;
      if (unicoEvento && data.eventos.length === 1 && !get().eventoSeleccionado) {
        await get().seleccionarEvento(unicoEvento);
      }
    } catch (err) {
      set({ error: (err as Error).message });
    } finally {
      set({ cargando: false });
    }
  },

  seleccionarEvento: async (evento) => {
    const { staff } = useAuthStore.getState();
    if (!staff) return;

    set({ eventoSeleccionado: evento, aforo: null });

    // Cargar aforo actual
    try {
      const data = await api.get<AforoData>(
        `/accesos/aforo?eventoId=${evento.id}`,
        staff.localId
      );
      set({ aforo: data });
    } catch {
      // Offline: usar aforoActual del evento como base
      set({
        aforo: {
          eventoId: evento.id,
          aforoActual: evento.aforoActual,
          capacidad: evento.capacidad,
          ingresos: evento.aforoActual,
          egresos: 0,
          disponibles: evento.capacidad - evento.aforoActual,
          lleno: evento.aforoActual >= evento.capacidad,
        },
      });
    }

    // Unirse a la sala socket del local para actualizaciones en tiempo real.
    // No se manda el rol: el servidor lo resuelve consultando el staff del
    // usuario autenticado, que es lo correcto — un rol enviado por el cliente
    // no sería confiable para decidir a qué rooms suscribirlo.
    socket.emit("join:local", { localId: staff.localId });
  },

  /**
   * Valida un QR contra la API. El quemado es atómico del lado del servidor,
   * así que dos porteros escaneando el mismo código no pueden pasar los dos.
   *
   * A diferencia del ingreso manual, esto **no funciona offline**: no se puede
   * saber si una entrada ya se usó sin consultar. Cuando no hay conexión, el
   * portero tiene que usar el ingreso manual, que sí tiene cola offline.
   */
  validarQR: async (qrCode, opciones) => {
    const { staff } = useAuthStore.getState();
    const { eventoSeleccionado, online } = get();

    if (!staff) {
      return { resultado: "error", entrada: null, mensaje: "Sin sesión" };
    }

    if (!online) {
      return {
        resultado: "sin_conexion",
        entrada: null,
        mensaje: "Sin conexión: usá el ingreso manual",
      };
    }

    try {
      // El QR de la app trae JSON con el id y el código rotativo. Los QR
      // viejos —o un código tipeado a mano— llegan como texto plano.
      let id = qrCode;
      let codigo: string | undefined;

      try {
        const payload = JSON.parse(qrCode) as { id?: string; codigo?: string };
        if (payload.id) id = payload.id;
        if (payload.codigo) codigo = payload.codigo;
      } catch {
        // No era JSON: se usa el texto tal cual como identificador.
      }

      const res = await api.post<{
        resultado: ResultadoValidacion["resultado"];
        entrada: EntradaValidada | null;
        sinCodigoRotativo?: boolean;
        aCobrar?: number;
      }>(
        "/entradas/validar",
        {
          qrCode: id,
          ...(codigo !== undefined && { codigo }),
          ...(eventoSeleccionado && { eventoId: eventoSeleccionado.id }),
          ...(opciones?.cobrarEnPuerta && {
            cobrarEnPuerta: true,
            metodoPagoPuerta: opciones.metodoPagoPuerta ?? "efectivo",
          }),
        },
        staff.localId
      );

      // El aforo lo actualiza el evento de socket, pero se refresca igual por
      // las dudas de que el websocket esté caído.
      if (res.resultado === "ok" && eventoSeleccionado) {
        void get().seleccionarEvento(eventoSeleccionado);
      }

      // La API devuelve 200 con el `resultado` también para los desenlaces
      // negativos, así que acá no hace falta interpretar códigos HTTP.
      return {
        resultado: res.resultado,
        entrada: res.entrada,
        ...(res.sinCodigoRotativo !== undefined && {
          sinCodigoRotativo: res.sinCodigoRotativo,
        }),
        ...(res.aCobrar !== undefined && { aCobrar: res.aCobrar }),
      };
    } catch (err) {
      return {
        resultado: "error",
        entrada: null,
        mensaje: err instanceof Error ? err.message : "Error al validar",
      };
    }
  },

  registrarAcceso: async (tipo) => {
    const { staff } = useAuthStore.getState();
    const { eventoSeleccionado, aforo, online } = get();
    if (!staff || !eventoSeleccionado || !aforo) return;

    // Validar aforo para ingresos (incluso offline)
    if (tipo === "ingreso" && aforo.lleno) {
      set({ error: "Aforo completo — no se pueden registrar más ingresos" });
      return;
    }

    const acceso: AccesoOffline = {
      id: generarUUID(),
      eventoId: eventoSeleccionado.id,
      tipo,
      metodo: "manual",
      createdAt: new Date().toISOString(),
    };

    // Actualización optimista del aforo local
    const delta = tipo === "ingreso" ? 1 : -1;
    const nuevoAforo = Math.max(0, aforo.aforoActual + delta);
    set({
      aforo: {
        ...aforo,
        aforoActual: nuevoAforo,
        ingresos: tipo === "ingreso" ? aforo.ingresos + 1 : aforo.ingresos,
        egresos: tipo === "egreso" ? aforo.egresos + 1 : aforo.egresos,
        disponibles: aforo.capacidad - nuevoAforo,
        lleno: nuevoAforo >= aforo.capacidad,
      },
      error: null,
    });

    if (online) {
      // Enviar directo al servidor
      try {
        await api.post("/accesos", acceso, staff.localId);
      } catch {
        // Falló aunque estábamos "online" → guardar en cola
        const cola = [...get().colaOffline, acceso];
        guardarColaLocal(cola);
        set({ colaOffline: cola });
      }
    } else {
      // Offline → encolar localmente
      const cola = [...get().colaOffline, acceso];
      guardarColaLocal(cola);
      set({ colaOffline: cola });
    }
  },

  sincronizarCola: async () => {
    const { staff } = useAuthStore.getState();
    const { colaOffline } = get();
    if (!staff || colaOffline.length === 0) return;

    set({ sincronizando: true });
    try {
      await api.post(
        "/accesos/sync",
        { accesos: colaOffline },
        staff.localId
      );
      // Limpiar cola local tras sync exitoso
      guardarColaLocal([]);
      set({ colaOffline: [] });

      // Refrescar aforo desde servidor
      const { eventoSeleccionado } = get();
      if (eventoSeleccionado) {
        const data = await api.get<AforoData>(
          `/accesos/aforo?eventoId=${eventoSeleccionado.id}`,
          staff.localId
        );
        set({ aforo: data });
      }
    } catch (err) {
      set({ error: `Error al sincronizar: ${(err as Error).message}` });
    } finally {
      set({ sincronizando: false });
    }
  },
}));

// ── Listener de socket para actualizaciones en tiempo real ───────
socket.on("aforo:actualizado", ({ eventoId, aforoActual }) => {
  const { eventoSeleccionado, aforo } = usePorteriaStore.getState();
  if (!aforo || eventoSeleccionado?.id !== eventoId) return;

  usePorteriaStore.setState({
    aforo: {
      ...aforo,
      aforoActual,
      disponibles: aforo.capacidad - aforoActual,
      lleno: aforoActual >= aforo.capacidad,
    },
  });
});

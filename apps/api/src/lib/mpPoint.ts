/**
 * Cliente de Mercado Pago Point — Terminals API + Orders API.
 *
 * Modelo de integración (importante para entender el flujo):
 *   1. Nuestro sistema crea una *order* apuntando a un `terminal_id`.
 *   2. La terminal la levanta sola y el comprador paga ahí.
 *   3. MP nos avisa por webhook cómo terminó.
 *
 * La terminal NO aloja el catálogo de productos: el pedido se arma en el POS de
 * Niágara y la Point solo cobra. Para que sea manejable por API tiene que estar
 * en modo PDV, y en ese modo **solo acepta tarjetas** (no QR de billetera).
 *
 * Nota sobre montos: MP exige el monto como string con exactamente 2 decimales,
 * incluso si es entero ("10.00"). Ver `formatearMonto`.
 *
 * Docs: https://www.mercadopago.com.ar/developers/es/docs/mp-point/overview
 */

import { randomUUID } from "node:crypto";

const MP_BASE_URL = "https://api.mercadopago.com";

/**
 * Lee el token del entorno, limpio.
 *
 * Se lee en cada llamada y no una vez al importar el módulo: si alguien carga
 * la variable en Render pero el proceso ya estaba levantado, con la constante
 * el token quedaba en `undefined` hasta el próximo reinicio y la API seguía
 * diciendo "no configurado" aunque en el panel figurara cargado.
 *
 * Las comillas se sacan porque pegar `"APP_USR-..."` en el panel de Render
 * guarda las comillas como parte del valor. MP devuelve un 401 y el error que
 * se ve es "token inválido", que manda a buscar el problema al lado equivocado.
 */
function tokenMP(): string | undefined {
  const crudo = process.env["MP_ACCESS_TOKEN"]?.trim().replace(/^["']|["']$/g, "");
  return crudo ? crudo : undefined;
}

/** true si hay credenciales de MP configuradas */
export function pointConfigurado(): boolean {
  return tokenMP() !== undefined;
}

// ── Tipos de la API ──────────────────────────────────────────────

export type ModoOperacion = "PDV" | "STANDALONE" | "UNDEFINED";

export interface TerminalMP {
  id: string;
  /**
   * MP lo manda como número, aunque `store_id` —que es lo mismo pero de la
   * sucursal— viene como string. Acá estaba declarado `string` y no era cierto:
   * el valor pasaba tal cual a Prisma y el upsert fallaba con "Expected String,
   * provided Int". Se guarda como texto (ver `posIdComoTexto`), que es lo que
   * espera la columna y lo correcto para un identificador.
   */
  pos_id: number | string;
  store_id: string;
  external_pos_id?: string;
  operating_mode: ModoOperacion;
}

/** El `pos_id` es un identificador, no una cantidad: nunca se suma ni se
 *  compara por orden, así que va como texto y aguanta si MP algún día lo
 *  devuelve alfanumérico. */
export function posIdComoTexto(posId: number | string): string {
  return String(posId);
}

/**
 * Alias visible de la terminal.
 *
 * `external_pos_id` puede venir como cadena vacía, no solo ausente, así que no
 * alcanza con `??`: con `""` el nombre quedaba en blanco y en el panel la
 * terminal aparecía sin identificar. La serie impresa atrás del equipo —la
 * parte después de `__`— es el mejor plan B, porque es lo que el encargado
 * puede leer del aparato.
 */
export function nombrePorDefecto(terminal: TerminalMP): string {
  const externo = terminal.external_pos_id?.trim();
  if (externo) return externo;

  const serie = terminal.id.split("__")[1]?.trim();
  return serie || terminal.id;
}

/**
 * Estados posibles de una orden. `created` es el momento en que la creamos,
 * `at_terminal` cuando la terminal ya la levantó, `processed` cuando el pago
 * salió bien.
 */
export type EstadoOrden =
  | "created"
  | "at_terminal"
  | "processed"
  | "canceled"
  | "expired"
  | "refunded"
  | "action_required";

export interface PagoOrdenMP {
  id: string;
  amount: string;
  status: string;
  status_detail?: string;
  paid_amount?: string;
  refunded_amount?: string;
  payment_method?: {
    type?: string;
    installments?: number;
    id?: string;
  };
}

export interface OrdenMP {
  id: string;
  type: string;
  external_reference: string;
  status: EstadoOrden;
  status_detail?: string;
  created_date?: string;
  last_updated_date?: string;
  config?: {
    point?: {
      terminal_id?: string;
      print_on_terminal?: string;
      ticket_number?: string;
    };
  };
  transactions?: {
    payments?: PagoOrdenMP[];
    refunds?: {
      id: string;
      transaction_id: string;
      amount: string;
      status: string;
    }[];
  };
}

/** Error de la API de MP con el status HTTP, para poder mapearlo a la respuesta */
export class MPPointError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly cuerpo?: unknown
  ) {
    super(message);
    this.name = "MPPointError";
  }
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * MP rechaza montos sin 2 decimales exactos. `Decimal` de Prisma y `number` de
 * JS pueden llegar como 10 o 10.5, así que se normaliza siempre.
 */
export function formatearMonto(monto: number | string): string {
  const n = typeof monto === "string" ? Number(monto) : monto;
  if (!Number.isFinite(n) || n < 0) {
    throw new MPPointError(`Monto inválido: ${String(monto)}`, 400);
  }
  return n.toFixed(2);
}

/**
 * `external_reference` de MP solo admite letras, números, guion y guion bajo,
 * hasta 64 caracteres, y no puede llevar datos personales. Los UUID que usa el
 * POS ya cumplen, pero se valida para no descubrirlo en producción.
 */
export function validarReferencia(referencia: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(referencia)) {
    throw new MPPointError(
      "La referencia externa solo admite letras, números, guion y guion bajo (máx. 64)",
      400
    );
  }
  return referencia;
}

async function pedir<T>(
  path: string,
  init: { method: string; body?: unknown; idempotente?: boolean } = { method: "GET" }
): Promise<T> {
  const token = tokenMP();

  if (!token) {
    throw new MPPointError(
      "MP_ACCESS_TOKEN no configurado — no se puede operar con las terminales Point",
      503
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // MP usa esta clave para no duplicar operaciones si reintentamos.
  if (init.idempotente) {
    headers["X-Idempotency-Key"] = randomUUID();
  }

  const res = await fetch(`${MP_BASE_URL}${path}`, {
    method: init.method,
    headers,
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });

  const texto = await res.text();

  // Se parsea con red de contención y **después** se mira el status.
  //
  // Antes esto era `texto ? JSON.parse(texto) : null` suelto, arriba del
  // chequeo de `res.ok`: cuando MP contestaba un error con HTML —pasa con
  // algunos 401 y con las páginas de mantenimiento— el JSON.parse explotaba
  // con un SyntaxError que no es MPPointError, se escapaba del catch de la
  // ruta y llegaba al navegador como "500 Internal Server Error", sin ninguna
  // pista de que el problema venía de Mercado Pago.
  let cuerpo: unknown = null;
  if (texto) {
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      cuerpo = null;
    }
  }

  if (!res.ok) {
    // El chequeo `"message" in cuerpo` ya narrowea el tipo, no hace falta cast.
    const detalle =
      typeof cuerpo === "object" && cuerpo !== null && "message" in cuerpo
        ? String(cuerpo.message)
        : texto.slice(0, 300);

    // "unauthorized" a secas no dice qué hacer. Estos dos son los motivos
    // reales por los que falla la primera vez que alguien conecta la cuenta.
    const ayuda =
      res.status === 401
        ? " — revisá que el token sea el de la cuenta del boliche y que esté " +
          "copiado entero (los de producción empiezan con APP_USR-)"
        : res.status === 403
          ? " — el token es válido pero esa cuenta no tiene habilitado Point"
          : "";

    throw new MPPointError(`MP ${res.status}: ${detalle}${ayuda}`, res.status, cuerpo);
  }

  // Respuesta OK pero ilegible: es raro, pero devolver `null as T` haría que
  // reviente más adelante en un lugar que no tiene nada que ver.
  if (texto && cuerpo === null) {
    throw new MPPointError(
      `MP respondió ${res.status} con un cuerpo que no es JSON: ${texto.slice(0, 200)}`,
      502
    );
  }

  return cuerpo as T;
}

// ── Terminales ───────────────────────────────────────────────────

/** Listar las terminales de la cuenta. Se puede filtrar por store y pos. */
export async function listarTerminales(filtro?: {
  storeId?: string;
  posId?: string;
  limit?: number;
  offset?: number;
}): Promise<TerminalMP[]> {
  const params = new URLSearchParams({
    limit: String(filtro?.limit ?? 50),
    offset: String(filtro?.offset ?? 0),
  });
  if (filtro?.storeId) params.set("store_id", filtro.storeId);
  if (filtro?.posId) params.set("pos_id", filtro.posId);

  const data = await pedir<{ data?: { terminals?: TerminalMP[] } }>(
    `/terminals/v1/list?${params.toString()}`
  );

  return data.data?.terminals ?? [];
}

/**
 * Poner terminales en modo PDV, que es el único que permite cobrar por API.
 * Después de esto hay que **reiniciar la terminal** para que tome el cambio.
 */
export async function activarModoPDV(terminalIds: string[]): Promise<TerminalMP[]> {
  const data = await pedir<{ terminals?: TerminalMP[] }>("/terminals/v1/setup", {
    method: "PATCH",
    body: {
      terminals: terminalIds.map((id) => ({ id, operating_mode: "PDV" })),
    },
  });

  return data.terminals ?? [];
}

// ── Órdenes de cobro ─────────────────────────────────────────────

export interface CrearOrdenInput {
  terminalId: string;
  monto: number | string;
  /** Identificador propio; usamos el id de la venta que se va a crear */
  referencia: string;
  descripcion?: string;
  /** ISO 8601 de duración. Mínimo PT30S, máximo PT3H. Default de MP: 15 min. */
  expiracion?: string;
  /** Número de ticket que se muestra en la terminal */
  numeroTicket?: string;
  /**
   * Qué comprobante imprime la terminal.
   *
   * Los tres valores son los que acepta MP; no hay otros. Acá decía `"ticket"`,
   * que no existe, y MP rechazaba **toda** orden con un 400 — o sea, el cobro
   * con terminal nunca podía funcionar.
   *
   *   seller_ticket — copia para el comercio
   *   buyer_ticket  — copia para el cliente
   *   no_ticket     — no imprime nada
   */
  imprimirEnTerminal?: "seller_ticket" | "buyer_ticket" | "no_ticket";
}

/**
 * Crear una orden y despacharla a la terminal.
 *
 * Ojo: el `expiracion` por defecto lo dejamos corto (2 minutos) a propósito. En
 * una barra de boliche, una orden colgada 15 minutos bloquea la terminal y
 * genera cobros a la persona equivocada.
 */
export async function crearOrden(input: CrearOrdenInput): Promise<OrdenMP> {
  return pedir<OrdenMP>("/v1/orders", {
    method: "POST",
    idempotente: true,
    body: {
      type: "point",
      external_reference: validarReferencia(input.referencia),
      expiration_time: input.expiracion ?? "PT2M",
      description: input.descripcion ?? "Club Niágara",
      transactions: {
        payments: [{ amount: formatearMonto(input.monto) }],
      },
      config: {
        point: {
          terminal_id: input.terminalId,
          // Por defecto imprime el ticket del cliente: es el que se lleva quien
          // pagó, y es lo que el cliente pidió (que el comprobante salga solo
          // de la terminal al cobrar).
          print_on_terminal: input.imprimirEnTerminal ?? "buyer_ticket",
          ...(input.numeroTicket && { ticket_number: input.numeroTicket }),
        },
      },
    },
  });
}

/** Consultar el estado de una orden. Usar con moderación: MP prefiere webhooks. */
export async function consultarOrden(ordenId: string): Promise<OrdenMP> {
  return pedir<OrdenMP>(`/v1/orders/${ordenId}`);
}

/**
 * Cancelar una orden. Solo funciona si sigue en `created`; si la terminal ya la
 * levantó (`at_terminal`), hay que cancelarla desde el equipo.
 */
export async function cancelarOrden(ordenId: string): Promise<OrdenMP> {
  return pedir<OrdenMP>(`/v1/orders/${ordenId}/cancel`, {
    method: "POST",
    idempotente: true,
  });
}

/**
 * Reembolsar una orden. Sin `monto` es total; con `monto` es parcial y hace
 * falta el id de la transacción de pago. Plazo máximo: 90 días.
 */
export async function reembolsarOrden(
  ordenId: string,
  parcial?: { transaccionId: string; monto: number | string }
): Promise<OrdenMP> {
  return pedir<OrdenMP>(`/v1/orders/${ordenId}/refund`, {
    method: "POST",
    idempotente: true,
    ...(parcial && {
      body: {
        transactions: [
          { id: parcial.transaccionId, amount: formatearMonto(parcial.monto) },
        ],
      },
    }),
  });
}

// ── Impresiones ──────────────────────────────────────────────────

/** Tags soportados por las impresiones `custom` de MP */
export const TAGS_IMPRESION = {
  negrita: (t: string) => `{b}${t}{/b}`,
  grande: (t: string) => `{w}${t}{/w}`,
  chica: (t: string) => `{s}${t}{/s}`,
  centrado: (t: string) => `{center}${t}{/center}`,
  izquierda: (t: string) => `{left}${t}{/left}`,
  qr: (t: string) => `{qr}${t}{/qr}`,
  salto: "{br}",
} as const;

/**
 * Mandar una impresión a una terminal.
 *
 * `custom` acepta entre 100 y 4096 caracteres (contando los tags), así que un
 * ticket muy corto falla — de ahí el relleno con saltos de línea.
 * `image` acepta PNG/JPEG en Base64 hasta 1 MB.
 */
export async function imprimirEnTerminal(input: {
  terminalId: string;
  referencia: string;
  contenido: string;
  tipo?: "custom" | "image";
}): Promise<{ id: string; status: string }> {
  const tipo = input.tipo ?? "custom";
  let contenido = input.contenido;

  if (tipo === "custom") {
    if (contenido.length > 4096) {
      throw new MPPointError("El contenido a imprimir excede los 4096 caracteres", 400);
    }
    // MP rechaza contenidos de menos de 100 caracteres.
    if (contenido.length < 100) {
      contenido = contenido.padEnd(100, TAGS_IMPRESION.salto);
    }
  }

  return pedir<{ id: string; status: string }>("/terminals/v1/actions", {
    method: "POST",
    idempotente: true,
    body: {
      type: "print",
      external_reference: validarReferencia(input.referencia),
      config: { point: { terminal_id: input.terminalId, subtype: tipo } },
      content: contenido,
    },
  });
}

// ── Utilidades de dominio ────────────────────────────────────────

/** ¿El pago de esta orden se concretó? */
export function ordenPagada(orden: OrdenMP): boolean {
  return orden.status === "processed";
}

/** ¿La orden terminó sin cobrar y ya no va a cambiar? */
export function ordenCerradaSinPago(orden: OrdenMP): boolean {
  return orden.status === "canceled" || orden.status === "expired";
}

/** Id de la transacción de pago, necesario para reembolsos parciales */
export function idPagoDeOrden(orden: OrdenMP): string | null {
  return orden.transactions?.payments?.[0]?.id ?? null;
}

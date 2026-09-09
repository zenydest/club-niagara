/**
 * Venta pública de entradas.
 * Prefix: /api/publico
 *
 * Es la puerta de entrada para gente que no tiene cuenta ni la app: llega por
 * un link que compartió un RRPP o el propio boliche, elige su entrada, paga y
 * recibe el QR. Sin registro.
 *
 * **Todo este archivo es sin autenticación.** Por eso cada endpoint expone lo
 * mínimo: nada de recaudación, ni de otros compradores, ni del panel.
 *
 * El `localId` no viene por header como en el resto de la API —quien abre el
 * link no lo conoce— sino que se deduce del evento.
 */

import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@niagara/db";
import { io } from "../index.js";
import { crearPreferenciaEntradas } from "../lib/mpCheckout.js";
import { reservarCupo, mensajeRechazoCupo } from "../lib/reservarCupo.js";

export const registrarRutasPublico: FastifyPluginAsync = async (app) => {

  /**
   * GET /api/publico/eventos/:id — datos del evento para la página de compra.
   *
   * Solo eventos a la venta: un borrador o uno cerrado no debe poder abrirse
   * aunque alguien tenga el link.
   */
  app.get("/eventos/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    const evento = await prisma.evento.findFirst({
      where: { id, estado: { in: ["preventa", "en_vivo"] } },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        fechaInicio: true,
        imagenUrl: true,
        capacidad: true,
        entradasTipo: {
          where: { activo: true },
          orderBy: { precio: "asc" },
          select: {
            id: true,
            nombre: true,
            tipo: true,
            precio: true,
            cantidadTotal: true,
            cantidadVendida: true,
            ocupaLugar: true,
          },
        },
      },
    });

    if (!evento) {
      return reply.status(404).send({ error: "El evento no está disponible" });
    }

    /**
     * Lugares que quedan en el salón, compartidos por todos los tipos que
     * ocupan lugar.
     *
     * Sin esto, con 300 de capacidad y los tipos sin tope propio, la página
     * diría "quedan todas" hasta el último momento y después la compra se
     * rechazaría: el comprador llena el formulario para que le digan que no.
     */
    const lugaresOcupados = evento.entradasTipo
      .filter((t) => t.ocupaLugar)
      .reduce((acc, t) => acc + t.cantidadVendida, 0);

    const lugaresLibres = Math.max(0, evento.capacidad - lugaresOcupados);

    const { capacidad: _capacidad, ...datosEvento } = evento;

    return {
      evento: {
        ...datosEvento,
        entradasTipo: evento.entradasTipo.map((t) => {
          // El tope propio del tipo, si tiene uno.
          const enElTipo =
            t.cantidadTotal === null
              ? null
              : Math.max(0, t.cantidadTotal - t.cantidadVendida);

          // Manda el más chico de los dos: de nada sirve que queden 200 de este
          // tipo si en el salón entran 10.
          const disponibles = !t.ocupaLugar
            ? enElTipo
            : enElTipo === null
              ? lugaresLibres
              : Math.min(enElTipo, lugaresLibres);

          return {
            id: t.id,
            nombre: t.nombre,
            tipo: t.tipo,
            precio: Number(t.precio),
            // Se informa cuántas quedan, no cuántas se vendieron: al comprador
            // le sirve saber si llega, no el negocio del boliche.
            disponibles,
          };
        }),
      },
    };
  });

  /**
   * POST /api/publico/comprar
   *
   * Crea las entradas impagas y devuelve el link de pago. Se confirman cuando
   * Mercado Pago avisa por webhook, igual que las compras desde la app: que
   * exista la entrada no significa que entró la plata.
   */
  app.post("/comprar", async (req, reply) => {
    const body = z.object({
      entradaTipoId: z.string().uuid(),
      cantidad: z.number().int().positive().max(10).default(1),
      nombre: z.string().min(2).max(100),
      email: z.string().email(),
      telefono: z.string().max(30).optional(),
      /** Código del RRPP que compartió el link, si vino por uno. */
      rrpp: z.string().max(20).optional(),
    }).safeParse(req.body);

    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const { entradaTipoId, cantidad, nombre, email, telefono, rrpp } = body.data;

    const tipo = await prisma.entradaTipo.findFirst({
      where: { id: entradaTipoId, activo: true },
      include: {
        evento: { select: { id: true, nombre: true, estado: true } },
      },
    });

    if (!tipo) return reply.status(404).send({ error: "Entrada no disponible" });

    if (!["preventa", "en_vivo"].includes(tipo.evento.estado)) {
      return reply.status(409).send({ error: "El evento no está a la venta" });
    }

    // Corte temprano para el caso común —la tanda ya se agotó— y para poder
    // decir cuántas quedan. No es el control de cupo: ese está más abajo, en el
    // UPDATE condicional, porque acá todavía se puede colar otra compra.
    if (tipo.cantidadTotal !== null) {
      const disponibles = tipo.cantidadTotal - tipo.cantidadVendida;
      if (disponibles < cantidad) {
        return reply.status(422).send({
          error: disponibles <= 0 ? "Se agotaron" : `Quedan solo ${disponibles}`,
          disponibles: Math.max(0, disponibles),
        });
      }
    }

    // El RRPP se resuelve por su código. Si no existe o está inactivo, la venta
    // sigue igual sin asociar: perder una venta por un link viejo sería peor.
    const staffRrpp = rrpp
      ? await prisma.staff.findFirst({
          where: { codigoRrpp: rrpp.toUpperCase(), activo: true, rol: "rrpp" },
          select: { id: true },
        })
      : null;

    const referenciaCompra = randomUUID();
    const precio = Number(tipo.precio);

    // La reserva del cupo y la creación de las entradas van juntas: si algo
    // falla en el medio, no queda ni el lugar descontado ni la entrada suelta.
    const reserva = await prisma.$transaction(async (tx) => {
      const resultado = await reservarCupo(tx, entradaTipoId, cantidad);

      // Sin lugar no se crea nada: la transacción termina sin escribir entradas.
      if (!resultado.ok) return resultado;

      await Promise.all(
        Array.from({ length: cantidad }).map(() =>
          tx.entradaVendida.create({
            data: {
              localId: tipo.localId,
              eventoId: tipo.eventoId,
              entradaTipoId,
              clienteNombre: nombre,
              clienteEmail: email,
              clienteTelefono: telefono ?? null,
              precioPagado: precio,
              metodoPago: "qr_mp",
              pagada: false,
              rrppId: staffRrpp?.id ?? null,
              mpPreferenceId: referenciaCompra,
              // Sin código rotativo: se entrega por link, igual que las ventas
              // del panel. Ver el comentario en routes/entradas.ts.
              qrSecret: null,
            },
          })
        )
      );

      return resultado;
    });

    if (!reserva.ok) {
      return reply.status(422).send({
        error: mensajeRechazoCupo(reserva),
        disponibles: reserva.disponibles,
        motivo: reserva.motivo,
      });
    }

    try {
      const pref = await crearPreferenciaEntradas({
        referencia: referenciaCompra,
        descripcion: `${tipo.evento.nombre} — ${tipo.nombre}`,
        precioUnitario: precio,
        cantidad,
        emailComprador: email,
      });

      io.to(`local:${tipo.localId}`).emit("entrada:vendida", {
        eventoId: tipo.eventoId,
        cantidad,
        total: precio * cantidad,
        metodoPago: "qr_mp",
      });

      return reply.status(201).send({
        referencia: referenciaCompra,
        linkPago: pref.linkPago,
      });
    } catch (err) {
      /**
       * Si no se pudo abrir el pago, las entradas quedan reservadas e impagas.
       * No se borran: si el problema fue de Mercado Pago y la persona
       * reintenta, el cupo sigue siendo suyo. El panel las ve como impagas.
       */
      req.log.error({ err, referenciaCompra }, "Falló la preferencia de pago pública");

      return reply.status(502).send({
        error:
          "No se pudo abrir el pago. Escribinos y te confirmamos la entrada a mano.",
        referencia: referenciaCompra,
      });
    }
  });

  /**
   * GET /api/publico/compra/:referencia
   *
   * Estado de la compra después de volver de Mercado Pago. Devuelve los links
   * de cada entrada para que la persona los guarde.
   */
  app.get("/compra/:referencia", async (req, reply) => {
    const { referencia } = req.params as { referencia: string };

    const entradas = await prisma.entradaVendida.findMany({
      where: { mpPreferenceId: referencia },
      select: {
        qrCode: true,
        pagada: true,
        clienteNombre: true,
        evento: { select: { nombre: true, fechaInicio: true } },
      },
    });

    if (entradas.length === 0) {
      return reply.status(404).send({ error: "No encontramos esa compra" });
    }

    const primera = entradas[0];

    return {
      pagadas: entradas.filter((e) => e.pagada).length,
      total: entradas.length,
      evento: primera?.evento ?? null,
      nombre: primera?.clienteNombre ?? null,
      // El link de cada entrada; el navegador arma la URL completa.
      codigos: entradas.map((e) => e.qrCode),
    };
  });
};

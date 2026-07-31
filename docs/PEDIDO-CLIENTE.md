# Pedido del cliente — análisis de factibilidad y brecha

> Estado del código: julio 2026. Verificado contra la documentación oficial de
> Mercado Pago Point (links al final).

## Resumen

De los cuatro bloques que pidió el cliente, **dos son viables tal cual**, uno
necesita un ajuste de arquitectura y **uno no es posible con Point**.

| Pedido | Veredicto |
|---|---|
| Tickets impresos desde el Point, sin térmicas | ✅ Viable — API de impresiones |
| Panel en vivo con las ventas de los dos cajeros | ✅ Viable — ya casi está hecho |
| Menú visual de productos **dentro** del Point | ⚠️ Replantear — el catálogo va en otro dispositivo |
| Escanear QR de entrada **con** el Point | ❌ No es posible — hace falta otro equipo |

---

## 1. Impresión de tickets sin térmicas ✅

**Es viable y confirmado.** Las Point Smart 1 y 2 tienen impresora, y la
Terminals API permite mandarles impresiones propias:

```
POST https://api.mercadopago.com/terminals/v1/actions
{ "type": "print",
  "config": { "point": { "terminal_id": "...", "subtype": "custom" } },
  "external_reference": "...",
  "content": "{center}{w}CLUB NIÁGARA{/w}{br}..." }
```

Dos modos:

- `subtype: "custom"` — texto con tags (`{b}` negrita, `{w}` grande, `{s}` chica,
  `{center}`, `{br}`, y **`{qr}`**). Entre 100 y 4096 caracteres.
- `subtype: "image"` — PNG/JPEG en Base64, hasta 1 MB.

**Dato importante: `{qr}` imprime un QR.** O sea que el Point de la barra puede
vender e imprimir una entrada con su QR en el mismo ticket. Eso cubre boletería
en puerta sin hardware extra.

### Qué falta implementar

- Cliente de la Terminals API (`POST /terminals/v1/actions`) — no existe.
- `GET /terminals` para listar y guardar los `terminal_id` de los tres equipos.
- Plantilla del ticket de venta con el detalle de productos.
- Plantilla del ticket de entrada con `{qr}`.
- Guardar `terminalId` en la tabla `barras` o en una tabla `terminales` nueva.

---

## 2. Panel de control en vivo ✅

**Es lo que está más avanzado.** Ya existe:

- `DashboardPage` con KPIs y suscripción a Socket.io.
- Rooms por local y por rol (`local:{id}`, `local:{id}:{rol}`) en
  `apps/api/src/socket/index.ts`.
- Eventos `venta:nueva`, `aforo:actualizado`, `evento:estado_cambiado`.
- `ReportesPage` con corte de caja y desglose por método de pago.

### Qué falta

- **Ventas por cajero.** El evento `venta:nueva` manda `{ localId, eventoId,
  total, metodoPago }` pero **no manda quién vendió**. El cliente quiere ver la
  recaudación *de cada uno de los dos cajeros*, así que hay que agregar
  `staffId` y `barraId` al payload, y una vista de recaudación por cajero.
- **El feed de accesos está muerto.** `DashboardPage` lo renderiza pero la API
  no emite ningún evento de acceso. Falta emitir `acceso:nuevo`.
- Vista de arqueo por terminal, para cruzar contra lo que reporta MP.

---

## 3. Menú de productos en el Point ⚠️

**Acá hay que corregir el supuesto.** El modelo de integración de Point es el
inverso al que imagina el cliente:

> «Creás la order de pago desde tu sistema a través de nuestra API unificada.
> La terminal Point carga la order de pago automáticamente.»

El Point **no aloja tu catálogo**. Es un periférico de cobro: recibe un monto y
lo procesa. MP no documenta ninguna forma de instalar una app propia con un menú
visual en la Point Smart.

### Cómo sí funciona

El cajero necesita **un dispositivo con el POS de Niágara** (una tablet Android
barata, o incluso el celular del cajero) que muestre la grilla de productos —
que es exactamente lo que ya hace `apps/pos`. El flujo queda:

1. Cajero arma el pedido en la tablet (`GrillaProductos` + `Carrito`, ya hechos).
2. La tablet le pide a la API crear una order en el Point de esa barra.
3. El Point levanta la order solo y cobra.
4. Webhook confirma → la venta se marca pagada.
5. La API manda la impresión del ticket al mismo Point.

**El ahorro de hardware se mantiene**: no se compran térmicas. Pero hacen falta
dos tablets, una por cajero, además de los dos Point.

> Vale confirmarlo comercialmente con MP: existe un repo viejo,
> `mercadopago/point-android_integration`, con integración por Intent para apps
> Android propias, pero es para los lectores Bluetooth de generación anterior
> (Point Blue/Mini), no para Point Smart. No lo daría por bueno sin que MP lo
> confirme por escrito.

### Qué falta implementar

- Reescribir `apps/api/src/routes/mp.ts`. **Hoy usa la API equivocada**: pega a
  `/checkout/preferences`, que es el checkout *online* (devuelve un `init_point`
  y un QR para que el cliente pague con su celular). Para Point hay que usar la
  **Orders API** apuntando a un `terminal_id`.
- Asociar cada barra con su `terminal_id`.
- En `apps/pos`, reemplazar el cobro local por «crear order en el Point y esperar
  confirmación», con estados en pantalla (esperando tarjeta / aprobado /
  rechazado).
- Webhook de orders que cierre la venta.

---

## 4. Validación de QR en la puerta ❌

**Esto no se puede hacer con un Point.** La Terminals API solo acepta un tipo de
acción, y es `print`. No hay ninguna acción de escaneo, y el lector de QR de la
Point Smart sirve para *cobrar* (el cliente muestra un QR de pago), no para leer
un QR arbitrario y devolverle el contenido a tu sistema.

### Alternativas, de más barata a más cómoda

1. **Un celular Android con la app de Niágara** y la cámara. Es la opción que
   menos cuesta y aprovecha `apps/mobile`, que ya existe.
2. **La web de portería en un celular**, usando la cámara del navegador. Ya
   existe `PorteriaPage` con control de aforo y cola offline; le falta el
   escáner.
3. Un lector de códigos USB/Bluetooth dedicado conectado a una tablet.

Yo iría por la 2: `PorteriaPage` ya tiene la lógica de aforo y funciona offline,
así que es agregarle el escáner y nada más.

### Lo que sí está hecho

El backend de validación **ya está completo y correcto**:

- `GET /api/entradas/qr/:qrCode` busca la entrada.
- `PATCH /api/entradas/vendidas/:id/usar` la marca como usada.
- El chequeo de «quemado» existe: si `entrada.usada` es true, rechaza. Un QR no
  se puede usar dos veces.
- Los `qrCode` son UUID únicos por entrada.

### Qué falta

- Escáner de cámara en el front (`expo-camera` en mobile, o `BarcodeDetector` /
  una lib de QR en la web).
- Que el «quemado» sea atómico. Hoy son dos operaciones: leer y después marcar.
  Con dos porteros escaneando el mismo QR al mismo tiempo, ambos podrían pasar.
  Hay que resolverlo con un `UPDATE ... WHERE usada = false` y ver si afectó
  filas.
- Feedback en la puerta: verde/rojo y sonido, que con poca luz y ruido importa.

---

## Plan de implementación sugerido

**Primero — desbloquear el modelo de cobro**

1. Cliente de la Orders API de Point + `GET /terminals`.
2. Tabla/campo de terminales, asociadas a barra.
3. Flujo de cobro en `apps/pos` contra el Point.
4. Webhook de orders con verificación de firma e idempotencia.

**Segundo — impresión**

5. `POST /terminals/v1/actions` con la plantilla del ticket de venta.
6. Plantilla de entrada con `{qr}`.

**Tercero — puerta**

7. Escáner de QR en portería.
8. Quemado atómico del QR.

**Cuarto — panel**

9. `staffId` y `barraId` en `venta:nueva` + recaudación por cajero.
10. Emitir `acceso:nuevo` y conectar el feed del dashboard.

---

## Riesgos a mirar de frente

- **El cobro pasa a depender de internet.** Hoy `apps/pos` vende offline y
  sincroniza después, que es una de las mejores decisiones del proyecto. Cobrar
  con Point exige conexión: sin internet, el Point no cobra. Conviene mantener
  efectivo como camino offline y avisar en pantalla cuando el Point no esté
  disponible.
- **Los tres equipos son un cuello de botella.** Dos cajeros y una puerta para
  todo un boliche. Vale la pena estimar la fila en el pico de ingreso.
- **Falta probar con hardware real.** Nada de esto se puede validar sin las
  terminales en mano y credenciales de prueba de MP.

---

## Fuentes

- [Mercado Pago Point — Resumen de la integración](https://www.mercadopago.com.ar/developers/es/docs/mp-point/overview)
- [Configurar impresiones (Terminals API)](https://www.mercadopago.com.ar/developers/es/docs/mp-point/configure-printings)
- [Referencia: crear acción de impresión](https://www.mercadopago.com.mx/developers/en/reference/mercado_pago_point/impressions/post)
- [Integrar el procesamiento de pagos](https://www.mercadopago.com.ar/developers/es/docs/mp-point/payment-processing)
- [Migrar de Payment Intents a Orders](https://www.mercadopago.com.ar/developers/es/docs/mp-point/migrate-payment-intent-to-orders)
- [point-android_integration (integración por Intent, generación anterior)](https://github.com/mercadopago/point-android_integration)

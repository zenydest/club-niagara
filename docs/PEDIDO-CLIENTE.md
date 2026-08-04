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

---

## Consultas del cliente (segunda ronda)

### «¿Hace falta homologación o permisos especiales de Mercado Pago?»

**No.** La salida a producción de Point es **autogestionada**, sin certificación
ni aprobación previa. El checklist oficial es:

1. Activar las credenciales de producción desde *Tus integraciones* — se
   completa rubro, se aceptan los términos y un reCAPTCHA. Es inmediato.
2. Recrear tienda y punto de venta con el token de producción.
3. Re-asociar la terminal a la cuenta real desde la app del celular.
4. Poner cada terminal en modo PDV.
5. Configurar la URL de webhooks de producción.

No hay revisión humana, no hay homologación, no hay programa de partners
obligatorio.

**Decisión tomada: integración propia.** Es un solo boliche, no un producto para
revender, así que se usa directamente la cuenta de Mercado Pago del local.

Eso descarta el modelo «para terceros» con OAuth, que habría sumado un flujo de
autorización y un token que vence cada 180 días y hay que renovar o el sistema
deja de cobrar. Nada de eso aplica acá.

Lo que queda es simplemente:

1. El **dueño del boliche** entra a *Tus integraciones* en su cuenta de MP y
   crea la aplicación.
2. Activa las credenciales de producción.
3. Ese access token se carga en Render como `MP_ACCESS_TOKEN`.

> **El token es sensible.** Permite operar sobre los cobros de la cuenta. No
> debería viajar por WhatsApp ni quedar en el repo: lo ideal es que el dueño lo
> pegue directo en el panel de Render, o que lo rote desde MP una vez terminada
> la configuración.

Si en algún momento el proyecto sí se vendiera a otros locales, ahí sí habría
que migrar a OAuth. Migrar después cuesta más que arrancar así, pero para un
local único sería sobreingeniería.

### «¿Se puede cargar un menú de combos en el POS?»

**No dentro del dispositivo.** Revisada la documentación completa de Point, el
único tipo de acción que acepta la Terminals API es `print`. La terminal recibe
órdenes de cobro y las procesa; no aloja interfaces propias. El SDK de Android
que publica MP (`sdk-android`, `px-android`) sirve para meter pagos de MP
**dentro de tu app**, no para meter tu app dentro del Point.

**Pero el objetivo del cliente sí se cumple.** Lo que pidió textualmente fue:

> «que el cajero simplemente toque el botón del combo deseado, que el precio se
> cargue automáticamente, y el cliente proceda a pagar sin necesidad de que el
> empleado tipee el monto manualmente»

Eso es exactamente lo que hace la arquitectura implementada:

1. El cajero toca **"Combo Fernet"** en la tablet — la grilla de productos ya
   está hecha, con botones grandes pensados para pantalla táctil.
2. El sistema manda la orden al Point con el monto ya cargado.
3. El cliente apoya la tarjeta.
4. El Point imprime el comprobante.

**El empleado nunca tipea un monto.** El combo, el precio y el detalle salen del
catálogo. La diferencia con lo que imaginaba el cliente es en qué pantalla está
el menú, no en cómo se opera.

Y hay una ventaja de hacerlo así: el detalle de lo vendido queda en el sistema.
Si el menú viviera dentro del Point, MP solo registraría "cobro de $50.000" sin
saber que fueron dos fernet y un Skyy — y ahí se pierde el control de stock, el
costo por producto y el margen. Justamente lo que el cliente pide evitar cuando
habla de «minimizar faltantes y descuadres».

### «¿Se puede escanear el QR de entrada con el mismo POS?»

**No.** La Terminals API acepta un solo tipo de acción, `print`. No existe una
acción de escaneo, y el lector de QR de la Point Smart está para *cobrar* —el
cliente muestra un QR de pago— no para leer un código arbitrario y devolvérselo
a tu sistema.

La alternativa cuesta muy poco: un celular Android con la web de portería, que
ya tiene el escáner, el control de aforo y el quemado atómico del QR.

---

## Fuentes

- [Mercado Pago Point — Resumen de la integración](https://www.mercadopago.com.ar/developers/es/docs/mp-point/overview)
- [Configurar impresiones (Terminals API)](https://www.mercadopago.com.ar/developers/es/docs/mp-point/configure-printings)
- [Referencia: crear acción de impresión](https://www.mercadopago.com.mx/developers/en/reference/mercado_pago_point/impressions/post)
- [Integrar el procesamiento de pagos](https://www.mercadopago.com.ar/developers/es/docs/mp-point/payment-processing)
- [Migrar de Payment Intents a Orders](https://www.mercadopago.com.ar/developers/es/docs/mp-point/migrate-payment-intent-to-orders)
- [point-android_integration (integración por Intent, generación anterior)](https://github.com/mercadopago/point-android_integration)

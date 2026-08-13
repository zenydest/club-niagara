# Checklist de apertura — Club Niágara

Qué verificar antes de la primera noche con plata real. Ordenado por momento:
lo de arriba se hace una vez, lo de abajo cada noche.

---

## Una sola vez, antes de abrir

### Credenciales

- [ ] `BETTER_AUTH_SECRET` cargado en Render. Sin esto la API no arranca.
- [ ] `MP_ACCESS_TOKEN` es el de **producción** (`APP_USR-`), no el de prueba
      (`TEST-`), y de la cuenta del boliche.
- [ ] `MP_WEBHOOK_SECRET` cargado. En **Terminales**, el recuadro "Firma del
      webhook" tiene que decir **Activa**.
- [ ] `CLOUDINARY_URL` cargado, si se van a subir portadas desde el panel.

> El access token y el secret del webhook **no se pasan por chat ni por
> WhatsApp**. Se pegan directo en el panel de Render. Si alguno circuló por
> algún lado, se regenera desde Mercado Pago.

### Mercado Pago

- [ ] Webhook apuntando a `https://club-niagara-api.onrender.com/api/point/webhook`
- [ ] Eventos suscriptos: **Order**, **Integraciones Point** y **Pagos**
      (este último solo si se va a vender entradas online desde la app).
- [ ] Las dos terminales aparecen en **Terminales** después de sincronizar.
- [ ] Las dos están en modo **PDV**.
- [ ] Las dos se **reiniciaron** después de pasar a PDV. El modo no aplica del
      todo hasta reiniciar el equipo.
- [ ] La app de la terminal está **actualizada**. Con versiones viejas el
      posnet no ofrece QR, solo tarjeta.

### Datos del local

- [ ] **Barras** creadas, con los nombres que usa el personal ("Barra 1",
      "Barra de arriba", lo que se entienda de noche).
- [ ] Cada terminal **asignada a su barra** en Terminales. Si no, un cajero
      puede cobrar en la terminal de la otra barra y la recaudación queda mal
      atribuida.
- [ ] **Carta** cargada con precios reales. Los productos del seed son de
      prueba: revisar uno por uno o darlos de baja.
- [ ] **Depósitos** y stock inicial cargados, si se va a controlar inventario.
- [ ] **Personal** dado de alta, cada uno con su rol. Nadie comparte usuario:
      la recaudación por cajero se calcula por quién inició sesión.
- [ ] Contraseñas entregadas en persona, no por chat.

### Evento

- [ ] Evento creado con fecha, hora y capacidad reales.
- [ ] **Tipos de entrada** con sus precios y cupos.
- [ ] Portada cargada si se quiere que se vea en la app.
- [ ] Evento pasado a **preventa** o **en vivo**. En borrador no se vende ni
      aparece en la app.

### Prueba de punta a punta

Con plata real y monto chico, antes de que llegue gente:

- [ ] Venta con **efectivo** en la caja.
- [ ] Venta con **tarjeta** por terminal. Verificar que el monto llegue al
      posnet correcto (el de esa barra).
- [ ] Venta con **QR** por terminal.
- [ ] En **Reportes** las tres aparecen en la fila del método correcto.
- [ ] Venta de una **entrada** desde el panel.
- [ ] Esa entrada aparece en la **app** del cliente.
- [ ] La entrada **valida en la puerta** y no se puede usar dos veces.
- [ ] En **Terminales** no hay cobros huérfanos. Si aparecen, son de las
      pruebas: revisarlos antes de abrir.

---

## Cada noche, antes de abrir

- [ ] Terminales cargadas y con señal.
- [ ] Cada caja con **su barra seleccionada** arriba en Caja / POS.
- [ ] Evento de la noche en estado **en vivo**.
- [ ] Stock cargado si se repuso mercadería.

## Cada noche, al cerrar

- [ ] **Corte de caja** en Reportes.
- [ ] Cruzar el total por método contra el resumen de Mercado Pago.
- [ ] Revisar **cobros huérfanos** en Terminales. Son cobros que entraron sin
      venta registrada: hay que cargarlos a mano.
- [ ] Evento a **cerrado**.

---

## Si algo falla en plena noche

**La terminal no recibe el cobro.** Cobrar manual desde el posnet y marcar la
venta en la caja con el método que corresponda. La plata entra igual; lo que se
pierde es el registro automático.

**Se cae internet.** La caja guarda las ventas en el navegador y sincroniza al
volver la conexión. **No cerrar esa pestaña ni ese navegador** hasta que
sincronice, o las ventas se pierden. El cobro con terminal sí necesita internet.

**La API no responde.** Render en plan free duerme el servicio por inactividad;
la primera llamada del día puede tardar hasta un minuto. Si tarda más, revisar
el panel de Render.

**Alguien no puede iniciar sesión.** Un admin le cambia la contraseña desde
**Personal → Editar**. Eso cierra las sesiones abiertas de esa persona.

---

## Límites conocidos

Cosas que hoy **no** hace el sistema, para que nadie las dé por sentadas:

- La caja del panel **no funciona sin internet** para cobrar con terminal.
  Guarda la venta, pero el cobro necesita conexión.
- **No hay backup automático** de la base de datos.
- El plan free de Render **duerme el servicio** y la base tiene fecha de
  vencimiento. Ver `DEPLOY.md`.
- El pago online de entradas depende de que la aplicación de Mercado Pago
  tenga habilitado el checkout, que es distinto de Point.

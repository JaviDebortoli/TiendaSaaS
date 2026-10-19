# Verificación de los puntos [Verificar] (PRD sección 13)

Un punto pasa a **Resuelto** solo con evidencia escrita en este archivo. Los que ya están resueltos
tienen su evidencia en "Evidencia"; los pendientes necesitan credenciales de Mercado Pago y se
prueban con los pasos de "Pruebas de sandbox".

| #   | Punto                                                           | Estado                 | Quién lo resuelve               |
| --- | --------------------------------------------------------------- | ---------------------- | ------------------------------- |
| V1  | Webhook a nivel aplicación recibe pagos de locales vía OAuth    | **Pendiente** (ver V1) | Responsable, con credenciales   |
| V2  | Firma `x-signature` en notificaciones a `notification_url`      | **Pendiente** (ver V2) | Responsable, con credenciales   |
| V3  | `WebhookSignatureValidator` en `mercadopago` 3.x                | **Resuelto**           | Implementación                  |
| V4  | Compra como invitado con email ya registrado                    | **Resuelto**           | Implementación                  |
| V5  | Mismo email como invitado en dos tiendas                        | **Resuelto**           | Implementación                  |
| V6  | Lista completa de estados de pago                               | **Pendiente** (ver V6) | Responsable (una consulta real) |
| V7  | Una línea por producto vs. una sola línea con el total          | **Pendiente** (ver V7) | Responsable, con credenciales   |
| V8  | Calculator por defecto = tarifa fija exacta                     | **Resuelto**           | Implementación                  |
| V9  | `EmailPlugin`: remitente y plantilla por canal                  | **Resuelto**           | Implementación                  |
| V10 | SDK 3.x en servidor, OAuth con SDK, `UuidIdStrategy` + `strict` | **Resuelto**           | Implementación                  |

Puntos que aparecieron al implementar (no estaban en el PRD):

| #   | Punto                                                                                                 | Estado                  | Quién lo resuelve             |
| --- | ----------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------- |
| V11 | Qué pasa si el envío deja de ser elegible al pasar a pago (PRD 9.6 paso 1)                            | **Resuelto**            | Implementación                |
| V12 | Respuesta de la renovación del token (campos, rotación, `expires_in`)                                 | **Pendiente** (ver V12) | Responsable, con credenciales |
| V13 | Cuerpo y llegada de las notificaciones `mp-connect`                                                   | **Pendiente** (ver V13) | Responsable, con credenciales |
| V14 | `expiration_date_from` en el pasado y clave de idempotencia de la preferencia                         | **Pendiente** (ver V14) | Responsable, con credenciales |
| V15 | Mensaje de Mercado Pago al reembolsar sin saldo                                                       | **Pendiente** (ver V15) | Responsable, con credenciales |
| V16 | Parámetros de la redirección de vuelta y demora de `auto_return`                                      | **Pendiente** (ver V16) | Responsable, con credenciales |
| V17 | El `scope` que devuelve el OAuth incluye `offline_access`                                             | **Pendiente** (ver V17) | Responsable, con credenciales |
| V18 | Unidad de `ts` en `x-signature` (segundos o milisegundos)                                             | **Pendiente** (ver V18) | Responsable, con credenciales |
| V19 | `collector_id` del pago = `user_id` del OAuth = `user_id` de la notificación                          | **Pendiente** (ver V19) | Responsable, con credenciales |
| V20 | Si una autorización OAuth nueva de la misma cuenta anula los tokens anteriores                        | **Pendiente** (ver V20) | Responsable, con credenciales |
| V21 | Formato y largo de `external_reference` que Mercado Pago acepta y devuelve igual                      | **Pendiente** (ver V21) | Responsable, con credenciales |
| V22 | Cómo se obtiene el `preference_id` de un pago (también en efectivo)                                   | **Pendiente** (ver V22) | Responsable, con credenciales |
| V23 | Mercado Pago conserva `?ref=` de la `notification_url` (modo `preference`)                            | **Pendiente** (ver V23) | Responsable, con credenciales |
| V24 | Qué devuelve Mercado Pago con un token revocado (código HTTP y cuerpo), al usar el token y al renovar | **Pendiente** (ver V24) | Responsable, con credenciales |

**V19 se corre primero, y después V21 y V22** (V24 junto con V20): el rechazo de los pagos cuyo `collector_id` no coincide con la cuenta consultada
(PRD 9.5) depende de que los tres identificadores sean el mismo número. Si no coinciden, no sigas: la
regla hay que rediseñarla (avisá antes de tocarla). V21 y V22 son de la misma clase: el pago solo se
liquida si pertenece a una preferencia que emitió la plataforma (PRD 9.5), y eso depende de cómo
Mercado Pago devuelve la referencia y la preferencia del pago.

Las pruebas automáticas cubren todo lo demás con una API de Mercado Pago simulada. Lo que no pueden
probar es lo que Mercado Pago hace de verdad: eso es lo que listan los puntos pendientes.

---

## Pruebas de sandbox

### Preparación común (una sola vez)

Mercado Pago no puede llamar a `localhost`, y las URLs de retorno no pueden ser locales. Hace falta
una dirección pública con HTTPS y **subdominio fijo** (la `redirect_uri` de OAuth tiene que ser
estática). Cualquier túnel que lo permita sirve (por ejemplo un Cloudflare Tunnel con un dominio
propio, o un dominio reservado de ngrok).

1. **Dos direcciones públicas**: una apunta al puerto 3000 (servidor) y otra al 3001 (tienda).
   Ejemplos en esta guía: `https://api.midominio.com` y `https://tienda.midominio.com`.
2. **Aplicación de Mercado Pago** en <https://www.mercadopago.com.ar/developers/panel/app> (producto
   Checkout Pro). En sus detalles:
   - **URL de redireccionamiento (OAuth)**: `https://api.midominio.com/mercadopago/oauth/callback`.
   - Activar el **flujo con PKCE**.
   - Copiar el **Client ID** y el **Client secret**.
3. **Webhooks** (Tus integraciones › Webhooks › Configurar notificaciones › modo producción):
   - URL: `https://api.midominio.com/mercadopago/webhook`.
   - Eventos: **Pagos** y **Vinculación de aplicaciones** (tópico `mp-connect`).
   - Guardar la configuración: genera la **clave secreta**.
4. **Cuentas de prueba** (Tus integraciones › Cuentas de prueba): dos vendedores y un comprador, los
   tres de Argentina. Anotar usuario, contraseña y el código de 6 dígitos de cada una (se pide si hay
   verificación por email). No se pueden borrar y hay un máximo de 15.
5. **`.env`** (en la raíz del repositorio):

   ```
   PUBLIC_URL=https://api.midominio.com
   STOREFRONT_PUBLIC_URL=https://tienda.midominio.com
   MP_CLIENT_ID=...
   MP_CLIENT_SECRET=...
   MP_WEBHOOK_SECRET=...            # la clave secreta del paso 3
   MP_REDIRECT_URI=https://api.midominio.com/mercadopago/oauth/callback
   MP_TOKEN_ENCRYPTION_KEY=...      # openssl rand -base64 32
   MP_OAUTH_TEST_TOKEN=true         # el canje genera credenciales de sandbox
   ```

6. `docker compose up --build` y, en otra terminal, `docker compose run --rm seed-demo`.
7. **Dominio de la tienda en el canal**: como superadmin (`SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD`,
   en `https://api.midominio.com/dashboard`) abrir Ajustes › Canales › _Panadería Don Juan_ y completar
   **Storefront URL** con `https://tienda.midominio.com`. Es el único origen aceptado para las URLs de
   retorno de Mercado Pago.
8. **Vincular el vendedor de prueba 1**: entrar al dashboard como `dueno@panaderia-demo.test`
   (contraseña `DEMO_OWNER_PASSWORD`, por defecto `demo-password-123`), abrir Ajustes › Mercado Pago
   y pulsar **Conectar Mercado Pago**. Iniciar sesión con el vendedor de prueba 1 y autorizar. Tiene
   que volver al dashboard con "Tu cuenta de Mercado Pago quedó vinculada." y estado "Conectada".
9. Ver los registros mientras se prueba: `docker compose logs -f server worker`. Cada notificación
   aceptada deja una línea `Webhook received: topic=... id=... user_id=... signed=...` y el resultado
   (`Payment <id>: settled | pending | ...`).

**Cómo registrar la evidencia**: en cada punto, agregar abajo (sección "Evidencia") la fecha, qué se
hizo, qué se vio (líneas de log sin tokens, capturas) y la conclusión, y pasar el punto a Resuelto.

### V19: los tres identificadores de la cuenta son el mismo (correr primero)

El plugin liquida un pago solo si el `collector_id` de `GET /v1/payments/{id}` es la cuenta con cuyo
token se lo consultó (PRD 9.5, DEC-44). La documentación muestra el campo `collector_id` (número, en el
primer nivel de la respuesta) pero no dice que sea el mismo número que el `user_id` del OAuth. Hay que
comparar **tres** valores sobre **un mismo pago de prueba** de un vendedor vinculado por OAuth:

| Qué                          | De dónde sale                                                                                                                                                                                                                                                                                                   | Valor |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `user_id` del OAuth          | Dashboard › Ajustes › Mercado Pago: «Cuenta de Mercado Pago n.º ...» (es el `user_id` que devolvió `/oauth/token`), o `docker compose exec database psql -U tiendasaas -c 'select "mpUserId" from mercado_pago_account'`                                                                                        |       |
| `user_id` de la notificación | Línea `Webhook received: topic=payment id=<pago> user_id=<este>` del log (V1)                                                                                                                                                                                                                                   |       |
| `collector_id` del pago      | `docker compose exec database psql -U tiendasaas -c "select metadata from payment order by \"createdAt\" desc limit 1"`: campos `mpAccountUserId` y `mpCollectorId` (si el pago quedó en `needs_review`, la nota del pedido en el dashboard dice qué cuenta consultó y qué `collector_id` informó Mercado Pago) |       |

1. Con el vendedor de prueba 1 vinculado (paso 8 de la preparación), pagar en la tienda con el comprador
   de prueba (tarjeta `APRO`). Los pagos con credenciales de prueba no envían notificaciones: la
   pantalla de resultado usa el respaldo (`syncMercadoPagoPayment`), que aplica la misma regla.
2. Esperado: el pedido llega a `PaymentSettled`, `mpAccountUserId` y `mpCollectorId` son el mismo
   número y es el del dashboard. Anotar el nombre real del campo si fuera otro.
3. El valor de `user_id` de la notificación se anota con la compra de $1 de V1 (parte B).
4. **Si algún valor no coincide** (el pedido queda en `needs_review` con `collector_mismatch` o
   `collector_missing`, o los números son distintos): **detenerse y avisar antes de tocar la regla**.
   No hay variable para desactivarla a propósito; hay que rediseñarla con el dato real.

### V20: ¿una autorización nueva de la misma cuenta anula los tokens anteriores?

El diseño funciona en los dos casos (los tokens viven una sola vez en la cuenta y la autorización
nueva reemplaza los guardados, aunque la cuenta tenga un vínculo `retired` en un local y uno `active`
en otro), pero hay que saber cuál es el comportamiento real. Solo en sandbox: los pasos imprimen un
token en la terminal.

1. Con el vendedor de prueba vinculado, guardar su token actual:

   ```
   docker compose exec server node -e '
   const { Client } = require("pg");
   const { TokenCipher, accountAccessContext } = require("vendure-plugin-mercadopago");
   (async () => {
     const db = new Client({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
     await db.connect();
     const { rows } = await db.query(`select "mpUserId", "accessToken" from mercado_pago_account`);
     const cipher = new TokenCipher(process.env.MP_TOKEN_ENCRYPTION_KEY);
     for (const r of rows) console.log(r.mpUserId, cipher.decrypt(r.accessToken, accountAccessContext(r.mpUserId)));
     await db.end();
   })();'
   ```

   Anotar el token como **A**.

2. En el dashboard, **Vincular otra cuenta** y autorizar con **la misma** cuenta de prueba. Volver a
   imprimir el token: **B** (tiene que ser distinto de A).
3. Probar el viejo: `curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer <A>" https://api.mercadopago.com/users/me`.
   - `200`: la autorización nueva **no** anula la anterior.
   - `401`: la anula.
4. Anotar el resultado. En los dos casos la plataforma sigue funcionando: usa B.

### V24: qué devuelve Mercado Pago con un token revocado

La plataforma trata un **401** del token de acceso como una revocación sospechada y solo la confirma si
la renovación es rechazada (PRD 9.4, DEC-55). Hay que saber qué responde Mercado Pago de verdad. Se
corre junto con V20: mismas cuentas de prueba, mismos pasos de credenciales.

1. Con un vendedor de prueba vinculado, tomar de la base su `accessToken` y su `refreshToken` sin cifrar
   (V20, paso 1, explica cómo) y guardarlos aparte.
2. Revocar el acceso de la aplicación desde la cuenta de prueba (Mercado Pago › Tu perfil › Seguridad ›
   Aplicaciones conectadas), o desde otro entorno autorizando de nuevo la misma cuenta (V20).
3. Con el token de acceso revocado, anotar el **código HTTP y el cuerpo** de cada llamada:

   ```
   curl -i -H "Authorization: Bearer <access_token>" https://api.mercadopago.com/users/me
   curl -i -H "Authorization: Bearer <access_token>" https://api.mercadopago.com/v1/payments/<id>
   curl -i -H "Authorization: Bearer <access_token>" https://api.mercadopago.com/merchant_orders/<id>
   ```

4. Con el `refresh_token` revocado, anotar el código y el cuerpo de la renovación (`POST /oauth/token`,
   `grant_type=refresh_token`, con `client_id` y `client_secret` de la aplicación). Repetir con un
   `refresh_token` **ya usado** (el que se acaba de rotar): es el caso de dos procesos que renuevan a la vez.
5. Esperado: **401** con un cuerpo que dice que el token es inválido en las tres llamadas, e
   `invalid_grant` (400) en la renovación. La plataforma lo reconoce así: 401 en el token de acceso y
   `invalid_grant` o un rechazo de autenticación en la renovación; un 403 o un 404 no cuentan.
6. **Si algo es distinto** (por ejemplo, un 403 o un 400 con otro cuerpo para un token revocado), no cambies
   la regla: avisame con los códigos y los cuerpos, y decidimos qué respuestas cuentan.

### V21: Mercado Pago acepta y devuelve igual el `external_reference`

La preferencia envía `external_reference = <código del pedido>-<identificador>`: el código del pedido
(16 caracteres con el valor por defecto de Vendure), un guion y 22 caracteres en base64url (letras,
números, `-` y `_`), unos 39 caracteres en total. El pago se busca **entero** en el registro, así que
Mercado Pago tiene que devolverlo sin tocarlo.

1. Comprar en la tienda (V19, paso 1) y anotar la referencia que envió la plataforma: en la base,
   `docker compose exec database psql -U tiendasaas -c 'select "externalReference", "preferenceId" from mercado_pago_preference order by "createdAt" desc limit 1'`.
2. Comparar con el `external_reference` de la URL de vuelta (en la barra del navegador) y con el del
   pago (`GET /v1/payments/{id}`, con el token del vendedor de prueba como en V20).
3. Esperado: los tres son idénticos, mayúsculas y minúsculas incluidas, con el guion y el guion bajo.
4. Si Mercado Pago lo corta, lo pasa a minúsculas o cambia algún carácter, los pagos van a
   `needs_review` con `unknown_preference` y la nota del pedido muestra la referencia que llegó. En ese
   caso avisá: hay que acortar la referencia o cambiar su alfabeto.

### V22: cómo se obtiene el `preference_id` de un pago

La tercera condición del PRD 9.5 compara la preferencia del pago con la que emitió la plataforma. El
diseño la busca así: el pago trae `order.id` (de tipo `mercadopago`) y `GET /merchant_orders/{order.id}`
devuelve `preference_id`. La documentación de la orden comercial describe `preference_id` y el SDK
3.6.1 tiene ambos campos, pero falta ver que **siempre estén**.

1. Con una compra aprobada con tarjeta (V19): el pedido tiene que llegar a `PaymentSettled`. Si queda
   en `needs_review` y la nota dice "could not be obtained", el camino no funciona.
2. Mirar los datos crudos con el token del vendedor de prueba (V20, paso 1):

   ```
   curl -s -H "Authorization: Bearer <token>" https://api.mercadopago.com/v1/payments/<id>
   curl -s -H "Authorization: Bearer <token>" https://api.mercadopago.com/merchant_orders/<order.id>
   ```

   Anotar el campo `order` del pago, el campo `preference_id` de la orden y que coincida con el
   `preferenceId` de la tabla `mercado_pago_preference`.

3. Repetir con **un pago en efectivo** (Rapipago o Pago Fácil) que queda pendiente y se aprueba después, y
   con un reintento de pago del mismo pedido: en todos tiene que haber `order.id` y `preference_id`.
4. **Si en algún caso falta, no cambies la regla: avisame.** El plan B que evaluaríamos es una ventana
   con nuestro propio reloj: un vínculo `retired` acepta solo pagos cuya primera notificación llegue hasta
   30 días después de `retiredAt`.

### V23: Mercado Pago conserva `?ref=` de la `notification_url`

Solo hace falta con `MP_WEBHOOK_MODE=preference`. La `notification_url` de cada preferencia lleva
`?source_news=webhooks&ref=<identificador>` y la ruta resuelve la cuenta por ese `ref` (DEC-53).

1. Con `MP_WEBHOOK_MODE=preference`, comprar de $1 como en V1, parte B.
2. En el log, la línea de cada notificación termina en `ref=yes` si llegó el parámetro y `ref=no` si no.
3. Si dice `ref=no`: Mercado Pago no conserva la cadena de consulta. La plataforma usa entonces el `user_id`
   de la notificación; si tampoco viene, la notificación se ignora y el pedido solo se liquida por el
   respaldo de la pantalla de resultado. Anotarlo.

### V1: el webhook de la aplicación recibe los pagos de los locales

El diseño (PRD 9.7) supone que las notificaciones llegan a la URL de la aplicación y que traen el
`user_id` del vendedor. Los pagos hechos con credenciales de prueba **no envían notificaciones**
(PRD 12), así que hay dos partes:

- **A. La URL y la firma funcionan.** En Webhooks › **Simular**: URL de producción, evento
  **Pagos**, Data ID `123456789`, **Enviar prueba**. Esperado: la herramienta muestra respuesta
  `200` y en el log aparece `Webhook received: topic=payment id=123456789 user_id=... signed=yes`
  seguido de `Payment 123456789: ignored (...)` (el pago no existe, es lo correcto). Una respuesta
  `401` significa que `MP_WEBHOOK_SECRET` no es la clave de esa aplicación.
- **B. Los pagos reales de un local llegan.** Con una cuenta real propia como local (PRD 12):
  poner `MP_OAUTH_TEST_TOKEN=false`, reiniciar, desconectar el vendedor de prueba y vincular tu cuenta
  real. Con otra cuenta o tarjeta real, comprar algo de **$1** en la tienda. Esperado:
  `Webhook received: topic=payment ... user_id=<id de la cuenta vinculada>` y el pedido en
  `PaymentSettled` **sin** haber usado el respaldo (en el log no aparece `syncMercadoPagoPayment`).
- **Si no llega** (o llega sin el `user_id` del local): V1 falla. Plan B: `MP_WEBHOOK_MODE=preference`
  (cada preferencia lleva su `notification_url` con el canal en la ruta), reiniciar y repetir B.
  Anotar el resultado y seguir con V2.

### V2: ¿las notificaciones a `notification_url` vienen con `x-signature`?

Solo hace falta si V1 falló. Con `MP_WEBHOOK_MODE=preference` y
`MP_REQUIRE_SIGNATURE_IN_PREFERENCE_MODE=true` (por defecto), repetir la compra de $1.

- Si el pedido se liquida: las notificaciones vienen firmadas con la clave de la aplicación.
  Línea de log: `... signed=yes route=channel`.
- Si el log dice `Rejected webhook (MissingSignatureHeader)`: vienen sin firma. Poner
  `MP_REQUIRE_SIGNATURE_IN_PREFERENCE_MODE=false`, reiniciar y repetir: el pedido se liquida igual,
  porque la verdad es siempre la consulta del pago con el token del local. Dejarlo anotado: en ese
  modo cualquiera puede _provocar_ una consulta, pero no cambiar el resultado.

### V6: lista completa de estados de pago

La tabla de estados (`packages/vendure-plugin-mercadopago/src/lib/status.ts`) usa los nueve que
documenta Mercado Pago para pagos: `pending`, `approved`, `authorized`, `in_process`,
`in_mediation`, `rejected`, `cancelled`, `refunded`, `charged_back`. Cualquier otro valor queda como
`unknown` y **nunca** liquida un pedido (hay una prueba).

Para cerrar el punto, con el vendedor de prueba vinculado, pagar con tarjetas de prueba cambiando el
nombre del titular según la guía de tarjetas de prueba de Mercado Pago (`APRO` aprobado, `CONT`
pendiente, `OTHE` rechazo general; hay más: `CALL`, `FUND`, `SECU`, `EXPI`, `FORM`) y anotar el
`status` y el `status_detail` que figuran en el log (`Payment <id>: ...`) y en las notas del pedido
(dashboard › Pedidos). Si aparece un estado que no está en la lista, agregarlo a `status.ts` con su
prueba y anotarlo acá. Un reembolso parcial debería dejar `approved` con
`status_detail: partially_refunded`.

### V7: ¿una línea por producto o una sola línea con el total?

Por defecto la preferencia lleva una línea por producto más una de envío (`MP_PREFERENCE_ITEMS_MODE=lines`)
y cae sola a una línea con el total si las líneas no suman exactamente el total del pedido.

1. Comprar en la tienda 2 productos distintos, con un cupón de descuento (crear uno en el dashboard
   › Marketing) y envío a domicilio.
2. En la pantalla de Mercado Pago comprobar que los ítems y el **total** coinciden con el pedido.
3. Si Mercado Pago muestra otro total, redondea mal o rechaza la preferencia: poner
   `MP_PREFERENCE_ITEMS_MODE=total` (una sola línea con el total y el código del pedido), reiniciar y
   repetir.

Dejar anotado cuál modo queda como valor por defecto.

### V12: respuesta de la renovación del token

La guía de renovación solo documenta `access_token` y `refresh_token` (DEC-11). Con el local vinculado:

```
docker compose run --rm refresh-connections --all
```

Esperado: `{"refreshed":1,"failed":0}`, el dashboard (Ajustes › Mercado Pago) muestra una nueva fecha
de vigencia y el local sigue cobrando. Anotar si la respuesta traía `expires_in` (si no, el sistema
asume 180 días, la vigencia documentada) y que el `refresh_token` cambió: una segunda ejecución
tiene que seguir funcionando.

### V13: notificaciones `mp-connect`

Desde la cuenta del vendedor de prueba (Mercado Pago › Seguridad › aplicaciones conectadas), revocar
el acceso de la aplicación. Esperado: llega una notificación `mp-connect` (línea `Webhook received:
topic=mp-connect ...`), el log dice `mp-connect for seller <id>: disconnected`, el dashboard del local
pasa a "Desconectada", la tienda deja de ofrecer Mercado Pago y llegan los emails de aviso (en
desarrollo, en <http://localhost:3000/mailbox>). Anotar el cuerpo de la notificación (campos y
`action`): hoy el sistema no depende de él (DEC-16).

### V14: `expiration_date_from` en el pasado y clave de idempotencia

Cada preferencia usa una clave de idempotencia y `expiration_date_from/to` alineados a una ventana
de 5 minutos (DEC-19), así que `expiration_date_from` puede estar unos minutos en el pasado. Crear
un pago en la tienda y comprobar que la preferencia se crea (si Mercado Pago respondiera error, el
comprador vería "No pudimos completar la operación" y el log mostraría `Preference creation failed`).
Repetir el botón "Pagar" dentro de los 5 minutos: no debe dar error.

### V15: reembolso sin saldo

Vaciar el saldo de la cuenta vendedora de prueba (o usar una cuenta sin saldo) y reembolsar un pedido
desde el dashboard (Pedidos › pedido › Reembolsar). Esperado: el reembolso queda `Failed` con el
motivo de Mercado Pago en su metadata (DEC-17). Anotar el texto exacto del mensaje y cómo se ve en
el dashboard; si no se ve con claridad, hay que mostrarlo mejor.

### V16: parámetros de la redirección y demora de `auto_return`

Anotar qué parámetros trae realmente la URL de vuelta (`payment_id` o `collection_id`,
`external_reference`, `status`, `merchant_order_id`) y cuánto tarda el regreso automático. La tienda
de referencia no depende de ellos para confirmar nada (solo toma `payment_id`/`collection_id` y
`external_reference` como punteros), así que alcanza con registrar los nombres.

### V17: el `scope` del OAuth incluye `offline_access`

Al vincular, el servidor rechaza una autorización sin `offline_access` (la conexión no se podría
renovar). Si Mercado Pago no devuelve `scope` en la respuesta aunque el permiso esté otorgado, la
vinculación se rechazará con "no incluyó acceso sin conexión": en ese caso poner
`MP_REQUIRE_OFFLINE_ACCESS=false` y anotarlo (el diseño de renovación sigue necesitando el permiso).

### V18: unidad de `ts` en `x-signature`

La documentación dice milisegundos y su ejemplo y el SDK usan segundos (DEC-9). El sistema acepta
las dos. Anotar con cuál llega en la práctica (`ts=` con 10 dígitos: segundos; 13: milisegundos).

### Lista de control antes del primer cliente

Pruebas de punta a punta con montos bajos en producción, con una cuenta real propia como local
(PRD 12): pago aprobado, rechazado, pendiente (efectivo) que se aprueba después, reembolso total y
parcial, desvinculación y nueva vinculación, y un pago con el webhook apagado (debe liquidarse con
el respaldo de la pantalla de resultado). Con dos cuentas de prueba: cambiar un local de cuenta (el
reembolso de una venta de la cuenta anterior tiene que seguir funcionando) y traspasar una cuenta de
un local a otro (cada venta se asigna a su local), y `docker compose run --rm release-links --dry-run`
para ver qué vínculos se liberarían.

---

## Evidencia

### V3: `WebhookSignatureValidator` e `InvalidWebhookSignatureError` (resuelto, 2026-10-18)

- `npm view mercadopago version` devuelve 3.6.1. Con `require('mercadopago')` en Node 24.18 las exportaciones incluyen `WebhookSignatureValidator`, `InvalidWebhookSignatureError` y `SignatureFailureReason`.
- El validador calcula HMAC-SHA256 en hexadecimal y compara en tiempo constante. Diferencias con la documentación, manejadas en `packages/vendure-plugin-mercadopago/src/lib/signature.ts` y fijadas con pruebas: no pasa `data.id` a minúsculas y trata `ts` como segundos (ver DEC-9).
- Pruebas: `packages/vendure-plugin-mercadopago/src/lib/signature.spec.ts` firma las notificaciones con una implementación independiente del algoritmo documentado.

### V4: compra como invitado con un email que ya tiene cuenta (resuelto, 2026-10-18)

- Comportamiento por defecto de Vendure 3.8, sin cambios: `setCustomerForOrder` responde `EMAIL_ADDRESS_CONFLICT_ERROR` cuando el email pertenece a una cuenta registrada y quien compra no inició sesión. `commerce-core` lo expone como `CommerceError` con ese `code` y la tienda debe pedir iniciar sesión.
- Se mantiene el valor por defecto (`allowGuestCheckoutForRegisteredCustomers: false`) a propósito: permitir lo contrario deja que cualquiera cargue pedidos en la cuenta de otra persona con solo saber su email. Si el responsable prefiere lo contrario, el ajuste es la `GuestCheckoutStrategy` (plan B del PRD).
- Prueba: `packages/commerce-core/e2e/purchase.e2e-spec.ts`, "V4: a registered email cannot be used for a guest checkout".

### V5: el mismo email como invitado en dos tiendas (resuelto, 2026-10-18)

- Resultado observado: **un solo registro de Customer**, asignado a los dos canales. Las consultas `customers` filtradas por ese email devuelven el mismo `id` en la tienda A, en la tienda B y en el canal por defecto.
- Consecuencia para producto: ambos locales ven el mismo cliente (nombre y email); los pedidos siguen separados por canal. Cualquier dato guardado en el Customer (por ejemplo direcciones de una cuenta registrada) es visible para todos los locales donde el comprador interactuó. Hay que reflejarlo en la política de privacidad (PRD 6.3) y no guardar en el Customer datos que no deban compartirse.
- Prueba: `packages/commerce-core/e2e/purchase.e2e-spec.ts`, "V5: the same email as guest in two stores is ONE Customer record".

### V8: el calculator por defecto de Vendure es tarifa fija exacta (resuelto, 2026-10-18)

- Configuración usada por el alta de un local: `default-shipping-calculator` con `rate = <tarifa en centavos>`, `includesTax = include`, `taxRate = 0`.
- Prueba: `apps/server/e2e/provisioning.e2e-spec.ts`, "the flat fee does not depend on the order (V8)". Con una tarifa de 123456 centavos, `eligibleShippingMethods` devuelve `price = 123456` y `priceWithTax = 123456` para carritos de 1, 3 y 7 unidades.
- En `packages/vendure-plugin-mercadopago/e2e/checkout.e2e-spec.ts` el envío entra como línea de la preferencia y las líneas suman exactamente el total del pedido.

### V9: `EmailPlugin` con remitente y plantilla por canal (resuelto, 2026-10-18)

- Remitente por canal: sí, con `globalTemplateVars` como función (recibe el contexto con el canal) y los manejadores usando `{{ fromAddress }}` (local) o `{{ platformFromAddress }}` (plataforma). Plantilla por canal: sí, con un `TemplateLoader` propio que recibe el contexto (`ChannelTemplateLoader`). La documentación no lo decía; el comportamiento está probado.
- Pruebas: `apps/server/e2e/emails.e2e-spec.ts`. Dos locales compran con el mismo servidor: los emails de pedido salen con `"Panadería Don Juan" <no-reply@plataforma.test>` y `"Librería Luna" <...>`; el local con carpeta propia usa su plantilla y el otro la de la plataforma; los emails de cuenta salen a nombre de la plataforma con el enlace de verificación a la tienda de origen (o a la plataforma si el local aún no tiene dominio).
- Los avisos de atención (PRD 9.4 y 9.8) llegan a los administradores del canal y, en problemas de conexión, también al superadmin.

### V10: servidor con `strict`, `UuidIdStrategy`, SDK 3.x y dashboard (resuelto, 2026-10-18)

- Servidor con `strict: true`, `UuidIdStrategy` y PostgreSQL 17: arranca, migra y autentica al superadmin (DEC-8).
- El SDK `mercadopago` 3.6.1 se carga desde CommonJS (`require`) sin problemas. El cliente `OAuth` del SDK no cubre PKCE ni `test_token`; se usa `fetch` (DEC-10).
- El dashboard (React, Vendure 3.8) compila con la extensión del plugin, los campos propios del `Seller` y del `Channel`, y `UuidIdStrategy`.
- Prueba: `apps/storefront-reference/e2e/dashboard.spec.ts` (Playwright, navegador real). El dueño de un local inicia sesión, `me { channels }` devuelve solo su canal, abre productos, pedidos, métodos de envío y la página "Mercado Pago" sin respuestas 4xx de la Admin API, y el botón de vinculación lleva a `auth.mercadopago.com/authorization` con `code_challenge_method=S256` y sin el `client_secret`.
- Sin excepciones a `strict` en ningún paquete.

### V11: el envío deja de ser elegible antes de pagar (resuelto, 2026-10-18)

- El PRD 9.6 pedía verificar qué error devuelve la API. Resultado: **ninguno**. Vendure 3.8 reemplaza el método de envío que dejó de calificar por el primero que sí califica **en el momento en que cambia el pedido** (por ejemplo, al bajar la cantidad por debajo del mínimo del envío a domicilio queda "Retiro en el local", sin costo de envío), y el pase a `ArrangingPayment` funciona sin error.
- Riesgo: con dos pestañas abiertas, el comprador podría pagar un total distinto del que revisó. Mitigación: `commerce-core` ofrece `startPayment(urls, { expectedTotal })`, que falla con `ORDER_CHANGED` y no crea nada si el pedido ya no suma lo que se mostró; la tienda de referencia lo usa y lo explica al comprador.
- Pruebas: `apps/server/e2e/provisioning.e2e-spec.ts` ("is swapped for one that qualifies, with no error (V11)"), `packages/commerce-core/tests/checkout.test.ts` (`ORDER_CHANGED`) y `apps/storefront-reference/e2e/purchase.spec.ts` ("refuses to charge an order that changed after the buyer reviewed it").

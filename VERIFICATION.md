# Verificación de los puntos [Verificar] (PRD sección 13)

Estado inicial: ningún punto está resuelto. Cada punto pasa a "Resuelto" solo con evidencia escrita acá.

| #   | Punto                                                           | Estado                    | Quién lo resuelve             |
| --- | --------------------------------------------------------------- | ------------------------- | ----------------------------- |
| V1  | Webhook a nivel aplicación recibe pagos de locales vía OAuth    | Pendiente (sandbox)       | Responsable, con credenciales |
| V2  | Firma `x-signature` en notificaciones a `notification_url`      | Pendiente (sandbox)       | Responsable, con credenciales |
| V3  | `WebhookSignatureValidator` en `mercadopago` 3.x                | **Resuelto** (ver abajo)  | Implementación                |
| V4  | Compra como invitado con email ya registrado                    | **Resuelto** (ver abajo)  | Implementación / sandbox      |
| V5  | Mismo email como invitado en dos tiendas                        | **Resuelto** (ver abajo)  | Implementación                |
| V6  | Lista completa de estados de pago                               | Pendiente (documentación) | Implementación                |
| V7  | Una línea por producto vs. una sola línea con el total          | Pendiente (sandbox)       | Responsable                   |
| V8  | Calculator por defecto = tarifa fija exacta                     | **Resuelto** (ver abajo)  | Implementación                |
| V9  | `EmailPlugin`: remitente y plantilla por canal                  | Pendiente                 | Implementación                |
| V10 | SDK 3.x en servidor, OAuth con SDK, `UuidIdStrategy` + `strict` | **Resuelto** (ver abajo)  | Implementación                |

Los detalles y los pasos de prueba se completan a medida que se implementa cada parte.

## Evidencia

### V3: `WebhookSignatureValidator` e `InvalidWebhookSignatureError` (resuelto, 2026-10-18)

- `npm view mercadopago version` devuelve 3.6.1. Con `require('mercadopago')` en Node 24.18 las exportaciones incluyen `WebhookSignatureValidator`, `InvalidWebhookSignatureError` y `SignatureFailureReason`.
- El validador calcula HMAC-SHA256 en hexadecimal y compara en tiempo constante. Diferencias con la documentación, manejadas en `packages/vendure-plugin-mercadopago/src/lib/signature.ts` y fijadas con pruebas: no pasa `data.id` a minúsculas y trata `ts` como segundos (ver DEC-9).
- Pruebas: `packages/vendure-plugin-mercadopago/src/lib/signature.spec.ts` firma las notificaciones con una implementación independiente del algoritmo documentado.

### V10 (parcial)

- Servidor con `strict: true`, `UuidIdStrategy` y PostgreSQL 17: arranca, migra y autentica al superadmin (ver DEC-8).
- El SDK `mercadopago` 3.6.1 se carga desde CommonJS (`require`) sin problemas.
- OAuth: el cliente del SDK no cubre PKCE ni `test_token`; se usa `fetch` (DEC-10).
- Falta: compatibilidad del dashboard con los campos propios del plugin (T3/T4).

### V8: el calculator por defecto de Vendure es tarifa fija exacta (resuelto, 2026-10-18)

- Configuración usada por el alta de un local: `default-shipping-calculator` con `rate = <tarifa en centavos>`, `includesTax = include`, `taxRate = 0`.
- Prueba: `apps/server/e2e/provisioning.e2e-spec.ts`, "the flat fee does not depend on the order (V8)". Con una tarifa de 123456 centavos, `eligibleShippingMethods` devuelve `price = 123456` y `priceWithTax = 123456` para carritos de 1, 3 y 7 unidades.
- En `packages/vendure-plugin-mercadopago/e2e/checkout.e2e-spec.ts` el envío entra como línea de la preferencia y las líneas suman exactamente el total del pedido.

### V4: compra como invitado con un email que ya tiene cuenta (resuelto, 2026-10-18)

- Comportamiento por defecto de Vendure 3.8, sin cambios: `setCustomerForOrder` responde `EMAIL_ADDRESS_CONFLICT_ERROR` cuando el email pertenece a una cuenta registrada y quien compra no inició sesión. `commerce-core` lo expone como `CommerceError` con ese `code` y la tienda debe pedir iniciar sesión.
- Se mantiene el valor por defecto (`allowGuestCheckoutForRegisteredCustomers: false`) a propósito: permitir lo contrario deja que cualquiera cargue pedidos en la cuenta de otra persona con solo saber su email. Si el responsable prefiere lo contrario, el ajuste es la `GuestCheckoutStrategy` (plan B del PRD).
- Prueba: `packages/commerce-core/e2e/purchase.e2e-spec.ts`, "V4: a registered email cannot be used for a guest checkout".

### V5: el mismo email como invitado en dos tiendas (resuelto, 2026-10-18)

- Resultado observado: **un solo registro de Customer**, asignado a los dos canales. Las consultas `customers` filtradas por ese email devuelven el mismo `id` en la tienda A, en la tienda B y en el canal por defecto.
- Consecuencia para producto: ambos locales ven el mismo cliente (nombre y email); los pedidos siguen separados por canal. Cualquier dato guardado en el Customer (por ejemplo direcciones de una cuenta registrada) es visible para todos los locales donde el comprador interactuó. Hay que reflejarlo en la política de privacidad (PRD 6.3) y no guardar en el Customer datos que no deban compartirse.
- Prueba: `packages/commerce-core/e2e/purchase.e2e-spec.ts`, "V5: the same email as guest in two stores is ONE Customer record".

### V10: dashboard con los campos propios del plugin y `strict` (resuelto, 2026-10-18)

- El dashboard (React, Vendure 3.8) compila con la extensión del plugin, los campos propios del `Seller` y del `Channel`, y `UuidIdStrategy`.
- Prueba: `apps/storefront-reference/e2e/dashboard.spec.ts` (Playwright, navegador real). El dueño de un local inicia sesión, `me { channels }` devuelve solo su canal, abre productos, pedidos, métodos de envío y la página "Mercado Pago" sin respuestas 4xx de la Admin API, y el botón de vinculación lleva a `auth.mercadopago.com/authorization` con `code_challenge_method=S256` y sin el `client_secret`.
- Resumen de V10: servidor con `strict` y `UuidIdStrategy` (DEC-8), SDK `mercadopago` 3.6.1 desde CommonJS, OAuth por `fetch` porque el SDK no cubre PKCE (DEC-10), dashboard compatible (esta sección). Sin excepciones a `strict` en ningún paquete.

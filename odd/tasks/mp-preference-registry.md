# mp-preference-registry

Objective: (A) a confirmed revocation retires the account's links; (B) a payment settles an order only if it belongs to a preference the platform issued for that order (registry of issued preferences), closing the transfer attack of DEC-51 risk 1.
Branch: feat/mp-preference-registry (stacked on feat/mp-account-links, PR #1 still open) · Delivery: ask-on-risk, small work-unit commits, push/PR/merge are the user's call · Runner: Vitest (SQL.js suites + PostgreSQL suites with `TEST_DB_PASSWORD`; throwaway container `tiendasaas-test-pg` on port 5433, user `postgres`, password `ci-password`) + Playwright.

## Specs

### Part A: DEC-42

- A1: "Cuando una revocación se **confirma** con la verificación de DEC-16 (`GET /users/me` y renovación, nunca por el cuerpo de `mp-connect`), la cuenta pasa a `disconnected` y además **todos sus vínculos `active` pasan a `retired`** (`retiredAt` = ahora). Aplicalo en cualquier camino donde una cuenta pase a `disconnected` por revocación confirmada."
- A2: "El local conserva todo lo que da un vínculo `retired`: notificaciones, pagos pendientes y reembolsos de sus ventas (estos últimos solo si la cuenta vuelve a tener tokens, como ya dice DEC-46). Si el titular vuelve a autorizar la cuenta en ese mismo local, el vínculo se reactiva, según la tabla de 9.2. Si mientras tanto otro local la tomó, se rechaza como cualquier cuenta `active` en otro local."
- A3: "Una renovación fallida (`token_renewal_failed`, estado `expiring`) **no** es una revocación: el vínculo sigue `active` y la cuenta sigue bloqueada para otros locales."
- A4: "El aviso `account_disconnected` tiene que decir que la cuenta quedó retirada del local y que hay que vincular una cuenta para volver a cobrar."
- A5 (tests): una revocación confirmada retira el vínculo y deja que otro local vincule la cuenta; una renovación fallida no retira nada; volver a autorizar la cuenta en el local original reactiva su vínculo; si otro local la tomó antes, volver a autorizarla en el local original se rechaza sin cambios; un pago pendiente de la cuenta revocada que se aprueba después se procesa como en cualquier vínculo `retired` (si se puede verificar, y si no, con el aviso `unverifiable_payment`).
- A6 (docs): actualizar DEC-42, el PRD (9.2: la frase "Una cuenta revocada (`disconnected`) que sigue `active`…" y la fila 15 de 18.2; 9.4: revocación) y el README.

### Part B: registry of issued preferences (replaces bounding by date)

- B1 (rule): "un pago solo puede liquidar un pedido si pertenece a una preferencia que **emitió la plataforma** para ese pedido."
- B2 (entity): "Nueva entidad con cada preferencia emitida: pedido, canal, cuenta, vínculo, total, el `preference_id` que devuelve Mercado Pago, un identificador aleatorio de al menos 128 bits codificado de forma compacta (por ejemplo base64url) y la fecha. Con migración."
- B3 (format): "`external_reference` de la preferencia: `<código del pedido>-<identificador>`. Este formato reemplaza al actual (el código del pedido solo)."
- B4 (validation, webhook both modes, `syncMercadoPagoPayment` and `createPayment`, links in ANY state): the payment settles only if (1) "Su `external_reference` coincide con una preferencia emitida para ese pedido."; (2) "La cuenta de esa preferencia es la que cobró el pago (`collector_id`, con la regla de DEC-44)."; (3) "El pago pertenece **a esa misma preferencia**: obtené la preferencia del pago desde Mercado Pago, por ejemplo con su orden (`GET /merchant_orders/{id}` y su `preference_id`), y comparala con el `preference_id` guardado. Nunca la tomes de la redirección."
- B5 (failure): "no se liquida: va a `needs_review` con el motivo `unknown_preference` o `preference_mismatch`, el pedido recibe una nota y se avisa al local y a la plataforma. Como en DEC-44, la regla frena solo la liquidación: los pagos pendientes, rechazados, devueltos o contracargados se siguen registrando y avisando como hoy." Also when "no se puede obtener la preferencia del pago".
- B6 (order and account from the registry): "El pedido se resuelve desde el registro y no parseando el `external_reference`. La cuenta con la que se consulta el pago también: en `syncMercadoPagoPayment` y en el modo `preference` ya no se prueban cuentas candidatas una por una. Con eso quedan resueltos los riesgos 2 y 6 de DEC-51: actualizalos."
- B7 (sync mutation): "`syncMercadoPagoPayment` pasa a recibir `paymentId` y el `externalReference` completo, y resuelve el pedido con el registro. Devuelve lo mismo que hoy (`outcome`, `orderCode`, `orderState`). `commerce-core` (`waitForPayment`) y la pantalla de resultado de la tienda de referencia pasan el `external_reference` tal cual llega en la redirección. Nunca derivan nada de su texto. Si la redirección no trae `external_reference` (V16), la pantalla usa el pedido activo de la sesión si lo hay. Si no, muestra "procesando" y queda esperando el webhook."
- B8: "Sin compatibilidad con el formato viejo. No hay datos productivos, así que no hace falta: un pago con el `external_reference` viejo va a `needs_review` con `unknown_preference`."
- B9 (tests): un pago sin preferencia emitida no liquida; con una preferencia emitida para otro pedido no liquida; con una preferencia emitida pero cobrado en otra cuenta no liquida; con el `external_reference` copiado de una preferencia emitida pero con otro `preference_id` no liquida (el caso del traspaso: con un vínculo `retired` y con uno `released` con tokens); si no se puede obtener la preferencia del pago, no liquida; el caso normal liquida, incluido un pago pendiente de un vínculo `retired` que se aprueba después; un contracargo de un pago que no pasa la regla se sigue registrando y avisando; `syncMercadoPagoPayment` con un `externalReference` inexistente no consulta a Mercado Pago y devuelve `unknown`; los E2E de la tienda siguen pasando con el formato nuevo.
- B10 (`VERIFICATION.md`): dos puntos de sandbox: "Que Mercado Pago acepte ese formato y largo de `external_reference` y lo devuelva igual en el pago y en la redirección." y "Cómo se obtiene el `preference_id` de un pago: qué campo, por qué camino y si está siempre presente, también en pagos en efectivo." Si el segundo falla: "no cambies la regla: avisame" (plan B to evaluate: a window with our own clock, a retired link accepts only payments whose first notification arrives within 30 days after `retiredAt`).
- B11 (docs): DEC-51 (risks 1, 2 and 6 resolved), a new entry in DECISIONS.md, PRD 9.5, 9.6 (including the line "`external_reference`: el `code` del pedido de Vendure"), 9.7, 10.2, section 13 and 18.2.

### Rules

- S1: "Se mantienen las reglas no negociables de la sección 11 del PRD." "No cambies nada fuera de este alcance." "Detenete y preguntame si la documentación contradice este diseño o si aparece una decisión de producto que no esté cubierta acá." "Al terminar: `npm run verify` en verde, la suite de PostgreSQL corrida y un resumen de lo que cambió y de lo que quedó pendiente de sandbox."

## Tasks

- [x] T1 (A1-A6) Confirmed revocation retires the account's active links; attention text; tests; DEC-42/PRD/README · inline · 733a9b0
- [x] T2 (B2, B3, B6 partly) Registry entity + migration + service; checkout issues the preference with `<code>-<id>` and puts the registry token in the preference-mode `notification_url`; mock and test helpers · inline · 2fa9017
- [x] T3 (B1, B4, B5, B6, B8) Validation in processor, handler/`verifyApproved`, `cancelPending`; merchant order lookup; new review reasons and attention texts; preference-mode route reads the ref · inline · 98151a7, 1e53d2c
- [x] T4 (B7) `syncMercadoPagoPayment(paymentId, externalReference)`; commerce-core `waitForPayment`; storefront result page and status route; Shop schema snapshot and codegen · inline · 13b6d86
- [x] T5 (A5, B9) Adapt every existing test to the new format; add the new tests · inline · 98151a7, 1e53d2c, 13b6d86
- [x] T6 (A6, B10, B11) Docs: DECISIONS, PRD, README, VERIFICATION · inline · docs commit (this one)
- [ ] T7 (S1) `npm run verify` with PostgreSQL, independent verifier, native review where due · inline · —

## Log

- L1 (user, verbatim summary): "DEC-42: una revocación confirmada retira los vínculos de la cuenta" (Cambia la decisión actual.) and "DEC-51, riesgo 1: registro de preferencias emitidas — Reemplaza la idea de acotar por fecha." The specs above quote both sections.
- L2 (analysis, docs): the SDK 3.6.1 types carry `payment.order` and `merchantOrder.preference_id`, and the merchant order reference documents `preference_id`; nothing contradicts the design. Whether Mercado Pago always returns the order of a payment (cash payments included) and accepts the new `external_reference` is B10 (sandbox).
- L3 (design, preference mode): the notification of a preference carries no payment data, and reading a payment needs a token. To avoid probing candidate accounts (B6), the registry token goes in the preference's `notification_url` (`...?ref=<token>`) and the route resolves the account from it; if `ref` is missing the notification's `user_id` is used, and with neither it is ignored and logged. Whether Mercado Pago keeps that query string is added to the sandbox points.
- L4 (design, identifier): the identifier is random (16 bytes, base64url) and stored with the idempotency key of the preference request, so repeating "Pagar" inside the 5-minute window reuses the same identifier and Mercado Pago's idempotency still returns the same preference (DEC-19 intact).
- L5 (2026-10-19) T1-T6 done and `npm run verify` green before the docs (plugin 284, commerce-core 75, server 48, Playwright 24). Docs: DEC-42 updated, DEC-51 rewritten, DEC-52 and DEC-53 added, PRD v1.4, V21-V23, README. Next: final verify with PostgreSQL, independent verifier, native review where due.

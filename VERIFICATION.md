# Verificación de los puntos [Verificar] (PRD sección 13)

Estado inicial: ningún punto está resuelto. Cada punto pasa a "Resuelto" solo con evidencia escrita acá.

| #   | Punto                                                           | Estado                    | Quién lo resuelve             |
| --- | --------------------------------------------------------------- | ------------------------- | ----------------------------- |
| V1  | Webhook a nivel aplicación recibe pagos de locales vía OAuth    | Pendiente (sandbox)       | Responsable, con credenciales |
| V2  | Firma `x-signature` en notificaciones a `notification_url`      | Pendiente (sandbox)       | Responsable, con credenciales |
| V3  | `WebhookSignatureValidator` en `mercadopago` 3.x                | **Resuelto** (ver abajo)  | Implementación                |
| V4  | Compra como invitado con email ya registrado                    | Pendiente                 | Implementación / sandbox      |
| V5  | Mismo email como invitado en dos tiendas                        | Pendiente                 | Implementación                |
| V6  | Lista completa de estados de pago                               | Pendiente (documentación) | Implementación                |
| V7  | Una línea por producto vs. una sola línea con el total          | Pendiente (sandbox)       | Responsable                   |
| V8  | Calculator por defecto = tarifa fija exacta                     | Pendiente                 | Implementación                |
| V9  | `EmailPlugin`: remitente y plantilla por canal                  | Pendiente                 | Implementación                |
| V10 | SDK 3.x en servidor, OAuth con SDK, `UuidIdStrategy` + `strict` | Pendiente                 | Implementación                |

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

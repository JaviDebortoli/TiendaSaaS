# Verificación de los puntos [Verificar] (PRD sección 13)

Estado inicial: ningún punto está resuelto. Cada punto pasa a "Resuelto" solo con evidencia escrita acá.

| #   | Punto                                                           | Estado                    | Quién lo resuelve             |
| --- | --------------------------------------------------------------- | ------------------------- | ----------------------------- |
| V1  | Webhook a nivel aplicación recibe pagos de locales vía OAuth    | Pendiente (sandbox)       | Responsable, con credenciales |
| V2  | Firma `x-signature` en notificaciones a `notification_url`      | Pendiente (sandbox)       | Responsable, con credenciales |
| V3  | `WebhookSignatureValidator` en `mercadopago` 3.x                | Pendiente                 | Implementación                |
| V4  | Compra como invitado con email ya registrado                    | Pendiente                 | Implementación / sandbox      |
| V5  | Mismo email como invitado en dos tiendas                        | Pendiente                 | Implementación                |
| V6  | Lista completa de estados de pago                               | Pendiente (documentación) | Implementación                |
| V7  | Una línea por producto vs. una sola línea con el total          | Pendiente (sandbox)       | Responsable                   |
| V8  | Calculator por defecto = tarifa fija exacta                     | Pendiente                 | Implementación                |
| V9  | `EmailPlugin`: remitente y plantilla por canal                  | Pendiente                 | Implementación                |
| V10 | SDK 3.x en servidor, OAuth con SDK, `UuidIdStrategy` + `strict` | Pendiente                 | Implementación                |

Los detalles y los pasos de prueba se completan a medida que se implementa cada parte.

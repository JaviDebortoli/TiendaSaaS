# Plan de desarrollo

Fuente de verdad: `PRD.md`. Este plan se actualiza con el estado real a medida que avanza el trabajo.
Convención de estado: `[ ]` pendiente · `[~]` en curso · `[x]` hecho y verificado · `[!]` bloqueado (ver nota).

Documentos de apoyo: `DECISIONS.md` (desvíos y decisiones), `VERIFICATION.md` (puntos [Verificar] del PRD, sección 13).

## Tareas

| ID  | Tarea                                                                                                                                                                   | Depende de            | PRD           | Estado |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------- | ------ |
| T0  | Fundaciones del monorepo: workspaces, `tsconfig.base.json`, ESLint, Prettier, `.gitignore`, `.env.example`, esqueletos de `DECISIONS.md` y `VERIFICATION.md`            | —                     | 16.1–16.3     | [x]    |
| T1  | Servidor Vendure (`apps/server`): configuración, PostgreSQL, `UuidIdStrategy`, server y worker como procesos separados, cola, scheduler, S3, email, harden, migraciones | T0                    | 4, 16.4       | [x]    |
| T2  | Módulos puros del plugin (`packages/vendure-plugin-mercadopago`): cifrado AES-256-GCM, conversión de montos, validación de firma, tabla de estados, PKCE                | T0                    | 9.2, 9.7, 9.8 | [x]    |
| T3  | Plugin: entidades (conexión, estado OAuth), vinculación OAuth, renovación programada, tópico `mp-connect`                                                               | T1, T2                | 9.2–9.4       | [ ]    |
| T4  | Plugin: handler `mercado-pago`, `createMercadoPagoCheckout`, `syncMercadoPagoPayment`, webhook + cola, reembolsos y cancelaciones                                       | T3                    | 9.5–9.9       | [ ]    |
| T5  | Pruebas de integración del flujo de pago con `@vendure/testing` y `msw` (casos de la sección 12)                                                                        | T4                    | 12, 16.7      | [ ]    |
| T6  | Alta de un local (mutación/script), envíos (retiro y tarifa fija), administradores acotados al canal                                                                    | T1                    | 5.4, 8        | [ ]    |
| T7  | `commerce-core`: codegen, cliente, catálogo, carrito, checkout, cuenta, pruebas                                                                                         | T4 (esquema Shop API) | 10.2, 16.6    | [ ]    |
| T8  | Tienda de referencia Next.js + pruebas Playwright                                                                                                                       | T7                    | 16.6          | [ ]    |
| T9  | Docker: Dockerfile del servidor, `docker-compose.yml` (db, server, worker, MinIO, storefront), modo desarrollo y modo completo                                          | T1, T8                | 16.8          | [ ]    |
| T10 | CI, `README.md`, documentación de despliegue, `VERIFICATION.md` completo                                                                                                | todas                 | 16.7, 16.8    | [ ]    |

## Orden de ejecución

1. T0 → T1 y T2 (independientes entre sí).
2. T3 → T4 → T5 (camino crítico del pago).
3. T6 en paralelo lógico con T3–T5 (solo depende del servidor).
4. T7 cuando el esquema de la Shop API (incluidas las mutaciones del plugin) esté estable → T8.
5. T9 y T10 al cierre; el Compose se va probando desde T1 con la infraestructura (base y MinIO).

## Reglas no negociables (se verifican en pruebas)

- La notificación de Mercado Pago nunca es la fuente de verdad: siempre se consulta el pago con el token del local.
- El frontend nunca da un pago por confirmado con los parámetros de la redirección.
- Ningún frontend usa el canal por defecto ni la Admin API.
- Los tokens de Mercado Pago se cifran en reposo y nunca llegan al frontend.
- El procesamiento de webhooks es idempotente.
- `commerce-core` no depende del SDK de Mercado Pago ni de ningún secreto.

## Bloqueos y pendientes de decisión del responsable

| Tema                                                                               | Estado                                                                          |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Credenciales reales de Mercado Pago (aplicación, cuentas de prueba, dominio/túnel) | Pendiente: se necesitan para V1, V2 y la compra de punta a punta contra sandbox |
| Hosting, proveedor S3, SMTP, dominios, titularidad de la aplicación de MP (16.9)   | Todo configurable por variables de entorno; no se elige proveedor               |

## Registro de avance

_Se completa a medida que se cierran tareas (con el commit que contiene cada una)._

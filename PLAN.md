# Plan de desarrollo

Fuente de verdad: `docs/PRD.md`. Estado real al 2026-10-18. Convención: `[x]` hecho y verificado ·
`[~]` hecho, falta una verificación que depende de terceros · `[ ]` pendiente · `[!]` bloqueado.

Documentos de apoyo: `DECISIONS.md` (desvíos y decisiones), `VERIFICATION.md` (puntos [Verificar] del
PRD y pasos de sandbox), `README.md` y `docs/DEPLOYMENT.md`.

## Tareas

| ID  | Tarea                                                                                          | Depende de | PRD           | Estado | Commit                |
| --- | ---------------------------------------------------------------------------------------------- | ---------- | ------------- | ------ | --------------------- |
| T0  | Fundaciones del monorepo (workspaces, TypeScript 5.8, ESLint, Prettier, `.env.example`)        | —          | 16.1–16.3     | [x]    | `545707f`             |
| T1  | Servidor Vendure: PostgreSQL 17, `UuidIdStrategy`, server y worker separados, cola, S3, harden | T0         | 4, 16.4       | [x]    | `6612c55`             |
| T2  | Módulos puros del plugin: cifrado, montos, firma, estados, PKCE                                | T0         | 9.2, 9.7, 9.8 | [x]    | `de3761c`             |
| T3  | Plugin: conexión cifrada, OAuth con PKCE, renovación, `mp-connect`, página del dashboard       | T1, T2     | 9.2–9.4       | [x]    | `98bc5ed`, `2f9f893`  |
| T4  | Plugin: handler, `createMercadoPagoCheckout`, `syncMercadoPagoPayment`, webhook, reembolsos    | T3         | 9.5–9.9       | [x]    | `892a793`             |
| T5  | Pruebas de integración del flujo de pago (sección 12 completa, con concurrencia en PostgreSQL) | T4         | 12, 16.7      | [x]    | `892a793`             |
| T6  | Alta de un local (servicio, mutación y scripts), envíos, administradores acotados al canal     | T1         | 5.4, 8        | [x]    | `550f83e`             |
| T7  | `commerce-core` con tipos generados y pruebas                                                  | T4         | 10.2, 16.6    | [x]    | `bd38800`             |
| T8  | Tienda de referencia Next.js + Playwright                                                      | T7         | 16.6          | [x]    | `a3f8c21`             |
| T9  | Docker: imágenes, Compose completo y modo desarrollo                                           | T1, T8     | 16.8          | [x]    | `7af4a02`             |
| T10 | CI, README, despliegue y `VERIFICATION.md` con los pasos de sandbox                            | todas      | 16.7, 16.8    | [x]    | `f4885e8`             |
| T11 | Verificación con Mercado Pago real (V1, V2, V6, V7, V12–V18)                                   | T10        | 13            | [!]    | requiere credenciales |

Los emails por local con avisos de atención (V9) están en `026677b`.

## Criterios de "terminado" del encargo

| Criterio                                                                                             | Estado | Evidencia                                                                                                  |
| ---------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| `docker compose up` levanta servidor, worker, base, almacenamiento de imágenes y tienda              | [x]    | Probado desde volúmenes limpios: los cinco servicios sanos (DEC-37)                                        |
| El script de alta crea dos locales de prueba con administradores y métodos de envío                  | [x]    | `seed-demo` en contenedor; `provisioning.e2e-spec.ts`                                                      |
| Cada administrador ve solo su canal en el dashboard                                                  | [x]    | `provisioning.e2e-spec.ts` y `dashboard.spec.ts`                                                           |
| La tienda completa una compra contra el sandbox de Mercado Pago y el pedido llega a `PaymentSettled` | [~]    | Completa contra un Mercado Pago **simulado** (Playwright). Contra el sandbox real faltan credenciales: T11 |
| Todas las pruebas pasan; lint, tipos y build en verde                                                | [x]    | 281 pruebas + 21 E2E; `npm run verify`                                                                     |
| `README.md` explica levantar, dar de alta, vincular Mercado Pago y crear un frontend a medida        | [x]    | `README.md` (el procedimiento de copiar la tienda se probó)                                                |

## Pendientes y bloqueos

| Tema                                                                                       | Estado                                                                              |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Credenciales reales de Mercado Pago (aplicación, cuentas de prueba, dominio con túnel)     | Pendiente del responsable: necesarias para T11 (`VERIFICATION.md`)                  |
| Hosting, proveedor S3, SMTP, dominios, titularidad de la aplicación de Mercado Pago (16.9) | Todo configurable por variables; sin proveedor elegido                              |
| `.env.example`: faltan las variables marcadas ★ en el README                               | Una regla de permisos impidió editarlo; hay que agregarlas a mano (lista en README) |

## Reglas no negociables (cada una tiene su prueba, ver README)

- La notificación nunca es la fuente de verdad: siempre se consulta el pago con el token del local.
- El frontend nunca da un pago por confirmado con los parámetros de la redirección.
- Ningún frontend usa el canal por defecto ni la Admin API.
- Los tokens de Mercado Pago se cifran en reposo y nunca llegan al frontend.
- El procesamiento de webhooks es idempotente.
- `commerce-core` no depende del SDK de Mercado Pago ni de ningún secreto.

# tiendasaas-mvp

Objective: build the MVP described in `PRD.md` (Vendure 3.8 multi-tenant + Mercado Pago plugin + commerce-core + reference storefront + Docker).
Branch: feat/mvp · Delivery: ask-on-risk, work-unit commits on the branch (push/PR are the user's call) · Runner: Vitest (+ Playwright for the storefront). Task detail and status also live in `PLAN.md`.

## Specs

- S1: `PRD.md` is the specification; read section 16 for stack, versions and structure. Marks: [Doc] confirmed, [Diseño] decided (respect unless a concrete technical problem exists; tell the user before changing), [Verificar] assumption to confirm.
- S2: "Antes de instalar dependencias, corré `npm view <paquete> version` para las principales y compará con la sección 16. Si una versión cambió, no la actualices en silencio: anotalo en `DECISIONS.md` con el motivo."
- S3: Before each integration, review current official docs of Vendure and Mercado Pago **Argentina** (mercadopago.com.ar/developers). "Si algo contradice el PRD, no lo resuelvas en silencio: anotalo en `DECISIONS.md` y avisame."
- S4: "Todo lo que está en la sección "Fuera del MVP" queda fuera. No lo implementes ni lo dejes a medias."
- S5: Deliverables: Vendure 3.8.x server + PostgreSQL 17 multi-tenant by channels (server and worker as separate processes); Mercado Pago plugin (OAuth+PKCE, encrypted credentials, scheduled renewal, payment handler, `createMercadoPagoCheckout` and `syncMercadoPagoPayment`, signed webhook, queue processing, refunds and cancellations); store onboarding script/mutation (PRD 5.4); shipping methods (pickup + flat rate, PRD 8); `commerce-core` package; minimal Next.js reference storefront (catalog, cart, guest checkout, optional account, payment, result screen; simple neutral design); reproducible local env (Docker Compose) + deployment docs.
- S6: Stack: strict TypeScript, Node.js 24 LTS, npm workspaces monorepo, structure of PRD 16.3 (`apps/server`, `apps/storefront-reference`, `packages/vendure-plugin-mercadopago`, `packages/commerce-core`). Structure changes need a reason recorded in `DECISIONS.md`.
- S7: "Primero creá `PLAN.md` con tu desagregación en tareas, el orden y las dependencias. Después avanzá sin esperar mi aprobación y mantenelo actualizado con el estado real." Small commits with descriptive messages. "Ningún secreto en el repositorio: usá `.env.example` con todas las variables documentadas."
- S8: Non-negotiable: "La notificación de Mercado Pago nunca es la fuente de verdad: siempre se consulta el pago con el token del local." / "El frontend nunca da un pago por confirmado con los parámetros de la redirección." / "Ningún frontend usa el canal por defecto ni la Admin API." / "Los tokens de Mercado Pago se cifran en reposo y nunca llegan al frontend." / "El procesamiento de webhooks es idempotente." / "`commerce-core` no depende del SDK de Mercado Pago ni de ningún secreto."
- S9: [Verificar] points (PRD 13): implement the main design and keep plan B behind a config option when reasonable (esp. V1/V2: app-level webhook vs per-preference `notification_url`). Write in `VERIFICATION.md` step-by-step sandbox instructions for each. "No marques ningún punto como resuelto sin evidencia. V3, V9 y V10 los podés resolver vos al instalar y probar el código; dejá la evidencia en `VERIFICATION.md`."
- S10: Tests: Vitest with `@vendure/testing`, Playwright for the storefront, `msw` for the Mercado Pago API. Unit tests for signature validation, status mapping, encryption, amount conversion. Integration tests for the payment flow covering at least PRD section 12 cases. "Los pagos con credenciales de prueba no envían notificaciones: las pruebas de webhook usan notificaciones generadas y firmadas por las propias pruebas."
- S11: Stop and ask when: real credentials are needed; the PRD does not cover a product/architecture decision; current docs contradict the PRD. For PRD 16.9 open decisions (hosting, S3 provider, SMTP, domains) do not choose a provider: everything configurable via env vars. "Mientras esperás mi respuesta, seguí con las tareas que no dependan de eso."
- S12: Definition of done: "`docker compose up` levanta servidor, worker, base de datos, almacenamiento de imágenes y tienda de referencia." / "Con el script de alta se crean dos locales de prueba con sus administradores y métodos de envío." / "Cada administrador ve solo su canal en el dashboard." / "La tienda de referencia completa una compra contra el sandbox de Mercado Pago (una vez que te dé credenciales) y el pedido llega a `PaymentSettled`." / "Todas las pruebas pasan, y lint, tipos y build están en verde." / "`README.md` explica cómo levantar el proyecto, dar de alta un local, vincular su Mercado Pago y crear un frontend a medida nuevo a partir de `commerce-core`."
- S13: Personal project: do not associate it with any existing company or brand.

## Tasks

- [ ] T0 · S1,S2,S6,S7 · inline · foundations (workspaces, tsconfig, lint, env, docs skeleton) · commit: —
- [ ] T1 · S5,S6 · inline · Vendure server + worker · commit: —
- [ ] T2 · S8,S10 · inline · plugin pure modules (crypto, amounts, signature, status map, PKCE) · commit: —
- [ ] T3 · S5,S8,S9 · inline · plugin entities, OAuth, renewal, mp-connect · commit: —
- [ ] T4 · S5,S8,S9 · inline · handler, checkout/sync mutations, webhook+queue, refunds · commit: —
- [ ] T5 · S10 · inline · integration tests (PRD 12) · commit: —
- [ ] T6 · S5,S12 · inline · onboarding, shipping, scoped admins · commit: —
- [ ] T7 · S5,S8 · inline · commerce-core · commit: —
- [ ] T8 · S5,S10 · inline · reference storefront + Playwright · commit: —
- [ ] T9 · S5,S11,S12 · inline · Docker/Compose · commit: —
- [ ] T10 · S7,S9,S12 · inline · CI, README, deployment docs, VERIFICATION · commit: —

Route declaration: all tasks start inline (no Writer trigger holds yet: units are sequentially dependent). Re-evaluate for T7/T8 vs T4/T5 as parallel units once the Shop API schema is stable.

## Log

- L1 (2026-10-18, user): Original request, verbatim — see the kickoff message "Inicio del desarrollo" (Vas a desarrollar desde cero el proyecto descrito en `PRD.md` ... Empezá leyendo `PRD.md` y creando `PLAN.md`.). Reproduced here in its decision-bearing parts in S1–S13 above.
- L2: PRD read in full. Registry check on 2026-10-18: @vendure/* 3.8.0, mercadopago 3.6.1, next 16.4.2, react 19.3.1, tailwindcss 4.3.3, graphql-request 7.4.0, vitest 5.0.5, msw 3.0.3, @playwright/test 1.64.1. `typescript` latest is 7.0.2 but PRD fixes 5.8.x (matches @vendure/core 3.8.0 devDependency 5.8.2) → keep 5.8.3; no deviation.

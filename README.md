# TiendaSaaS

Tiendas online para locales comerciales de Argentina: **un backend de comercio compartido** (Vendure,
un canal por local), **un frontend a medida por local** que usa un paquete común, y cobro con
**Mercado Pago directo en la cuenta de cada local**. Es un proyecto personal.

La especificación es [`docs/PRD.md`](docs/PRD.md). Estado y decisiones: [`PLAN.md`](PLAN.md),
[`DECISIONS.md`](DECISIONS.md), [`VERIFICATION.md`](VERIFICATION.md) (qué falta probar con credenciales
reales). Despliegue a producción: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Camino rápido

Necesitás Node.js 24, npm y Docker.

```bash
cp .env.example .env            # completá las contraseñas (ver "Variables")
docker compose up --build       # base, almacenamiento, servidor, worker y tienda
docker compose run --rm seed-demo   # opcional: dos locales de prueba con productos
```

| Qué                      | Dónde                                                                |
| ------------------------ | -------------------------------------------------------------------- |
| Tienda de referencia     | <http://localhost:3001> (local `panadería`, token `demo-panaderia`)  |
| Dashboard                | <http://localhost:3000/dashboard>                                    |
| Shop API / Admin API     | <http://localhost:3000/shop-api> · <http://localhost:3000/admin-api> |
| Emails (modo desarrollo) | <http://localhost:3000/mailbox>                                      |

Accesos de prueba (solo con `seed-demo`): dueños `dueno@panaderia-demo.test` y
`dueno@libreria-demo.test`, contraseña `demo-password-123` (`DEMO_OWNER_PASSWORD`). El superadmin
es el de `SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD`.

Cada dueño ve **solo su canal** en el dashboard. Para cobrar tiene que vincular su Mercado Pago
(ver más abajo).

## Desarrollo diario

La infraestructura en contenedores y las aplicaciones en tu máquina:

```bash
npm install
npm run infra:up      # PostgreSQL 17 y almacenamiento S3 local
npm run dev           # servidor y worker (3000), dashboard con recarga en caliente (5173) y tienda (3001)
```

La tienda necesita saber qué local sirve: en `.env`, `VENDURE_CHANNEL_TOKEN=demo-panaderia` y
`STOREFRONT_PUBLIC_URL=http://localhost:3001`.

| Comando                      | Para qué                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `npm run build`              | Compila todo en el orden correcto (plugin, commerce-core, servidor, dashboard, tienda) |
| `npm test`                   | Pruebas unitarias y de integración de cada paquete                                     |
| `npm run test:e2e`           | Tienda en un navegador real contra un backend real (requiere `npm run build`)          |
| `npm run lint` / `typecheck` | ESLint, Prettier y TypeScript en todo el repositorio                                   |
| `npm run verify`             | Todo lo anterior, en orden                                                             |
| `npm run codegen`            | Regenera los tipos de `commerce-core` desde `schema.shop.graphql`                      |

Las pruebas de concurrencia necesitan PostgreSQL: `TEST_DB_PASSWORD=<DB_PASSWORD> npm test`
(sin esa variable se omiten, y el CI siempre las corre). El E2E usa los puertos 3300, 3301 y 3399.
Primera vez con Playwright: `npx playwright install chromium`.

## Dar de alta un local

Crea, en una sola transacción: vendedor, canal (ARS, español, IVA incluido), dueño con un rol
**limitado a su canal**, ubicación de stock, **retiro en el local**, **envío con tarifa fija** y el
método de pago Mercado Pago. Si algo falla, no queda nada.

```bash
npm run provision-store -- \
  --name "Tienda A" --code tienda-a \
  --owner-email dueno@tienda-a.com --owner-first-name Ana --owner-last-name Pérez \
  --storefront-url https://tienda-a.com \
  --flat-rate 150000 --flat-rate-minimum 0
```

En contenedores: `docker compose run --rm provision-store --name ...` (mismas opciones).
También existe la mutación `provisionStore` de la Admin API (solo superadmin).

| Opción                                    | Notas                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `--code`                                  | Minúsculas, números y guiones. Identifica el canal                                    |
| `--token`                                 | Lo que envía la tienda en `vendure-token`. Se genera si falta                         |
| `--owner-password`                        | Se genera y se muestra **una sola vez** si falta                                      |
| `--storefront-url`                        | `https` público. Es el único origen aceptado para las URLs de retorno de Mercado Pago |
| `--flat-rate`, `--flat-rate-minimum`      | Centavos de ARS, impuestos incluidos                                                  |
| `--contact-email`, `--cuit`, `--logo-url` | Datos del local (campos del vendedor)                                                 |

## Vincular el Mercado Pago de un local

1. El dueño entra a su dashboard › **Ajustes › Mercado Pago** y pulsa **Conectar Mercado Pago**.
2. Autoriza en Mercado Pago con **su** cuenta. Una cuenta de Mercado Pago vende para **un solo local a la vez**.
3. Vuelve al dashboard con el estado "Conectada". Mientras no esté conectada, la tienda no ofrece Mercado Pago.

Antes hay que registrar la aplicación de Mercado Pago y configurar la plataforma:
[`VERIFICATION.md` › Preparación común](VERIFICATION.md#preparación-común-una-sola-vez) lo explica
paso a paso (aplicación, URL de OAuth con PKCE, webhooks, cuentas de prueba, túnel HTTPS).
El sistema renueva solo los tokens (tarea diaria) y avisa por email si no puede.

### Cambiar de cuenta

El dueño abre Ajustes › Mercado Pago, pulsa **Vincular otra cuenta** y autoriza con la cuenta nueva. La
cuenta anterior **no se pierde**: queda como "cuenta anterior" (vínculo `retired`). Con ella el local
sigue pudiendo reembolsar sus ventas anteriores, sus pagos pendientes (por ejemplo un cupón de Rapipago)
se siguen liquidando y sus contracargos se siguen asignando a ese local. Las preferencias nuevas usan la
cuenta nueva. **No hay que revocar el acceso de la cuenta anterior desde Mercado Pago durante 180
días**: si se revoca, los reembolsos de esas ventas hay que hacerlos desde el panel de Mercado Pago.

**Desvincular** hace lo mismo sin cuenta nueva: el local deja de ofrecer Mercado Pago, pero no se borra
nada. Pasados 180 días desde su último pago y 30 desde que se retiró, la cuenta anterior se libera sola
(tarea diaria): se borran sus tokens si ningún local la usa, y el local recibe un aviso. Para ver qué se
liberaría o liberar a pedido: `npm run release-links -- --dry-run` o `npm run release-links` (en
contenedores, `docker compose run --rm release-links`). Las ventanas se cambian con
`MP_RELEASE_AFTER_LAST_PAYMENT_DAYS` y `MP_RELEASE_AFTER_RETIRED_DAYS`.

### Traspasar una cuenta de un local a otro

1. El local A pulsa **Desvincular** (o el superadmin retira su cuenta, abajo). La cuenta queda `retired` en A.
2. El titular de la cuenta entra al dashboard del local B, abre Ajustes › Mercado Pago y autoriza **por
   OAuth** con esa cuenta. Los tokens nunca se copian de un local a otro.
3. Desde ese momento los pagos nuevos van a B. Las ventas de A siguen siendo de A: se reembolsan desde A
   y sus contracargos se asignan a A, aunque la cuenta sea la misma.

Mientras la cuenta esté `active` en un local, ningún otro puede vincularla (se rechaza sin cambiar
nada), tampoco si el titular revocó su acceso: el local que la tiene tiene que desvincularla primero.

### Herramientas del superadmin

Desde la Admin API, con el rol de superadmin (no las ven los dueños de los locales):

| Operación                                            | Qué hace                                                                                                                                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mercadoPagoChannelLinks(channelId)`                 | Lista los vínculos de un local con su estado y la fecha estimada de liberación                                                                                                                         |
| `retireMercadoPagoAccount(channelId)`                | Retira la cuenta con la que vende un local (por ejemplo, un local cerrado cuyo dueño ya no está). No borra nada                                                                                        |
| `mercadoPagoReleasePreview(linkId)`                  | Dice cuántos pagos de ese vínculo todavía se podrían reembolsar (los de los últimos 180 días, sin descontar los ya reembolsados)                                                                       |
| `releaseMercadoPagoLink(input: { linkId, confirm })` | Libera un vínculo retirado **ya**, sin esperar los plazos, y borra los tokens si ningún otro local usa la cuenta. Exige `confirm: true`. Sirve, por ejemplo, si el titular pide que se borre su acceso |

## Crear un frontend a medida

El diferencial del servicio es un diseño único por local; la lógica de comercio es siempre la misma y
vive en [`packages/commerce-core`](packages/commerce-core). Partí de la tienda de referencia
([`apps/storefront-reference`](apps/storefront-reference)): sirve de ejemplo y de prueba, no es un diseño.

```bash
cp -r apps/storefront-reference apps/tienda-a          # 1. copiala
# 2. en apps/tienda-a: borrá e2e/ y playwright.config.ts; en package.json cambiá "name"
#    (@tiendasaas/tienda-a), el puerto de "dev" y "start", y quitá @playwright/test y los
#    scripts test:e2e y e2e:backend
npm install                                            # 3. el workspace la toma sola
# 4. VENDURE_CHANNEL_TOKEN y STOREFRONT_PUBLIC_URL del local nuevo, y npm run dev -w @tiendasaas/tienda-a
```

Después reemplazá `src/app` y `src/components` por tu diseño. Lo que **no** cambia:

```ts
// El paquete no tiene componentes ni lee variables de entorno: se configura por parámetro.
import { createCommerce } from '@tiendasaas/commerce-core';

const commerce = createCommerce({
  apiUrl: process.env.VENDURE_SHOP_API_URL!, // .../shop-api
  channelToken: process.env.VENDURE_CHANNEL_TOKEN!, // el token DEL LOCAL
  session, // dónde guardar la sesión del comprador
});

const { items } = await commerce.catalog.listProducts({ take: 12 });
await commerce.cart.addToCart(items[0].variants[0].id, 1);
await commerce.checkout.setCustomer({ email, firstName, lastName }); // invitado, sin cuenta
await commerce.checkout.setShippingAddress(address);
await commerce.checkout.selectShippingMethod(methodId);
const { redirectUrl } = await commerce.checkout.startPayment(returnUrls, { expectedTotal });
// ...redirigir al comprador a redirectUrl, y en la página de vuelta:
const result = await commerce.payment.waitForPayment({ orderCode, paymentId });
// result.state: 'paid' | 'pending' | 'failed' | 'review' | 'processing'
```

Reglas del contrato (el paquete y las pruebas las hacen cumplir):

| Regla                                                              | Por qué                                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------- |
| Llamá a la API **desde el servidor** de tu frontend                | Así el navegador nunca ve la sesión y no hace falta CORS |
| Nunca uses la Admin API ni el token del canal por defecto          | El canal por defecto ve todos los locales                |
| No confirmes un pago con los parámetros de la redirección          | Solo el servidor, consultando a Mercado Pago, confirma   |
| Las URLs de retorno van en el dominio configurado del local        | El servidor rechaza cualquier otro origen                |
| Si necesitás comercio que el paquete no tiene, agregalo al paquete | Un cambio se corrige una sola vez para todos los locales |

La sesión (`session`) es un objeto con `get()` y `set(token)`; en Next.js es una cookie httpOnly
(ver `apps/storefront-reference/src/lib/commerce.ts`). Para otro framework alcanza con implementar ese
par de funciones.

## Variables

Todas están en `.env.example` salvo las marcadas con ★, que son opcionales y todavía no figuran allí.

| Grupo          | Variables                                                                                                                                                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| General        | `APP_ENV` (`dev`\|`prod`), `PUBLIC_URL`, `PORT`, `COOKIE_SECRET`, `CORS_ORIGINS`, `TRUST_PROXY`, `PLATFORM_NAME` ★, `PLATFORM_ALERT_EMAIL` ★                                                                                                                           |
| Base de datos  | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`, `DB_SYNCHRONIZE` (solo desarrollo)                                                                                                                                                                      |
| Superadmin     | `SUPERADMIN_USERNAME`, `SUPERADMIN_PASSWORD`                                                                                                                                                                                                                           |
| Mercado Pago   | `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_WEBHOOK_SECRET`, `MP_REDIRECT_URI`, `MP_TOKEN_ENCRYPTION_KEY`, `MP_WEBHOOK_MODE`, `MP_OAUTH_TEST_TOKEN`, `MP_WEBHOOK_TOLERANCE_SECONDS`, `MP_PREFERENCE_TTL_MINUTES`, `MP_DASHBOARD_URL`                                       |
| Mercado Pago ★ | `MP_RELEASE_AFTER_LAST_PAYMENT_DAYS` (180), `MP_RELEASE_AFTER_RETIRED_DAYS` (30), `MP_REQUIRE_SIGNATURE_IN_PREFERENCE_MODE`, `MP_PREFERENCE_ITEMS_MODE` (`lines`\|`total`), `MP_REQUIRE_OFFLINE_ACCESS`, `MP_AUTH_URL`, `MP_ALLOW_INSECURE_RETURN_URLS` (solo pruebas) |
| Almacenamiento | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_FORCE_PATH_STYLE`, `ASSET_URL_PREFIX`                                                                                                                                                   |
| Email          | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`                                                                                                                                                                                                   |
| Tienda         | `VENDURE_SHOP_API_URL`, `VENDURE_CHANNEL_TOKEN`, `STOREFRONT_PUBLIC_URL`, `STORE_NAME` ★, `PAYMENT_SYNC_AFTER_MS` ★                                                                                                                                                    |

Ningún secreto va al repositorio. Los de Mercado Pago solo existen en el servidor.

## Cómo está armado

```
apps/server                       Vendure: servidor y worker (misma imagen, dos procesos), dashboard, alta de locales, emails
apps/storefront-reference         Next.js 16: tienda mínima que usa commerce-core
packages/vendure-plugin-mercadopago   OAuth + PKCE, tokens cifrados, handler, webhook, reembolsos, página del dashboard
packages/commerce-core            Catálogo, carrito, checkout, pago y cuenta, sin UI
docs/DEPLOYMENT.md                Requisitos y lista de control de producción
```

Las reglas que no se negocian, y dónde se prueban:

| Regla                                                                                  | Prueba                                                                  |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| La notificación nunca es la verdad: siempre se consulta el pago con el token del local | `payment-flow.e2e-spec.ts` (plugin)                                     |
| El frontend nunca confirma un pago con los parámetros de la redirección                | `purchase.spec.ts` y `security.spec.ts` (Playwright), `payment.test.ts` |
| Ningún frontend usa el canal por defecto ni la Admin API                               | `purity.test.ts` (commerce-core), guarda de la tienda                   |
| Los tokens se cifran en reposo y no llegan al frontend                                 | `oauth.e2e-spec.ts`, `crypto.spec.ts`, `security.spec.ts`               |
| El procesamiento de webhooks es idempotente                                            | `payment-flow` y `concurrency.e2e-spec.ts` (PostgreSQL)                 |
| `commerce-core` no depende del SDK de Mercado Pago ni de secretos                      | `purity.test.ts`                                                        |

## Para seguir

- [ ] Registrar la aplicación de Mercado Pago y recorrer [`VERIFICATION.md`](VERIFICATION.md): **V19 primero** (si los identificadores de la cuenta no coinciden hay que rediseñar una regla), y después V1, V2, V6, V7, V12–V18 y V20.
- [ ] Decidir hosting, proveedor S3, SMTP, dominios y titularidad de la aplicación (PRD 16.9): [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

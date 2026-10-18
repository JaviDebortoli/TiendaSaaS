# Despliegue a producción

El código no depende de ningún proveedor: todo se configura por variables de entorno (PRD 16.9).
Esta guía dice qué tiene que ofrecer el hosting y qué revisar antes de abrir al público.

## Qué necesita cualquier hosting

| Necesidad                                                      | Detalle                                                                                        |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| HTTPS con dominio público                                      | Checkout Pro lo exige. Servidor y tienda necesitan cada uno el suyo                            |
| Un proceso de **servidor**                                     | `node dist/index.js`, puerto 3000. Aplica las migraciones al arrancar                          |
| Al menos un proceso de **worker**                              | `node dist/index-worker.js`. Sin él no se procesan webhooks, emails ni la renovación de tokens |
| PostgreSQL 17 con copias de seguridad                          | Zona horaria UTC. Nunca `DB_SYNCHRONIZE=true`                                                  |
| Almacenamiento compatible con S3                               | Probar el proveedor antes de elegirlo (la documentación de Vendure no menciona todos)          |
| SMTP                                                           | Dominio de envío propio con SPF/DKIM                                                           |
| Una tienda (`storefront-reference` o la del cliente) por local | Cada una recibe el token de su canal                                                           |

Imágenes: `apps/server/Dockerfile` (servidor y worker) y `apps/storefront-reference/Dockerfile`, con
contexto en la raíz del repositorio. Las variables llegan por el entorno de la plataforma, nunca en
un archivo del repositorio.

## Pasos

1. Construir y publicar las imágenes. Iniciar **un** servidor primero (aplica las migraciones) y después
   el worker.
2. Cargar las variables (tabla del [README](../README.md#variables)). En producción: `APP_ENV=prod`,
   `PUBLIC_URL=https://api.…`, un `COOKIE_SECRET` largo, credenciales de superadmin propias y
   `CORS_ORIGINS` con una lista explícita (puede quedar solo el dashboard: las tiendas llaman desde su servidor).
3. Detrás de un proxy inverso: `TRUST_PROXY=1` (cantidad de saltos).
4. Dar de alta los locales con `provision-store` y entregar a cada dueño su usuario.
5. Configurar Mercado Pago ([`VERIFICATION.md` › Preparación común](../VERIFICATION.md#preparación-común-una-sola-vez)):
   URL de redirección de OAuth con PKCE, webhook de la aplicación y `MP_WEBHOOK_SECRET`.
   Con credenciales reales: `MP_OAUTH_TEST_TOKEN=false`.
6. Completar el **Storefront URL** de cada canal (o pasar `--storefront-url` al alta).

## Lista de control

- [ ] `MP_TOKEN_ENCRYPTION_KEY` generada con `openssl rand -base64 32` y guardada en un gestor de secretos: **si se pierde, hay que volver a vincular todos los locales**.
- [ ] `SUPERADMIN_PASSWORD` y `COOKIE_SECRET` únicos de este entorno.
- [ ] `APP_ENV=prod`: apaga GraphiQL, el buzón de emails de desarrollo y el modo permisivo de `HardenPlugin` (introspección desactivada).
- [ ] `MP_ALLOW_INSECURE_RETURN_URLS` sin definir o `false`.
- [ ] La tienda sin `INSECURE_COOKIES` (las cookies de sesión van `Secure`).
- [ ] Copias de seguridad de PostgreSQL probadas con una restauración.
- [ ] Al menos un worker corriendo y con `/health` sano (`WORKER_HEALTH_PORT`, 3020 por defecto).
- [ ] Emails de aviso: `PLATFORM_ALERT_EMAIL` con una dirección real (el usuario superadmin por defecto no es un email).
- [ ] Clave secreta de webhooks renovada periódicamente (Mercado Pago lo recomienda; botón **Reset** en Webhooks) y actualizada en `MP_WEBHOOK_SECRET`.
- [ ] Una compra real de monto bajo de punta a punta (ver la lista de control de [`VERIFICATION.md`](../VERIFICATION.md)).
- [ ] Política de privacidad: la cuenta es compartida y cada local ve al comprador solo después de que interactúa con su tienda (V5 en `VERIFICATION.md`).

## Operación

| Tarea                                | Cómo                                                                                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migraciones                          | Automáticas al arrancar el servidor. Un cambio de esquema nuevo: `npm run migration:generate -w @tiendasaas/server -- <nombre>` y revisar el archivo |
| Renovar tokens de Mercado Pago ahora | `node dist/scripts/refresh-connections.js --all` (el worker lo hace solo cada día)                                                                   |
| Crear un local                       | `node dist/scripts/provision-store.js --help`                                                                                                        |
| Personalizar un email de un local    | `apps/server/email-templates/stores/<código del canal>/<tipo>/<archivo>`                                                                             |
| Rotar la clave de cifrado de tokens  | No es automático: requiere volver a vincular los locales                                                                                             |

## Qué no incluye el MVP

Comisión por venta, pago embebido, cotización con correos, facturación electrónica y otras
pasarelas quedan fuera (PRD 2 y 14). La capa de pagos está preparada para sumar otra pasarela como
otro `PaymentMethodHandler`.

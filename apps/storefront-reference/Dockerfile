# Reference storefront (Next.js standalone output). Build context: the repository root.
#
#   docker build -f apps/storefront-reference/Dockerfile -t tiendasaas-storefront .
#
# Runtime settings (all read per request, so one image serves any store):
#   VENDURE_SHOP_API_URL  VENDURE_CHANNEL_TOKEN  STOREFRONT_PUBLIC_URL  STORE_NAME  PLATFORM_NAME

FROM node:24-bookworm-slim AS builder

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/storefront-reference/package.json apps/storefront-reference/
COPY packages/vendure-plugin-mercadopago/package.json packages/vendure-plugin-mercadopago/
COPY packages/commerce-core/package.json packages/commerce-core/
RUN npm ci

COPY . .
RUN npm run build -w @tiendasaas/commerce-core \
  && npm run build -w @tiendasaas/storefront-reference

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
  PORT=3001 \
  HOSTNAME=0.0.0.0 \
  NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# The standalone output keeps the monorepo layout (outputFileTracingRoot is the repository root).
COPY --from=builder /app/apps/storefront-reference/.next/standalone ./
COPY --from=builder /app/apps/storefront-reference/.next/static apps/storefront-reference/.next/static

USER node
EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=10 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/payment-status').then((r) => process.exit(r.status === 400 ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/storefront-reference/server.js"]

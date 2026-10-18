# Vendure server and worker: the same image runs both, only the command changes
# (PRD 16.4, 16.8). The build context is the repository root because of the npm workspaces.
#
#   docker build -f apps/server/Dockerfile -t tiendasaas-server .
#   server:  node dist/index.js          (default)
#   worker:  node dist/index-worker.js

FROM node:24-bookworm-slim AS builder

WORKDIR /app
# Native modules (bcrypt, re2) normally come prebuilt; the toolchain is the fallback.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# `npm ci` checks the lockfile against every workspace, so all manifests are needed.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/storefront-reference/package.json apps/storefront-reference/
COPY packages/vendure-plugin-mercadopago/package.json packages/vendure-plugin-mercadopago/
COPY packages/commerce-core/package.json packages/commerce-core/
RUN npm ci

COPY . .
RUN npm run build -w vendure-plugin-mercadopago \
  && npm run build -w @tiendasaas/server \
  && npm run build:dashboard -w @tiendasaas/server
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/vendure-plugin-mercadopago/package.json packages/vendure-plugin-mercadopago/package.json
COPY --from=builder /app/packages/vendure-plugin-mercadopago/dist packages/vendure-plugin-mercadopago/dist
COPY --from=builder /app/apps/server/package.json apps/server/package.json
COPY --from=builder /app/apps/server/dist apps/server/dist
COPY --from=builder /app/apps/server/email-templates apps/server/email-templates

# Local scratch space of the asset server and the dev mailbox.
RUN mkdir -p apps/server/static && chown -R node:node apps/server/static

WORKDIR /app/apps/server
USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=10 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]

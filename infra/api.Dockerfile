FROM node:22-bookworm-slim AS build

ENV DEBIAN_FRONTEND=noninteractive
ENV PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app

# ------------------------------------------------------------
# Dépendances du monorepo
# ------------------------------------------------------------

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY apps/portal/package.json ./apps/portal/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN npm ci --ignore-scripts

# ------------------------------------------------------------
# Sources nécessaires au build API
# ------------------------------------------------------------

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# ------------------------------------------------------------
# Build propre du package partagé
#
# Le projet TypeScript utilise composite/incremental.
# On supprime explicitement les artefacts potentiellement copiés,
# puis on force une reconstruction complète.
# ------------------------------------------------------------

RUN rm -rf packages/shared/dist \
    packages/shared/tsconfig.tsbuildinfo \
    packages/shared/*.tsbuildinfo \
    && npx tsc -b packages/shared/tsconfig.json --force \
    && echo "=== @aidn/shared dist ===" \
    && find packages/shared/dist -maxdepth 1 -type f -print \
    && test -f packages/shared/dist/index.js \
    && test -f packages/shared/dist/index.d.ts

# ------------------------------------------------------------
# Vérification du lien workspace npm
# ------------------------------------------------------------

RUN echo "=== workspace @aidn/shared ===" \
    && ls -la node_modules/@aidn \
    && readlink -f node_modules/@aidn/shared \
    && test -f node_modules/@aidn/shared/dist/index.d.ts

# ------------------------------------------------------------
# Build propre de l'API
# ------------------------------------------------------------

RUN rm -rf apps/api/dist \
    apps/api/tsconfig.tsbuildinfo \
    apps/api/*.tsbuildinfo \
    && npx tsc -b apps/api/tsconfig.json --force

# Les templates HTML ne sont pas générés par TypeScript.
RUN mkdir -p apps/api/dist/templates \
    && cp -R apps/api/src/templates/. apps/api/dist/templates/

# ------------------------------------------------------------
# Runtime
# ------------------------------------------------------------

FROM node:22-bookworm-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=staging
ENV PORT=4000

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates \
       chromium \
       fonts-dejavu-core \
       fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api ./apps/api

RUN mkdir -p /app/apps/api/uploads \
    && chown -R node:node /app/apps/api/uploads

WORKDIR /app/apps/api

EXPOSE 4000

USER node

CMD ["node", "dist/server.js"]

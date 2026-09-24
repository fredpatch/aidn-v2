FROM node:22-alpine AS build

ARG APP

RUN test "$APP" = "admin" -o "$APP" = "portal"

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY apps/portal/package.json ./apps/portal/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN npm ci --ignore-scripts

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/${APP} ./apps/${APP}

# Reconstruction propre du package partagé.
RUN rm -rf packages/shared/dist \
    packages/shared/tsconfig.tsbuildinfo \
    packages/shared/*.tsbuildinfo \
    && npx tsc -b packages/shared/tsconfig.json --force \
    && test -f packages/shared/dist/index.js \
    && test -f packages/shared/dist/index.d.ts

# Build frontend sélectionné.
RUN rm -rf apps/${APP}/dist \
    apps/${APP}/tsconfig.tsbuildinfo \
    apps/${APP}/*.tsbuildinfo \
    && npm run build --workspace=apps/${APP} \
    && mkdir -p /out \
    && cp -R apps/${APP}/dist/. /out/

FROM nginx:1.27-alpine

COPY infra/frontend.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /out/ /usr/share/nginx/html/

EXPOSE 80

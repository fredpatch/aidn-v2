#!/bin/bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.staging.yml}"
ENV_FILE="${ENV_FILE:-.env.staging}"

[ -f "$COMPOSE_FILE" ] || { echo "ERROR: Missing $COMPOSE_FILE"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "ERROR: Missing $ENV_FILE"; exit 1; }

ADMIN_PORT="$(grep '^ADMIN_HOST_PORT=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"
PORTAL_PORT="$(grep '^PORTAL_HOST_PORT=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"
ADMIN_PORT="${ADMIN_PORT:-8200}"
PORTAL_PORT="${PORTAL_PORT:-8201}"

echo "==> Validating Compose configuration"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" config >/dev/null

echo "==> Building images"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build

echo "==> Starting PostgreSQL"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --wait postgres_staging

echo "==> Applying migrations"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm --no-deps api_staging npm run db:migrate

echo "==> Seeding system parameters"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm --no-deps api_staging npm run seed:params

echo "==> Starting complete stack"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --remove-orphans --wait

echo "==> Validating public entrypoints"
curl -fsS "http://127.0.0.1:${ADMIN_PORT}/health" >/dev/null
curl -fsS "http://127.0.0.1:${PORTAL_PORT}/health" >/dev/null

echo
echo "AIDN V2 staging deployment completed"
echo "Admin  : http://<test-server>:${ADMIN_PORT}"
echo "Portal : http://<test-server>:${PORTAL_PORT}"

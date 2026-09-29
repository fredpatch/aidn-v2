#!/bin/bash
set -euo pipefail

# Rollout order (STORAGE-0A amendment A3):
#  1. verified DB + uploads backup (operator, before running this script)
#  2. build   3. stop old API/jobs   4. db:migrate
#  5. storage:rewrite-addresses dry run   6. stop on blockers
#  7. --apply (only if there are changes, and only with STORAGE_BACKUP_CONFIRMED)
#  8. start the new API (no public /uploads)   9. health checks
# 10. reload nginx (no /uploads proxy)   11. validate files from admin + portal (manual)
# The rewrite runs while the API is stopped, so orphan cleanup, uploads and
# workflow writes can never race it.

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.staging.yml}"
ENV_FILE="${ENV_FILE:-.env.staging}"
COMPOSE=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

[ -f "$COMPOSE_FILE" ] || { echo "ERROR: Missing $COMPOSE_FILE"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "ERROR: Missing $ENV_FILE"; exit 1; }
grep -q '^FILE_GRANT_SECRET=..*' "$ENV_FILE" || { echo "ERROR: FILE_GRANT_SECRET must be set in $ENV_FILE"; exit 1; }

ADMIN_PORT="$(grep '^ADMIN_HOST_PORT=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"
PORTAL_PORT="$(grep '^PORTAL_HOST_PORT=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"
ADMIN_PORT="${ADMIN_PORT:-8200}"
PORTAL_PORT="${PORTAL_PORT:-8201}"

echo "==> Validating Compose configuration"
"${COMPOSE[@]}" config >/dev/null

echo "==> Building images"
"${COMPOSE[@]}" build

echo "==> Starting PostgreSQL"
"${COMPOSE[@]}" up -d --wait postgres_staging

echo "==> Stopping the running API (jobs included) before data changes"
"${COMPOSE[@]}" stop api_staging || true

echo "==> Applying migrations"
"${COMPOSE[@]}" run --rm --no-deps api_staging npm run db:migrate

echo "==> Seeding system parameters"
"${COMPOSE[@]}" run --rm --no-deps api_staging npm run seed:params

echo "==> Stored file addresses: dry run"
set +e
DRY_RUN_OUTPUT="$("${COMPOSE[@]}" run --rm --no-deps api_staging npm run storage:rewrite-addresses 2>&1)"
DRY_RUN_STATUS=$?
set -e
echo "$DRY_RUN_OUTPUT"
if [ "$DRY_RUN_STATUS" -ne 0 ]; then
  echo "ERROR: address rewrite dry run reported blockers or failed (exit $DRY_RUN_STATUS). Nothing was changed."
  exit 1
fi

CHANGES="$(echo "$DRY_RUN_OUTPUT" | sed -n 's/.*Total changes: \([0-9][0-9]*\).*/\1/p' | tail -1)"
if [ -z "$CHANGES" ]; then
  echo "ERROR: could not read the dry-run result."
  exit 1
fi

if [ "$CHANGES" -gt 0 ]; then
  if [ -z "${STORAGE_BACKUP_CONFIRMED:-}" ]; then
    echo "ERROR: $CHANGES address change(s) pending. Take a verified DB + uploads backup, then re-run with"
    echo "       STORAGE_BACKUP_CONFIRMED=<backup id> ./scripts/deploy-staging.sh"
    exit 1
  fi
  echo "==> Stored file addresses: apply (backup $STORAGE_BACKUP_CONFIRMED)"
  "${COMPOSE[@]}" run --rm --no-deps -e STORAGE_BACKUP_CONFIRMED="$STORAGE_BACKUP_CONFIRMED" \
    api_staging npm run storage:rewrite-addresses -- --apply
else
  echo "==> Stored file addresses: nothing to rewrite"
fi

echo "==> Starting complete stack"
"${COMPOSE[@]}" up -d --remove-orphans --wait

echo "==> Reloading nginx configuration (no public /uploads)"
"${COMPOSE[@]}" exec -T nginx_staging nginx -t
"${COMPOSE[@]}" exec -T nginx_staging nginx -s reload

echo "==> Validating public entrypoints"
curl -fsS "http://127.0.0.1:${ADMIN_PORT}/health" >/dev/null
curl -fsS "http://127.0.0.1:${PORTAL_PORT}/health" >/dev/null
# Through nginx, /uploads/* now falls through to the admin SPA (HTML), and a
# 404 for a random path proves nothing, so check the running release itself:
# its server must not mount a static /uploads route.
if "${COMPOSE[@]}" exec -T api_staging grep -q "express.static" dist/server.js; then
  echo "ERROR: the running API still serves /uploads statically"
  exit 1
fi
echo "    API has no public /uploads route"

echo
echo "AIDN V2 staging deployment completed"
echo "Admin  : http://<test-server>:${ADMIN_PORT}"
echo "Portal : http://<test-server>:${PORTAL_PORT}"
echo "Next   : open representative documents from admin and portal (step 11)."

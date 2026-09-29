-- STORAGE-0B / D1 - read-only risk check (run on staging; changes nothing).
--   docker compose -f docker-compose.staging.yml --env-file .env.staging \
--     exec -T postgres_staging psql -U <user> -d <db> -f - < scripts/storage-0b-risk-check.sql
-- Every workflow attachment writes a document_versions row, so joining on
-- file_url finds business-referenced assets that were never linked.

\echo '1. Orphan retention currently configured (expected 3650 during containment)'
SELECT key, value FROM system_parameters WHERE key = 'upload_orphan_retention_days';

\echo '2. Referenced but unlinked assets (at risk of deletion), per owner type'
SELECT dv.owner_type, count(DISTINCT ua.id) AS assets
  FROM document_versions dv
  JOIN upload_assets ua ON ua.file_url = dv.file_url
 WHERE ua.linked_owner_type IS NULL
 GROUP BY dv.owner_type
 ORDER BY dv.owner_type;

\echo '3. Referenced assets already orphan-marked (physical file probably deleted)'
SELECT dv.owner_type, count(DISTINCT ua.id) AS assets, min(ua.orphaned_at) AS first_marked
  FROM document_versions dv
  JOIN upload_assets ua ON ua.file_url = dv.file_url
 WHERE ua.orphaned_at IS NOT NULL
 GROUP BY dv.owner_type
 ORDER BY dv.owner_type;

\echo '4. Unlinked assets older than 14 days (would be deleted at the next 03:30 run with the default retention)'
SELECT count(*) AS assets
  FROM upload_assets
 WHERE linked_owner_type IS NULL AND created_at < now() - interval '14 days';

\echo '5. Upload asset totals'
SELECT count(*) AS total,
       count(*) FILTER (WHERE linked_owner_type IS NULL) AS unlinked,
       count(*) FILTER (WHERE orphaned_at IS NOT NULL) AS orphan_marked
  FROM upload_assets;

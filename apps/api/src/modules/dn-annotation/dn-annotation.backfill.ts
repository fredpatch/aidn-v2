/** SESSION1-M1-1 - grandfather backfill, deliberately NOT a Drizzle migration.
 *
 *  Migration 0008 adds the enum value `dn_director_annotation`; drizzle's
 *  migrator applies every pending migration in ONE transaction, and PostgreSQL
 *  refuses to use a new enum value before it is committed (55P04). So the data
 *  step runs afterwards, from its own script (`npm run db:backfill:dn-annotation`),
 *  once the schema migration has committed.
 *
 *  Every intake circuit already past the DG return (pending_review) gets a
 *  Directeur DN circuit already at pending_review, with no document, so the M3
 *  gate has one rule for old and new dossiers. Additive and idempotent: it only
 *  inserts, never touches requests, phases or documents, and rerunning it adds
 *  nothing. Dossiers still in the DG circuit get nothing: their Directeur DN
 *  circuit is created when their DG return is uploaded. */
export interface Queryable {
  query(text: string): Promise<{ rowCount: number | null; rows: Array<Record<string, unknown>> }>;
}

export interface BackfillReport {
  /** Intake circuits already past the DG return. */
  eligible: number;
  /** Directeur DN circuits created by this run. */
  inserted: number;
  /** Eligible dossiers that already had one (previous run or new flow). */
  alreadyPresent: number;
}

export const BACKFILL_SQL = `
INSERT INTO "dg_circuit_documents" ("entity_type", "request_id", "status", "deposited_at", "signed_at", "pending_review_at")
SELECT
  'dn_director_annotation',
  c."request_id",
  'pending_review',
  COALESCE(c."pending_review_at", c."signed_at", c."deposited_at"),
  COALESCE(c."pending_review_at", c."signed_at", c."deposited_at"),
  COALESCE(c."pending_review_at", c."signed_at", c."deposited_at")
FROM "dg_circuit_documents" c
WHERE c."entity_type" = 'intake_request' AND c."status" = 'pending_review'
ON CONFLICT ("entity_type", "request_id") DO NOTHING`;

export async function backfillLegacyDnAnnotations(db: Queryable): Promise<BackfillReport> {
  const eligible = Number(
    (
      await db.query(
        `SELECT count(*)::int AS c FROM "dg_circuit_documents" WHERE "entity_type" = 'intake_request' AND "status" = 'pending_review'`
      )
    ).rows[0]?.c ?? 0
  );
  const inserted = (await db.query(BACKFILL_SQL)).rowCount ?? 0;
  return { eligible, inserted, alreadyPresent: eligible - inserted };
}

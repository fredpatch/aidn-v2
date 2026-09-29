/** Reference-data seeding. Runs on every API startup (before the server
 *  accepts traffic) and from `npm run seed` / `npm run seed:params`.
 *
 *  Idempotency is per item: each seed creates only what is missing and never
 *  modifies existing rows, so re-running is always safe and items added in a
 *  later version are picked up automatically. There is no "seed completed"
 *  flag on purpose. */
import { sql } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import {
  createDbDocumentTemplateStore,
  removeSeededFile,
  seedDocumentTemplates,
} from './seeds/document-templates.seed.js';
import { createDbSystemParameterStore, seedSystemParameters } from './seeds/system-parameters.seed.js';
import { logAudit } from '../auth/auth.service.js';
import { SeedingError, type SeedResult, type SeedRunContext, type SeedingRunResult } from './seeding.types.js';

export type { SeedRunContext } from './seeding.types.js';

/** Arbitrary but fixed AIDN-specific advisory lock id. Every API instance
 *  uses the same value, so concurrent startups seed one at a time. */
const SEEDING_LOCK_ID = 4_203_117_001;

/** How long a starting instance waits for another one to finish seeding
 *  before giving up (which fails startup visibly rather than hanging). */
const SEEDING_LOCK_TIMEOUT = '30s';

type SeedingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Runs `work` inside one transaction holding a transaction-scoped advisory
 *  lock. The lock is released automatically on commit or rollback - it
 *  cannot leak, even if a seed throws. */
async function withSeedingLock<T>(work: (tx: SeedingTransaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    try {
      await tx.execute(sql.raw(`SET LOCAL lock_timeout = '${SEEDING_LOCK_TIMEOUT}'`));
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${SEEDING_LOCK_ID})`);
    } catch (error) {
      throw new SeedingError(
        'reference-data',
        `acquisition of the seeding lock (another instance may still be seeding; waited ${SEEDING_LOCK_TIMEOUT})`,
        error,
        'LOCK_TIMEOUT'
      );
    }
    return work(tx);
  });
}

/** Files copied during a seed run are only valid if the transaction commits.
 *  If `work` throws (including a failed commit), every tracked file is
 *  removed best-effort and the original error is rethrown unchanged. */
export async function withSeededFileRollback<T>(
  work: (track: (absolutePath: string) => void) => Promise<T>
): Promise<T> {
  const created: string[] = [];
  try {
    return await work((absolutePath) => created.push(absolutePath));
  } catch (error) {
    for (const absolutePath of created) removeSeededFile(absolutePath, absolutePath.split(/[\\/]/).pop()!);
    throw error;
  }
}

/** All reference data, in order: system parameters, then official document
 *  templates. Used by API startup, `npm run seed` and the SU manual run
 *  (POST /api/seeding/run). Never calls process.exit(); callers decide what a
 *  failure means. The context only changes who the audit entries name. */
export async function runSeeds(context: SeedRunContext = { trigger: 'startup' }): Promise<SeedingRunResult> {
  return withSeededFileRollback((trackFile) =>
    withSeedingLock(async (tx) => {
      const seeds: SeedResult[] = [];
      seeds.push(await seedSystemParameters(createDbSystemParameterStore(tx)));
      seeds.push(
        await seedDocumentTemplates(createDbDocumentTemplateStore(tx, context), { onFileCreated: trackFile })
      );
      return { seeds };
    })
  );
}

export interface ReferenceDataRunResponse {
  created: number;
  skipped: number;
  seeds: { name: string; label: string; created: number; skipped: number; createdKeys: string[] }[];
}

interface ManualRunDeps {
  runSeeds: (context?: SeedRunContext) => Promise<SeedingRunResult>;
  logAudit: (entry: { userId?: number; action: string; module: string; details?: Record<string, unknown> }) => Promise<void>;
}

/** SU-triggered « Créer les éléments manquants ». Same runner and rules as
 *  startup (missing -> create, existing -> skip). Only a successful run is
 *  audited; the audit is written after the commit, so an audit failure is
 *  logged but does not turn a completed run into an error. */
export async function runReferenceDataSeed(
  actorUserId: number,
  deps: ManualRunDeps = { runSeeds, logAudit }
): Promise<ReferenceDataRunResponse> {
  const run = await deps.runSeeds({ trigger: 'manual', actorUserId });

  const seeds = run.seeds.map((seed) => ({
    name: seed.name,
    label: seed.label,
    created: seed.created,
    skipped: seed.skipped,
    createdKeys: seed.items.filter((item) => item.status === 'created').map((item) => item.key),
  }));
  const response: ReferenceDataRunResponse = {
    created: seeds.reduce((sum, seed) => sum + seed.created, 0),
    skipped: seeds.reduce((sum, seed) => sum + seed.skipped, 0),
    seeds,
  };

  try {
    await deps.logAudit({
      userId: actorUserId,
      action: 'REFERENCE_DATA_SEED_RUN',
      module: 'M13',
      details: {
        created: response.created,
        skipped: response.skipped,
        createdKeys: seeds.flatMap((seed) => seed.createdKeys),
      },
    });
  } catch (error) {
    console.error('[seeding] Manual run succeeded but its audit entry could not be written:', error);
  }

  return response;
}

/** System parameters only - backs the `npm run seed:params` compatibility
 *  command. Same lock, same per-item rules. */
export async function runSystemParameterSeed(): Promise<SeedingRunResult> {
  return withSeedingLock(async (tx) => ({
    seeds: [await seedSystemParameters(createDbSystemParameterStore(tx))],
  }));
}

export function formatSeedResult(result: SeedResult): string {
  return `[seeding] ${result.label}: ${result.created} created, ${result.skipped} skipped`;
}

export function logSeedingRun(run: SeedingRunResult): void {
  for (const seed of run.seeds) {
    console.log(formatSeedResult(seed));
  }
}

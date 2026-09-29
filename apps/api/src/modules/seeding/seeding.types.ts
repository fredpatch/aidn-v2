/** Outcome of one reference-data item: created because it was missing, or
 *  skipped because it already existed (existing data is never modified). */
export type SeedItemStatus = 'created' | 'skipped';

export interface SeedItemResult {
  key: string;
  status: SeedItemStatus;
  /** Bundled source file name, for seeds that install files. */
  asset?: string;
}

export interface SeedResult {
  /** Stable identifier, e.g. "system-parameters". */
  name: string;
  /** Human-readable label used in logs. */
  label: string;
  created: number;
  skipped: number;
  items: SeedItemResult[];
}

export interface SeedingRunResult {
  seeds: SeedResult[];
}

/** Who triggered a run. Startup (and the CLI) keep the system convention: no
 *  user. A manual run from « État du système » records the SU who asked. */
export interface SeedRunContext {
  trigger: 'startup' | 'manual';
  actorUserId?: number;
}

/** LOCK_TIMEOUT: another instance held the seeding lock too long.
 *  SEED_FAILED: any other failure (asset missing, copy, database). */
export type SeedingErrorCode = 'LOCK_TIMEOUT' | 'SEED_FAILED';

/** Raised when a seed fails; the message names the seed and the operation
 *  that failed so startup logs point straight at the problem. */
export class SeedingError extends Error {
  constructor(
    readonly seedName: string,
    readonly operation: string,
    readonly cause: unknown,
    readonly code: SeedingErrorCode = 'SEED_FAILED'
  ) {
    super(`Seed "${seedName}" failed during ${operation}: ${innermostMessage(cause)}`);
    this.name = 'SeedingError';
  }
}

/** Drizzle wraps driver errors ("Failed query: ...") - the useful reason
 *  (e.g. the Postgres message) is on the innermost `cause`. */
function innermostMessage(error: unknown): string {
  let current = error;
  while (current instanceof Error && current.cause instanceof Error) {
    current = current.cause;
  }
  return current instanceof Error ? current.message : String(current);
}

import { sql } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { logAudit } from '../auth/auth.service.js';
import { RESETTABLE_SCOPES, type ResettableScope } from './dev-tools.types.js';

export type { ResettableScope } from './dev-tools.types.js';
export { RESETTABLE_SCOPES, SCOPE_LABELS } from './dev-tools.types.js';

/** TRUNCATE ... CASCADE per scope. CASCADE is safe here because every
 *  table it can reach is itself part of the app's own workflow graph
 *  (phases, meetings, evaluations, payments, certificates, notifications
 *  with a requestId) - never users/roles/parameters/templates, which are
 *  never part of any scope's statement below. document_versions rows tied
 *  to the reset scope are cleaned up separately since ownerId is a plain
 *  integer, not a real foreign key - CASCADE can't reach it automatically. */
async function runScope(scope: ResettableScope): Promise<void> {
  switch (scope) {
    case 'requests_and_workflow':
      await db.execute(sql`TRUNCATE TABLE requests, dg_circuit_documents RESTART IDENTITY CASCADE`);
      await db.execute(
        sql`DELETE FROM document_versions WHERE owner_type IN (
          'dg_circuit_document', 'formal_request_document', 'preliminary_evaluation_form',
          'payment_invoice', 'payment_proof', 'meeting_report', 'phase_closure_document'
        )`
      );
      break;
    case 'organisations_and_applicants':
      await db.execute(
        sql`TRUNCATE TABLE organisations, applicants, account_requests RESTART IDENTITY CASCADE`
      );
      break;
    case 'notifications':
      await db.execute(sql`TRUNCATE TABLE notifications RESTART IDENTITY`);
      break;
    case 'audit_logs':
      await db.execute(sql`TRUNCATE TABLE audit_logs RESTART IDENTITY`);
      break;
    case 'reports':
      await db.execute(sql`TRUNCATE TABLE reports RESTART IDENTITY`);
      break;
  }
}

/** Dev-only data reset, gated two ways: SU role (route-level) AND an
 *  explicit env flag that must be true. Never callable just by being SU -
 *  the env flag must also be deliberately set, so this can't accidentally
 *  run against a real deployment just because someone has the SU role
 *  there too. */
export async function resetData(
  scopes: string[],
  actorUserId: number
): Promise<{ scopesCleared: ResettableScope[] }> {
  if (process.env.ENABLE_DEV_RESET !== 'true') {
    throw new Error('DEV_RESET_DISABLED');
  }

  const validScopes = scopes.filter((s): s is ResettableScope =>
    (RESETTABLE_SCOPES as readonly string[]).includes(s)
  );
  if (validScopes.length === 0 || validScopes.length !== scopes.length) {
    throw new Error('INVALID_SCOPE');
  }

  for (const scope of validScopes) {
    await runScope(scope);
  }

  await logAudit({
    userId: actorUserId,
    action: 'DEV_DATA_RESET',
    module: 'M13',
    details: { scopes: validScopes },
  });

  return { scopesCleared: validScopes };
}

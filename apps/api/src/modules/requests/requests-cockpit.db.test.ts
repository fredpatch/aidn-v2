/** D2 - Demandes cockpit (real PostgreSQL, skipped without DATABASE_URL):
 *  a rejected or cancelled dossier links to a phase page it can be viewed on
 *  (K7: consultation stays possible), the effective status still comes from
 *  M7 now that it is computed from the loaded phases, and labels are accented. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

describe('effectiveRequestStatus (D2)', () => {
  it('terminal statuses are kept; a closed M7 completes the dossier', async () => {
    // Dynamic import, as in the other db tests: loading the service creates the app pool.
    const { effectiveRequestStatus } = await import('./requests.service.js');
    assert.equal(effectiveRequestStatus('rejected', 'closed'), 'rejected');
    assert.equal(effectiveRequestStatus('cancelled', null), 'cancelled');
    assert.equal(effectiveRequestStatus('in_progress', 'closed'), 'completed');
    assert.equal(effectiveRequestStatus('in_progress', 'open'), 'in_progress');
    assert.equal(effectiveRequestStatus('pending_review', null), 'pending_review');
  });
});

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

describe('D2 request cockpit (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let closeAppPool: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: Record<string, any>;
  const tag = Date.now().toString(36);
  let n = 0;

  before(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const [requestsService, dbModule] = await Promise.all([
      import('./requests.service.js'),
      import('../../shared/db/index.js'),
    ]);
    service = requestsService;
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];

  /** A dossier with the given stored status and phases ({ M3: 'closed', ... }). */
  async function dossier(status: string, phaseStatuses: Record<string, 'open' | 'closed'>) {
    const k = `${tag}${++n}`;
    const org = (await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [`OMA D2 ${k}`])).id;
    const applicant = (await one(`INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'P', $2, 'x') RETURNING id`, [org, `pd2-${k}@t.local`])).id;
    const request = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status) VALUES ($1, $2, $3, 'issuance', $4) RETURNING id`,
      [`DEM-D2-${k}`, applicant, org, status]
    )).id;
    for (const [code, phaseStatus] of Object.entries(phaseStatuses)) {
      await pool.query(`INSERT INTO phases (request_id, phase_code, status) VALUES ($1, $2, $3)`, [request, code, phaseStatus]);
    }
    return request as number;
  }

  async function cockpitItem(requestId: number) {
    const cockpit = await service.listRequestCockpit();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const found = cockpit.items.find((item: any) => item.id === requestId);
    assert.ok(found, 'dossier listed');
    return found;
  }

  it('rejected dossier: viewable on the last started phase, no workflow action', async () => {
    const id = await dossier('rejected', { M3: 'closed', M4: 'open' });
    const item = await cockpitItem(id);
    assert.equal(item.status, 'rejected');
    assert.equal(item.statusLabel, 'Rejeté');
    assert.equal(item.nextActionLabel, 'Dossier rejeté');
    assert.equal(item.nextActionHref, `/demandes/${id}/phase-formelle`);
    assert.equal(item.nextActionTone, 'danger');
    assert.equal(item.canStartPreliminary, false);
  });

  it('cancelled before any phase: no phase page to link', async () => {
    const id = await dossier('cancelled', {});
    const item = await cockpitItem(id);
    assert.equal(item.statusLabel, 'Annulé');
    assert.equal(item.nextActionHref, null);
    assert.match(item.nextActionDescription, /aucune page de phase/);
  });

  it('a closed M7 still completes the dossier (status computed from loaded phases)', async () => {
    const id = await dossier('in_progress', { M3: 'closed', M4: 'closed', M5: 'closed', M6: 'closed', M7: 'closed' });
    const item = await cockpitItem(id);
    assert.equal(item.status, 'completed');
    assert.equal(item.statusLabel, 'Terminé');
    assert.equal(item.nextActionLabel, 'Workflow terminé');
    assert.equal(item.nextActionHref, `/demandes/${id}/delivrance`);
  });

  it('labels are accented (type, phases, circuit)', async () => {
    const id = await dossier('in_progress', { M3: 'open' });
    const item = await cockpitItem(id);
    assert.equal(item.requestTypeLabel, 'Délivrance');
    assert.equal(item.currentPhaseLabel, 'Préliminaire');
    assert.deepEqual(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      item.phases.map((phase: any) => phase.label),
      ['Préliminaire', 'Demande formelle', 'Évaluation approfondie', 'Démonstration / Inspection', 'Délivrance']
    );
    assert.equal(item.circuitStatusLabel, 'Non initialisé');
    assert.equal(item.nextActionLabel, 'Poursuivre Préliminaire');
  });
});

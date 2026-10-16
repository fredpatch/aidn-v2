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
    return (await seeded(status, phaseStatuses)).request;
  }

  /** Same, returning the phase ids too. */
  async function seeded(status: string, phaseStatuses: Record<string, 'open' | 'closed'>) {
    const k = `${tag}${++n}`;
    const org = (await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [`OMA D2 ${k}`])).id;
    const applicant = (await one(`INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'P', $2, 'x') RETURNING id`, [org, `pd2-${k}@t.local`])).id;
    const request = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status) VALUES ($1, $2, $3, 'issuance', $4) RETURNING id`,
      [`DEM-D2-${k}`, applicant, org, status]
    )).id;
    const phase: Record<string, number> = {};
    for (const [code, phaseStatus] of Object.entries(phaseStatuses)) {
      phase[code] = (await one(`INSERT INTO phases (request_id, phase_code, status) VALUES ($1, $2, $3) RETURNING id`, [request, code, phaseStatus])).id;
    }
    return { request: request as number, phase };
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
    assert.equal(item.nextActionLabel, 'Traiter Préliminaire');
  });

  // ── SESSION1-UX-1 §7.4 - state, typed owner, D9 open-phase resolution ──

  let agentId: number | undefined;
  async function agent() {
    if (agentId !== undefined) return agentId;
    const code = `CK${tag}`;
    agentId = (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Agent DN', $2) RETURNING id`, [
      code,
      `${code}@test.local`,
    ])).id as number;
    return agentId;
  }

  it('intake submitted → Réception must print it (action_required, typed owner)', async () => {
    const id = await dossier('submitted', {});
    await pool.query(`INSERT INTO dg_circuit_documents (entity_type, request_id, status) VALUES ('intake_request', $1, 'submitted')`, [id]);
    const item = await cockpitItem(id);
    assert.equal(item.nextActionLabel, 'Impression et mise en circuit DG');
    assert.equal(item.nextActionState, 'action_required');
    assert.deepEqual(item.nextActionOwner, { kind: 'staff', label: 'Réception', roles: ['assistant_dg', 'reception', 'SU'] });
  });

  it('open M5 with a payment awaiting the proof → En attente du postulant (applicant owner)', async () => {
    const d = await seeded('in_progress', { M3: 'closed', M4: 'closed', M5: 'open' });
    await pool.query(`INSERT INTO payments (phase_id, status, invoice_file_url) VALUES ($1, 'awaiting_proof', '/api/files/1')`, [d.phase.M5]);
    const item = await cockpitItem(d.request);
    assert.equal(item.nextActionLabel, 'En attente du postulant');
    assert.equal(item.nextActionDescription, 'Preuve de paiement attendue du postulant (M5).');
    assert.equal(item.nextActionState, 'waiting');
    assert.equal(item.nextActionOwner.kind, 'applicant');
    assert.equal(item.nextActionHref, `/demandes/${d.request}/evaluation-approfondie`);
  });

  it('open M5 with a document awaiting a verdict and one to correct → the DN evaluates first (step 0)', async () => {
    const d = await seeded('in_progress', { M3: 'closed', M4: 'closed', M5: 'open' });
    const pending = (await one(
      `INSERT INTO formal_request_documents (phase_id, slot, status, file_url, submitted_at) VALUES ($1, 'quality_manual', 'submitted', '/api/files/1', now()) RETURNING id`,
      [d.phase.M4]
    )).id;
    const toCorrect = (await one(
      `INSERT INTO formal_request_documents (phase_id, slot, status, file_url, submitted_at) VALUES ($1, 'sms_manual', 'submitted', '/api/files/2', now()) RETURNING id`,
      [d.phase.M4]
    )).id;
    await pool.query(`INSERT INTO document_evaluations (formal_request_document_id) VALUES ($1)`, [pending]);
    await pool.query(`INSERT INTO document_evaluations (formal_request_document_id, verdict) VALUES ($1, 'needs_correction')`, [toCorrect]);
    const item = await cockpitItem(d.request);
    assert.equal(item.nextActionLabel, 'Évaluer 1 document(s)');
    assert.equal(item.nextActionState, 'action_required');
    assert.equal(item.nextActionOwner.label, 'DN');
    assert.notEqual(item.nextActionOwner.kind, 'applicant');
  });

  it('open M6 with a payment pending validation → Finance', async () => {
    const d = await seeded('in_progress', { M3: 'closed', M4: 'closed', M5: 'closed', M6: 'open' });
    await pool.query(
      `INSERT INTO payments (phase_id, status, invoice_file_url, proof_file_url) VALUES ($1, 'pending_validation', '/api/files/1', '/api/files/2')`,
      [d.phase.M6]
    );
    const item = await cockpitItem(d.request);
    assert.equal(item.nextActionLabel, 'Preuve de paiement à valider');
    assert.deepEqual(item.nextActionOwner, { kind: 'staff', label: 'Finance', roles: ['s5_agent', 'SU'] });
  });

  it('closed M3 whose meeting awaits a signed copy, open M4 with nothing else → DN Traiter (never a waiting reason)', async () => {
    const d = await seeded('in_progress', { M3: 'closed', M4: 'open' });
    await pool.query(
      `INSERT INTO meetings (phase_id, meeting_type, dn_agent_id, scheduled_at, status, confirmation_status, confirmed_at, cr_document_url)
       VALUES ($1, 'preliminary', $2, now() - interval '2 days', 'held', 'confirmed', now() - interval '3 days', '/api/files/999999')`,
      [d.phase.M3, await agent()]
    );
    // The M4 letter is back at the DN and no piece slot is missing: nothing is expected from the applicant on M4.
    await pool.query(`INSERT INTO dg_circuit_documents (entity_type, request_id, status) VALUES ('formal_request_letter', $1, 'pending_review')`, [d.request]);
    const item = await cockpitItem(d.request);
    assert.equal(item.nextActionLabel, 'Traiter Demande formelle');
    assert.equal(item.nextActionOwner.label, 'DN');
    assert.equal(item.nextActionState, 'action_required');
  });

  it('terminal dossiers are still listed with their phases and labels (shared rows include closed dossiers)', async () => {
    const id = await dossier('rejected', { M3: 'closed', M4: 'open' });
    const item = await cockpitItem(id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.deepEqual(item.phases.map((phase: any) => phase.status), ['closed', 'open', 'not_started', 'not_started', 'not_started']);
    assert.equal(item.currentPhaseLabel, 'Demande formelle');
    assert.equal(item.nextActionLabel, 'Dossier rejeté');
    assert.equal(item.nextActionState, 'done');
    assert.equal(item.nextActionOwner, null);
  });

  it('fixed query count (no N+1) and no table read twice in one cockpit request', async () => {
    const dbModule = await import('../../shared/db/index.js');
    const appPool = dbModule.db.$client as pg.Pool;
    const capture = async (viewerUserId?: number): Promise<string[]> => {
      const original = appPool.query.bind(appPool);
      const texts: string[] = [];
      (appPool as unknown as { query: unknown }).query = (...args: unknown[]) => {
        const first = args[0] as string | { text?: string };
        texts.push(typeof first === 'string' ? first : first?.text ?? '');
        return (original as (...a: unknown[]) => unknown)(...args);
      };
      try {
        await service.listRequestCockpit(viewerUserId);
      } finally {
        (appPool as unknown as { query: unknown }).query = original;
      }
      return texts;
    };

    // Each seeded dossier carries every domain the cockpit reads.
    async function full() {
      const d = await seeded('in_progress', { M3: 'closed', M4: 'closed', M5: 'closed', M6: 'open' });
      await pool.query(`INSERT INTO dg_circuit_documents (entity_type, request_id, status) VALUES ('intake_request', $1, 'pending_review')`, [d.request]);
      // A returned Directeur DN annotation: makes the conditional document_versions read deterministic.
      await pool.query(`INSERT INTO dg_circuit_documents (entity_type, request_id, status) VALUES ('dn_director_annotation', $1, 'pending_review')`, [d.request]);
      const doc = (await one(`INSERT INTO formal_request_documents (phase_id, slot, status) VALUES ($1, 'quality_manual', 'submitted') RETURNING id`, [d.phase.M4])).id;
      await pool.query(`INSERT INTO document_evaluations (formal_request_document_id, verdict) VALUES ($1, 'validated')`, [doc]);
      await pool.query(`INSERT INTO payments (phase_id, status, invoice_file_url) VALUES ($1, 'awaiting_proof', '/api/files/1')`, [d.phase.M6]);
      await pool.query(
        `INSERT INTO meetings (phase_id, meeting_type, dn_agent_id, scheduled_at, status, confirmation_status, location)
         VALUES ($1, 'site_visit', $2, now() - interval '1 day', 'held', 'not_required', 'Site')`,
        [d.phase.M6, await agent()]
      );
    }

    await full();
    const withOne = await capture();
    for (let i = 0; i < 3; i += 1) await full();
    const withFour = await capture();
    assert.equal(withFour.length, withOne.length, `same query count with 1 and 4 seeded dossiers (${withOne.length})`);
    // Absolute count without a viewer, 13 statements:
    //   1  requests ⋈ organisations ⋈ applicants
    //   8  loadApplicantActionRows: phases, meetings, preliminary_evaluation_forms,
    //      formal_request_documents, dg_circuit_documents, payments, document_evaluations, certificates
    //   1  site_inspections
    //   2  audit_logs (activity window + last activity per request, by design)
    //   1  document_versions of the returned DN circuits (conditional; seeded above, so always issued here)
    assert.equal(withFour.length, 13, `fixed cockpit query count without a viewer (got ${withFour.length})`);
    // With a viewer: + request_views.
    const withViewer = await capture(await agent());
    assert.equal(withViewer.length, 14, `fixed cockpit query count with a viewer (got ${withViewer.length})`);

    const primaryTable = (text: string) => /\bfrom\s+"?([a-z_]+)"?/i.exec(text)?.[1] ?? null;
    for (const captured of [withFour, withViewer]) {
      const selects = captured.filter((text) => /^\s*(select|with)\b/i.test(text));
      assert.equal(selects.length, captured.length, 'the cockpit only reads');
      const readsOf = (table: string) => selects.filter((text) => primaryTable(text) === table).length;
      for (const table of [
        'requests',
        'phases',
        'dg_circuit_documents',
        'formal_request_documents',
        'document_evaluations',
        'meetings',
        'payments',
        'preliminary_evaluation_forms',
        'certificates',
        'site_inspections',
        'request_views',
        'document_versions',
      ]) {
        assert.ok(readsOf(table) <= 1, `${table} is the primary table of at most one select (got ${readsOf(table)})`);
      }
      // Pre-existing, by design: activity window + last activity. A third read is caught.
      assert.equal(readsOf('audit_logs'), 2, `audit_logs read exactly twice (got ${readsOf('audit_logs')})`);
      // Every captured statement is attributed to a known table.
      assert.ok(selects.every((text) => primaryTable(text) !== null), 'every statement has a primary table');
    }
    assert.equal(withViewer.filter((text) => primaryTable(text) === 'request_views').length, 1);
  });
});

/** WORKFLOW-FOUNDATION-1A - the closure courrier is the one way a phase
 *  closes: deposited on a business-ready open phase, sent to the DG circuit,
 *  and its signed return closes the phase atomically (closure, phase,
 *  versions, audits). The M3/M4/M5 readiness rules moved into a shared
 *  policy unchanged. WORKFLOW-FOUNDATION-1B: the direct close routes are
 *  retired, the courrier runs end to end through /courriers, and Reception /
 *  Assistant DG open its documents. Real PostgreSQL, skipped without
 *  DATABASE_URL. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';
import { pgConnectionConfig } from '../../shared/db/connection.js';
import type { PreparedAttachment } from '../uploads/upload-attachment.js';

process.env.JWT_SECRET ??= 'phase-closure-db-test-secret';
process.env.JWT_REFRESH_SECRET ??= 'phase-closure-db-test-refresh-secret';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

type PhaseCode = 'M3' | 'M4' | 'M5' | 'M6' | 'M7';

describe('WORKFLOW-FOUNDATION-1A phase closure courrier (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let closeAppPool: () => Promise<void>;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let closure: Record<string, any>;
  let policy: Record<string, any>;
  let formal: Record<string, any>;
  let requestsSvc: Record<string, any>;
  let fileContext: Record<string, any>;
  let certificatesSvc: Record<string, any>;
  let jwt: Record<string, any>;
  let db: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let server: Server;
  let baseUrl = '';
  let uploadsRoot = '';
  const cookies = { staff: '', applicant: '' };
  const tag = Date.now().toString(36);
  let n = 0;
  const created = {
    users: [] as number[],
    organisations: [] as number[],
    applicants: [] as number[],
    requests: [] as number[],
    phases: [] as number[],
    assets: [] as number[],
  };

  before(async () => {
    pool = new pg.Pool(pgConnectionConfig(DATABASE_URL));
    const [service, policyModule, formalModule, requestsModule, fileContextModule, dbModule] = await Promise.all([
      import('./phase-closure.service.js'),
      import('./phase-closure.policy.js'),
      import('../formal-request/formal-request.service.js'),
      import('../requests/requests.service.js'),
      import('../files/file-context.js'),
      import('../../shared/db/index.js'),
    ]);
    certificatesSvc = await import('../certificates/certificates.service.js');
    closure = service;
    policy = policyModule;
    formal = formalModule;
    requestsSvc = requestsModule;
    fileContext = fileContextModule;
    db = dbModule.db;
    closeAppPool = () => dbModule.db.$client.end();
    uploadsRoot = (await import('../../shared/uploads-root.js')).UPLOADS_ROOT;

    // The real routes: the three retired direct closes, the closure courrier,
    // the courrier queue and the file route.
    const [{ default: express }, { default: cookieParser }, routes, jwtModule, guards] = await Promise.all([
      import('express'),
      import('cookie-parser'),
      Promise.all([
        import('../phases/phases.route.js'),
        import('../formal-request/formal-request.route.js'),
        import('../deep-evaluation/deep-evaluation.route.js'),
        import('./phase-closure.route.js'),
        import('../courrier-tasks/courrier-tasks.route.js'),
        import('../files/files.route.js'),
      ]),
      import('../../shared/utils/jwt.js'),
      import('../../shared/guards/auth.middleware.js'),
    ]);
    jwt = jwtModule;
    cookies.staff = guards.ACCESS_TOKEN_COOKIE;
    cookies.applicant = guards.APPLICANT_ACCESS_TOKEN_COOKIE;
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    const [phasesRoute, formalRoute, deepRoute, closureRoute, courrierRoute, filesRoute] = routes.map((m) => m.default);
    app.use('/api/phases', phasesRoute);
    app.use('/api/formal-request', formalRoute);
    app.use('/api/deep-evaluation', deepRoute);
    app.use('/api/phase-closures', closureRoute);
    app.use('/api/courrier-tasks', courrierRoute);
    app.use('/api/files', filesRoute);
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    const { users, requests, phases, assets } = created;
    if (assets.length) {
      const keys = (await pool.query(`SELECT storage_key FROM upload_assets WHERE id = ANY($1)`, [assets])).rows;
      for (const { storage_key: key } of keys) fs.rmSync(path.join(uploadsRoot, key), { force: true });
    }
    if (requests.length) {
      // Relocated closure files live under dossiers/<reference>/ (this test's dossiers only).
      const references = (await pool.query(`SELECT reference FROM requests WHERE id = ANY($1)`, [requests])).rows;
      for (const { reference } of references) fs.rmSync(path.join(uploadsRoot, 'dossiers', reference), { recursive: true, force: true });
    }
    if (users.length) await pool.query(`DELETE FROM audit_logs WHERE user_id = ANY($1)`, [users]);
    if (phases.length) {
      await pool.query(`DELETE FROM document_versions WHERE owner_type = 'phase_closure_document' AND owner_id = ANY($1)`, [phases]);
      await pool.query(`DELETE FROM phase_closure_circuits WHERE phase_id = ANY($1)`, [phases]);
      await pool.query(
        `DELETE FROM document_evaluations WHERE formal_request_document_id IN (SELECT id FROM formal_request_documents WHERE phase_id = ANY($1))`,
        [phases]
      );
      for (const table of ['formal_request_documents', 'payments', 'meetings', 'preliminary_evaluation_forms']) {
        await pool.query(`DELETE FROM ${table} WHERE phase_id = ANY($1)`, [phases]);
      }
      await pool.query(`DELETE FROM phases WHERE id = ANY($1)`, [phases]);
    }
    if (assets.length) await pool.query(`DELETE FROM upload_assets WHERE id = ANY($1)`, [assets]);
    if (requests.length) {
      await pool.query(`DELETE FROM certificates WHERE request_id = ANY($1)`, [requests]);
      await pool.query(`DELETE FROM dg_circuit_documents WHERE request_id = ANY($1)`, [requests]);
      await pool.query(`DELETE FROM requests WHERE id = ANY($1)`, [requests]);
    }
    if (created.applicants.length) await pool.query(`DELETE FROM applicants WHERE id = ANY($1)`, [created.applicants]);
    if (created.organisations.length) await pool.query(`DELETE FROM organisations WHERE id = ANY($1)`, [created.organisations]);
    if (users.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [users]);
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
  const all = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;

  async function user(): Promise<number> {
    const code = `PC${tag}${++n}`;
    const id = (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Chef de service DN', $2) RETURNING id`, [
      code,
      `${code}@test.local`,
    ])).id as number;
    created.users.push(id);
    return id;
  }

  /** A dossier (request in_progress) with the given phases, all open. */
  async function dossier(codes: PhaseCode[], requestStatus = 'in_progress') {
    const k = `${tag}-${++n}`;
    const actor = await user();
    const org = (await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [`OMA PC ${k}`])).id;
    created.organisations.push(org);
    const applicant = (await one(`INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'Postulant', $2, 'x') RETURNING id`, [org, `pc-${k}@test.local`])).id;
    created.applicants.push(applicant);
    const request = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status) VALUES ($1, $2, $3, 'issuance', $4) RETURNING id`,
      [`DEM-PC-${k}`, applicant, org, requestStatus]
    )).id as number;
    created.requests.push(request);
    const phase = {} as Record<PhaseCode, number>;
    for (const code of codes) {
      phase[code] = (await one(`INSERT INTO phases (request_id, phase_code) VALUES ($1, $2) RETURNING id`, [request, code])).id;
      created.phases.push(phase[code]);
    }
    return { actor, request, phase };
  }

  async function meeting(phaseId: number, type: 'preliminary' | 'formal', status: 'held' | 'scheduled', agent: number) {
    await pool.query(
      `INSERT INTO meetings (phase_id, meeting_type, dn_agent_id, scheduled_at, status, confirmation_status, confirmed_at)
       VALUES ($1, $2, $3, now() - make_interval(mins => $4), $5, 'confirmed', now())`,
      [phaseId, type, agent, ++n, status]
    );
  }

  /** M3 readiness pieces; defaults to ready. */
  async function prepareM3(d: { request: number; phase: Record<PhaseCode, number>; actor: number }, o: { meeting?: 'held' | 'scheduled' | null; declaration?: boolean; dgReturn?: string | null } = {}) {
    const m = o.meeting === undefined ? 'held' : o.meeting;
    if (m) await meeting(d.phase.M3, 'preliminary', m, d.actor);
    if (o.declaration ?? true) {
      await pool.query(`INSERT INTO preliminary_evaluation_forms (phase_id, submitted_file_url, submitted_at) VALUES ($1, '/api/files/1', now())`, [d.phase.M3]);
    }
    const dgReturn = o.dgReturn === undefined ? 'pending_review' : o.dgReturn;
    if (dgReturn) await pool.query(`INSERT INTO dg_circuit_documents (entity_type, request_id, status) VALUES ('pre_evaluation', $1, $2)`, [d.request, dgReturn]);
  }

  const SLOTS = [
    'form_dn_air_r2_3_f_e_010', 'form_dn_air_r2_3_f_e_012_personnel', 'certification_personnel_list', 'maintenance_procedures_manual',
    'quality_manual', 'sms_manual', 'capability_list', 'training_program', 'subcontractor_contracts', 'technical_documents',
    'compliance_statement_011',
  ];

  /** M4 readiness pieces; defaults to ready. Returns the document ids. */
  async function prepareM4(d: { request: number; phase: Record<PhaseCode, number>; actor: number }, o: { letter?: string | null; missingSlot?: boolean; meeting?: 'held' | 'scheduled' } = {}) {
    const letter = o.letter === undefined ? 'pending_review' : o.letter;
    if (letter) await pool.query(`INSERT INTO dg_circuit_documents (entity_type, request_id, status) VALUES ('formal_request_letter', $1, $2)`, [d.request, letter]);
    const ids: number[] = [];
    for (const [i, slot] of SLOTS.entries()) {
      const missing = o.missingSlot && i === 0;
      ids.push((await one(
        `INSERT INTO formal_request_documents (phase_id, slot, status, file_url, submitted_at) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [d.phase.M4, slot, missing ? 'missing' : 'submitted', missing ? null : '/api/files/1', missing ? null : new Date().toISOString()]
      )).id);
    }
    await meeting(d.phase.M4, 'formal', o.meeting ?? 'held', d.actor);
    return ids;
  }

  /** A real upload_assets row uploaded by `userId`. */
  async function asset(userId: number, onDisk = false): Promise<PreparedAttachment> {
    const storageKey = `phase-closure-test/${tag}-${++n}.pdf`;
    if (onDisk) {
      const full = path.join(uploadsRoot, storageKey);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, '%PDF-1.4 test');
    }
    const { id } = await one(
      `INSERT INTO upload_assets (file_url, storage_key, original_name, mime_type, size_bytes, uploaded_by_user_id, uploaded_from_app)
       VALUES ('pending', $1, 'cloture.pdf', 'application/pdf', 13, $2, 'admin') RETURNING id`,
      [storageKey, userId]
    );
    created.assets.push(id);
    const fileUrl = `/api/files/${id}`;
    await pool.query(`UPDATE upload_assets SET file_url = $1 WHERE id = $2`, [fileUrl, id]);
    return { assetId: id, fileUrl, mimeType: 'application/pdf', originalName: 'cloture.pdf', sizeBytes: 4, uploadedByUserId: userId, actor: { kind: 'staff', userId } };
  }

  /** A request to the mounted routes as staff (roles) or as an applicant. */
  async function http(
    method: 'GET' | 'POST',
    url: string,
    as: { userId: number; roles: string[] } | { applicantId: number },
    body?: unknown
  ) {
    const cookie =
      'roles' in as
        ? `${cookies.staff}=${jwt.signAccessToken({ kind: 'staff', userId: as.userId, employeeCode: `E${as.userId}`, roles: as.roles })}`
        : `${cookies.applicant}=${jwt.signApplicantAccessToken({ kind: 'applicant', applicantId: as.applicantId, organisationId: 1, email: 'x@test.local' })}`;
    const response = await fetch(`${baseUrl}${url}`, {
      method,
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let json: Record<string, any> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: response.status, json };
  }

  /** M3, M4 and M5 all business-ready (M5 evaluations of the M4 documents validated). */
  async function readyM3M4M5() {
    const d = await dossier(['M3', 'M4', 'M5']);
    await prepareM3(d);
    const docs = await prepareM4(d);
    for (const doc of docs) await pool.query(`INSERT INTO document_evaluations (formal_request_document_id, verdict) VALUES ($1, 'validated')`, [doc]);
    await pool.query(`INSERT INTO payments (phase_id, status) VALUES ($1, 'validated')`, [d.phase.M5]);
    return d;
  }

  const phaseRow = (id: number) => one(`SELECT status, closed_at, closure_document_url FROM phases WHERE id = $1`, [id]);
  const closureRows = (phaseId: number) => all(`SELECT * FROM phase_closure_circuits WHERE phase_id = $1`, [phaseId]);
  const closureAudits = (request: number) =>
    all(
      `SELECT action, module, entity_id, request_id, details FROM audit_logs
       WHERE request_id = $1 AND (action LIKE 'PHASE_CLOSURE_%' OR action = 'PHASE_CLOSED') ORDER BY id`,
      [request]
    );
  const versions = (phaseId: number) =>
    all(
      `SELECT file_url, is_current, trashed_at FROM document_versions WHERE owner_type = 'phase_closure_document' AND owner_id = $1 ORDER BY id`,
      [phaseId]
    );
  const assetLink = (assetId: number) => one(`SELECT linked_owner_type, linked_owner_id FROM upload_assets WHERE id = $1`, [assetId]);

  /** A ready M3 whose closure courrier is deposited and in the circuit. */
  async function inCircuit() {
    const d = await dossier(['M3']);
    await prepareM3(d);
    const draft = await asset(d.actor);
    const started = await closure.startPhaseClosure(d.phase.M3, d.actor, draft);
    await closure.markPhaseClosureInCircuit(started.id, d.actor);
    return { ...d, draft, closureId: started.id as number };
  }

  describe('start', () => {
    it('ready phase: closure submitted, phase still open, draft versioned and linked, PHASE_CLOSURE_CREATED on the dossier', async () => {
      const d = await dossier(['M3']);
      await prepareM3(d);
      const draft = await asset(d.actor);
      const view = await closure.startPhaseClosure(d.phase.M3, d.actor, draft);

      assert.equal(view.status, 'submitted');
      assert.equal(view.phaseId, d.phase.M3);
      assert.equal(view.requestId, d.request);
      assert.equal(view.draftDocumentUrl, draft.fileUrl);
      assert.equal(view.signedDocumentUrl, null);
      assert.equal(view.signatureSentAt, null);
      assert.equal(view.signedAt, null);
      assert.match(view.submittedAt, /^\d{4}-\d\d-\d\dT/);
      assert.deepEqual(Object.keys(view).sort(), [
        'draftDocumentUrl', 'id', 'phaseId', 'requestId', 'signatureSentAt', 'signedAt', 'signedDocumentUrl', 'status', 'submittedAt',
      ]);

      assert.equal((await phaseRow(d.phase.M3)).status, 'open');
      const [row] = await closureRows(d.phase.M3);
      assert.equal(row.created_by, d.actor);
      assert.deepEqual(await versions(d.phase.M3), [{ file_url: draft.fileUrl, is_current: true, trashed_at: null }]);
      assert.deepEqual(await assetLink(draft.assetId), { linked_owner_type: 'phase_closure_document', linked_owner_id: d.phase.M3 });
      assert.deepEqual(await closureAudits(d.request), [
        {
          action: 'PHASE_CLOSURE_CREATED',
          module: 'M3',
          entity_id: view.id,
          request_id: d.request,
          details: { phaseId: d.phase.M3, phaseCode: 'M3', requestId: d.request },
        },
      ]);
      assert.deepEqual(await closure.getPhaseClosure(d.phase.M3), view);
    });

    it('not ready: the precise readiness refusal, nothing written', async () => {
      const d = await dossier(['M3']);
      await prepareM3(d, { meeting: 'scheduled' });
      const draft = await asset(d.actor);
      await assert.rejects(closure.startPhaseClosure(d.phase.M3, d.actor, draft), { message: 'MEETING_NOT_RESOLVED' });
      assert.deepEqual(await closureRows(d.phase.M3), []);
      assert.deepEqual(await versions(d.phase.M3), []);
      assert.equal((await assetLink(draft.assetId)).linked_owner_type, null);
      assert.deepEqual(await closureAudits(d.request), []);
    });

    it('second courrier: PHASE_CLOSURE_ALREADY_EXISTS; the same file again returns the same circuit', async () => {
      const d = await dossier(['M3']);
      await prepareM3(d);
      const draft = await asset(d.actor);
      const first = await closure.startPhaseClosure(d.phase.M3, d.actor, draft);
      await assert.rejects(closure.startPhaseClosure(d.phase.M3, d.actor, await asset(d.actor)), { message: 'PHASE_CLOSURE_ALREADY_EXISTS' });
      assert.deepEqual(await closure.startPhaseClosure(d.phase.M3, d.actor, draft), first);
      assert.equal((await closureRows(d.phase.M3)).length, 1);
      assert.equal((await closureAudits(d.request)).length, 1);
    });

    it('closed phase: PHASE_ALREADY_CLOSED (historical closures get no circuit)', async () => {
      const d = await dossier(['M3']);
      await prepareM3(d);
      await pool.query(`UPDATE phases SET status = 'closed', closed_at = now(), closure_document_url = '/api/files/9' WHERE id = $1`, [d.phase.M3]);
      await assert.rejects(closure.startPhaseClosure(d.phase.M3, d.actor, await asset(d.actor)), { message: 'PHASE_ALREADY_CLOSED' });
      assert.equal(await closure.getPhaseClosure(d.phase.M3), null);
      assert.equal((await phaseRow(d.phase.M3)).closure_document_url, '/api/files/9');
    });

    it('M6 and M7: PHASE_CLOSURE_NOT_SUPPORTED (deferred to Inspection V2 / Delivery)', async () => {
      const d = await dossier(['M6', 'M7']);
      for (const code of ['M6', 'M7'] as const) {
        await assert.rejects(closure.startPhaseClosure(d.phase[code], d.actor, await asset(d.actor)), { message: 'PHASE_CLOSURE_NOT_SUPPORTED' }, code);
      }
    });

    it('closed dossier: DOSSIER_CLOSED; unknown phase: PHASE_NOT_FOUND', async () => {
      const d = await dossier(['M3'], 'cancelled');
      await prepareM3(d);
      await assert.rejects(closure.startPhaseClosure(d.phase.M3, d.actor, await asset(d.actor)), { message: 'DOSSIER_CLOSED' });
      await assert.rejects(closure.getPhaseClosure(2_000_000_000), { message: 'PHASE_NOT_FOUND' });
    });

    it('two concurrent starts on one phase: exactly one circuit, the other PHASE_CLOSURE_ALREADY_EXISTS', async () => {
      const d = await dossier(['M3']);
      await prepareM3(d);
      const [a, b] = [await asset(d.actor), await asset(d.actor)];
      const results = await Promise.allSettled([
        closure.startPhaseClosure(d.phase.M3, d.actor, a),
        closure.startPhaseClosure(d.phase.M3, d.actor, b),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      const rejected = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      assert.equal(rejected?.reason.message, 'PHASE_CLOSURE_ALREADY_EXISTS');
      assert.equal((await closureRows(d.phase.M3)).length, 1);
      assert.equal((await versions(d.phase.M3)).filter((v) => v.is_current).length, 1);
    });
  });

  describe('signature circuit', () => {
    it('submitted -> in_signature_circuit: signatureSentAt set, phase open, PHASE_CLOSURE_SENT_TO_DG', async () => {
      const d = await dossier(['M3']);
      await prepareM3(d);
      const started = await closure.startPhaseClosure(d.phase.M3, d.actor, await asset(d.actor));
      const view = await closure.markPhaseClosureInCircuit(started.id, d.actor);
      assert.equal(view.status, 'in_signature_circuit');
      assert.ok(view.signatureSentAt);
      assert.equal((await phaseRow(d.phase.M3)).status, 'open');
      assert.deepEqual((await closureAudits(d.request)).map((a) => a.action), ['PHASE_CLOSURE_CREATED', 'PHASE_CLOSURE_SENT_TO_DG']);
    });

    it('invalid transitions: in-circuit twice, return before the circuit, unknown circuit', async () => {
      const d = await dossier(['M3']);
      await prepareM3(d);
      const started = await closure.startPhaseClosure(d.phase.M3, d.actor, await asset(d.actor));
      await assert.rejects(closure.recordPhaseClosureReturn(started.id, d.actor, await asset(d.actor)), { message: 'INVALID_PHASE_CLOSURE_TRANSITION' });
      await closure.markPhaseClosureInCircuit(started.id, d.actor);
      await assert.rejects(closure.markPhaseClosureInCircuit(started.id, d.actor), { message: 'INVALID_PHASE_CLOSURE_TRANSITION' });
      await assert.rejects(closure.markPhaseClosureInCircuit(2_000_000_000, d.actor), { message: 'PHASE_CLOSURE_NOT_FOUND' });
      assert.equal((await phaseRow(d.phase.M3)).status, 'open');
    });
  });

  describe('signed return', () => {
    it('closes the phase atomically: one timestamp, closure document, versions and the four audits on the dossier', async () => {
      const d = await inCircuit();
      const signed = await asset(d.actor);
      const view = await closure.recordPhaseClosureReturn(d.closureId, d.actor, signed);

      assert.equal(view.status, 'signed_returned');
      assert.equal(view.signedDocumentUrl, signed.fileUrl);
      const phase = await phaseRow(d.phase.M3);
      assert.equal(phase.status, 'closed');
      assert.ok(phase.closed_at);
      assert.equal(phase.closure_document_url, signed.fileUrl);
      const [row] = await closureRows(d.phase.M3);
      assert.equal(row.signed_at.getTime(), phase.closed_at.getTime());

      // Draft kept in the trash (history), signed return current; both on the phase's closure owner.
      const history = await versions(d.phase.M3);
      assert.deepEqual(history.map((v) => [v.file_url, v.is_current, v.trashed_at !== null]), [
        [d.draft.fileUrl, false, true],
        [signed.fileUrl, true, false],
      ]);
      assert.deepEqual(await assetLink(signed.assetId), { linked_owner_type: 'phase_closure_document', linked_owner_id: d.phase.M3 });

      const details = { phaseId: d.phase.M3, phaseCode: 'M3', requestId: d.request };
      assert.deepEqual(await closureAudits(d.request), [
        { action: 'PHASE_CLOSURE_CREATED', module: 'M3', entity_id: d.closureId, request_id: d.request, details },
        { action: 'PHASE_CLOSURE_SENT_TO_DG', module: 'M3', entity_id: d.closureId, request_id: d.request, details },
        { action: 'PHASE_CLOSURE_RETURNED', module: 'M3', entity_id: d.closureId, request_id: d.request, details },
        { action: 'PHASE_CLOSED', module: 'M3', entity_id: d.phase.M3, request_id: d.request, details: { ...details, closureId: d.closureId } },
      ]);
      // Closing a phase never completes the dossier.
      assert.equal((await one(`SELECT status FROM requests WHERE id = $1`, [d.request])).status, 'in_progress');

      // Retry with the same file: same result, nothing new; any other step is refused.
      assert.deepEqual(await closure.recordPhaseClosureReturn(d.closureId, d.actor, signed), view);
      assert.equal((await closureAudits(d.request)).length, 4);
      await assert.rejects(closure.recordPhaseClosureReturn(d.closureId, d.actor, await asset(d.actor)), { message: 'INVALID_PHASE_CLOSURE_TRANSITION' });
      await assert.rejects(closure.markPhaseClosureInCircuit(d.closureId, d.actor), { message: 'INVALID_PHASE_CLOSURE_TRANSITION' });
    });

    it('a failure at the last write leaves no partial result', async () => {
      const d = await inCircuit();
      const signed = await asset(d.actor);
      const name = `pc_fail_${tag}_${++n}`;
      await pool.query(`CREATE FUNCTION ${name}() RETURNS trigger AS $$ BEGIN
        IF NEW.action = 'PHASE_CLOSED' AND NEW.request_id = ${d.request} THEN RAISE EXCEPTION 'injected failure'; END IF;
        RETURN NEW; END $$ LANGUAGE plpgsql`);
      await pool.query(`CREATE TRIGGER ${name} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION ${name}()`);
      try {
        await assert.rejects(closure.recordPhaseClosureReturn(d.closureId, d.actor, signed));
      } finally {
        await pool.query(`DROP TRIGGER ${name} ON audit_logs`);
        await pool.query(`DROP FUNCTION ${name}()`);
      }
      const [row] = await closureRows(d.phase.M3);
      assert.equal(row.status, 'in_signature_circuit');
      assert.equal(row.signed_document_url, null);
      assert.deepEqual(await phaseRow(d.phase.M3), { status: 'open', closed_at: null, closure_document_url: null });
      assert.deepEqual((await versions(d.phase.M3)).map((v) => [v.file_url, v.is_current]), [[d.draft.fileUrl, true]]);
      assert.equal((await assetLink(signed.assetId)).linked_owner_type, null);
      assert.deepEqual((await closureAudits(d.request)).map((a) => a.action), ['PHASE_CLOSURE_CREATED', 'PHASE_CLOSURE_SENT_TO_DG']);
    });

    it('the draft sent back as the signed return is refused', async () => {
      const d = await inCircuit();
      await assert.rejects(closure.recordPhaseClosureReturn(d.closureId, d.actor, d.draft), { message: 'UPLOAD_ASSET_ALREADY_LINKED' });
      assert.equal((await phaseRow(d.phase.M3)).status, 'open');
    });
  });

  describe('readiness policy (current M3/M4/M5 rules, unchanged)', () => {
    const ready = (phaseId: number, request: number, phaseCode: string) =>
      policy.assertPhaseReadyForClosure(db, { id: phaseId, requestId: request, phaseCode });

    it('M3: meeting resolved, declaration returned, its DG circuit back (pending_review)', async () => {
      const cases: Array<[Parameters<typeof prepareM3>[1], string | null]> = [
        [{ meeting: null }, 'MEETING_NOT_RESOLVED'],
        [{ meeting: 'scheduled' }, 'MEETING_NOT_RESOLVED'],
        [{ declaration: false }, 'DECLARATION_NOT_SUBMITTED'],
        [{ dgReturn: null }, 'PRELIMINARY_DG_RETURN_REQUIRED'],
        [{ dgReturn: 'in_signature_circuit' }, 'PRELIMINARY_DG_RETURN_REQUIRED'],
        [{}, null],
      ];
      for (const [options, error] of cases) {
        const d = await dossier(['M3']);
        await prepareM3(d, options);
        const check = ready(d.phase.M3, d.request, 'M3');
        if (error) await assert.rejects(check, { message: error }, JSON.stringify(options));
        else await check;
      }
    });

    it('M4: letter transmitted, no missing document, formal meeting resolved', async () => {
      const cases: Array<[Parameters<typeof prepareM4>[1], string | null]> = [
        [{ letter: null }, 'LETTER_NOT_TRANSMITTED'],
        [{ letter: 'signed' }, 'LETTER_NOT_TRANSMITTED'],
        [{ missingSlot: true }, 'DOCUMENTS_INCOMPLETE'],
        [{ meeting: 'scheduled' }, 'MEETING_NOT_RESOLVED'],
        [{}, null],
      ];
      for (const [options, error] of cases) {
        const d = await dossier(['M4']);
        await prepareM4(d, options);
        const check = ready(d.phase.M4, d.request, 'M4');
        if (error) await assert.rejects(check, { message: error }, JSON.stringify(options));
        else await check;
      }
    });

    it('M5: payment validated, every M4 document evaluation validated', async () => {
      for (const [payment, verdict, error] of [
        [null, 'validated', 'PAYMENT_NOT_VALIDATED'],
        ['pending_validation', 'validated', 'PAYMENT_NOT_VALIDATED'],
        ['validated', null, 'DOCUMENTS_NOT_ALL_VALIDATED'],
        ['validated', 'validated', null],
      ] as const) {
        const d = await dossier(['M4', 'M5']);
        const [doc] = await prepareM4(d);
        await pool.query(`INSERT INTO document_evaluations (formal_request_document_id, verdict) VALUES ($1, $2)`, [doc, verdict]);
        if (payment) await pool.query(`INSERT INTO payments (phase_id, status) VALUES ($1, $2)`, [d.phase.M5, payment]);
        const check = ready(d.phase.M5, d.request, 'M5');
        if (error) await assert.rejects(check, { message: error }, `${payment}/${verdict}`);
        else await check;
      }
    });
  });

  describe('WORKFLOW-FOUNDATION-1B - the direct close routes are retired', () => {
    it('M3, M4, M5 business-ready: each legacy close answers PHASE_CLOSURE_WORKFLOW_REQUIRED and closes nothing', async () => {
      const d = await readyM3M4M5();
      const supervisor = { userId: d.actor, roles: ['dn_supervisor'] };
      const legacy: Array<[PhaseCode, string]> = [
        ['M3', `/api/phases/${d.phase.M3}/close`],
        ['M4', `/api/formal-request/phases/${d.phase.M4}/close`],
        ['M5', `/api/deep-evaluation/phases/${d.phase.M5}/close`],
      ];
      for (const [code, url] of legacy) {
        // With the old optional file and note: still nothing.
        const response = await http('POST', url, supervisor, { closureNote: 'x', closureDocumentUploadAssetId: (await asset(d.actor, true)).assetId });
        assert.equal(response.status, 409, code);
        assert.equal(response.json?.code, 'PHASE_CLOSURE_WORKFLOW_REQUIRED', code);
        assert.match(response.json?.message, /courrier de clôture/, code);
        assert.deepEqual(await phaseRow(d.phase[code]), { status: 'open', closed_at: null, closure_document_url: null }, code);
        assert.deepEqual(await closureRows(d.phase[code]), [], code);
      }
      assert.deepEqual(await closureAudits(d.request), []);
    });
  });

  describe('WORKFLOW-FOUNDATION-1B - read model', () => {
    it('readiness comes from the policy: blocker wording while not ready, then the courrier replaces it', async () => {
      const d = await dossier(['M4']);
      await prepareM4(d, { missingSlot: true });
      const blocked = await closure.getPhaseClosureState(d.phase.M4);
      assert.deepEqual(blocked, {
        phaseId: d.phase.M4,
        phaseStatus: 'open',
        closure: null,
        readiness: {
          ready: false,
          blockerCode: 'DOCUMENTS_INCOMPLETE',
          blockerMessage: 'Les 11 documents doivent tous être soumis avant de clôturer la phase.',
        },
      });
      await pool.query(`UPDATE formal_request_documents SET status = 'submitted' WHERE phase_id = $1`, [d.phase.M4]);
      assert.deepEqual((await closure.getPhaseClosureState(d.phase.M4)).readiness, { ready: true, blockerCode: null, blockerMessage: null });
      await closure.startPhaseClosure(d.phase.M4, d.actor, await asset(d.actor));
      const deposited = await closure.getPhaseClosureState(d.phase.M4);
      assert.equal(deposited.closure.status, 'submitted');
      assert.equal(deposited.readiness, null);
      // Neutral progress for the portal's phase bundle.
      assert.equal((await formal.getBundleForRequest(d.request, 'applicant')).phase.closureInProgress, true);
    });
  });

  describe('WORKFLOW-FOUNDATION-1B - end to end through /courriers, with the file route', () => {
    it('supervisor deposits; Réception / Assistant DG open, circuit and return it; the phase closes; access stays narrow', async () => {
      const d = await readyM3M4M5();
      const supervisor = { userId: d.actor, roles: ['dn_supervisor'] };
      const reception = { userId: await user(), roles: ['reception'] };
      const assistantDg = { userId: await user(), roles: ['assistant_dg'] };
      const applicant = { applicantId: (await one(`SELECT applicant_id FROM requests WHERE id = $1`, [d.request])).applicant_id };

      // RBAC on the deposit: dn_agent refused, dn_supervisor accepted.
      const draft = await asset(d.actor, true);
      assert.equal((await http('POST', `/api/phase-closures/phases/${d.phase.M4}`, { userId: d.actor, roles: ['dn_agent'] }, { uploadAssetId: draft.assetId })).status, 403);
      const deposit = await http('POST', `/api/phase-closures/phases/${d.phase.M4}`, supervisor, { uploadAssetId: draft.assetId });
      assert.equal(deposit.status, 201);
      const closureId = deposit.json?.id;

      // The courrier queue: business label data (phase code, never a raw label), print action.
      const queue = await http('GET', '/api/courrier-tasks?source=phase_closure', reception);
      const task = queue.json?.items.find((item: { id: string }) => item.id === `phase_closure:${closureId}`);
      assert.ok(task);
      assert.equal(task.source, 'phase_closure');
      assert.equal(task.phaseCode, 'M4');
      assert.equal(task.bucket, 'to_print');
      assert.deepEqual(task.availableActions, ['print', 'confirm_signature_circuit']);
      assert.equal(task.fileUrl, draft.fileUrl);
      assert.equal(task.requestReference, (await one(`SELECT reference FROM requests WHERE id = $1`, [d.request])).reference);

      // The draft: Réception and Assistant DG may open it; the applicant and unrelated staff may not.
      assert.equal((await http('GET', `/api/files/${draft.assetId}`, reception)).status, 200);
      assert.equal((await http('GET', `/api/files/${draft.assetId}`, assistantDg)).status, 200);
      assert.equal((await http('GET', `/api/files/${draft.assetId}`, { userId: d.actor, roles: ['s5_agent'] })).status, 404);
      assert.equal((await http('GET', `/api/files/${draft.assetId}`, { userId: d.actor, roles: ['assistant_dn'] })).status, 404);
      assert.equal((await http('GET', `/api/files/${draft.assetId}`, applicant)).status, 404);
      assert.equal((await http('GET', `/api/files/${draft.assetId}`, supervisor)).status, 200);

      // Mise en circuit by Réception; the DN cannot run the circuit.
      assert.equal((await http('POST', `/api/courrier-tasks/phase_closure:${closureId}/confirm-printed-for-signature`, supervisor)).status, 403);
      const sent = await http('POST', `/api/courrier-tasks/phase_closure:${closureId}/confirm-printed-for-signature`, reception);
      assert.equal(sent.status, 200);
      assert.equal(sent.json?.bucket, 'with_dg');
      assert.deepEqual(sent.json?.availableActions, ['upload_signed_return']);
      // A second mise en circuit is a clear domain refusal, never a 500.
      const again = await http('POST', `/api/courrier-tasks/phase_closure:${closureId}/confirm-printed-for-signature`, reception);
      assert.equal(again.status, 409);
      assert.equal(again.json?.code, 'INVALID_PHASE_CLOSURE_TRANSITION');
      assert.equal((await phaseRow(d.phase.M4)).status, 'open');

      // Signed return scanned by the Assistant DG: the phase closes.
      const signed = await asset(assistantDg.userId, true);
      const returned = await http('POST', `/api/courrier-tasks/phase_closure:${closureId}/return-signed`, assistantDg, { uploadAssetId: signed.assetId });
      assert.equal(returned.status, 200);
      assert.equal(returned.json?.bucket, 'returned');
      assert.equal(returned.json?.circuitStatus, 'signed_returned');
      assert.equal(returned.json?.fileUrl, signed.fileUrl);
      const phase = await phaseRow(d.phase.M4);
      assert.equal(phase.status, 'closed');
      assert.equal(phase.closure_document_url, signed.fileUrl);
      assert.deepEqual((await closureAudits(d.request)).map((a) => a.action), [
        'PHASE_CLOSURE_CREATED',
        'PHASE_CLOSURE_SENT_TO_DG',
        'PHASE_CLOSURE_RETURNED',
        'PHASE_CLOSED',
      ]);

      // After the return: DN and the circuit roles keep it (operational history); the applicant never.
      for (const as of [supervisor, reception, assistantDg]) assert.equal((await http('GET', `/api/files/${signed.assetId}`, as)).status, 200);
      assert.equal((await http('GET', `/api/files/${signed.assetId}`, applicant)).status, 404);
      assert.equal((await http('GET', `/api/files/${signed.assetId}`, { userId: d.actor, roles: ['r3_agent'] })).status, 404);
      const context = await fileContext.resolveAssetContext(
        { id: signed.assetId, storageKey: 'x', linkedOwnerType: 'phase_closure_document', linkedOwnerId: d.phase.M4, uploadedByUserId: null, uploadedByApplicantId: null },
        fileContext.createDbFileContextStore(db)
      );
      assert.equal(context.closureCourrier, true);
    });

    it('a historical closure file (phase closed before the courrier existed) stays DN-only', async () => {
      const d = await dossier(['M3']);
      const old = await asset(d.actor, true);
      await pool.query(`UPDATE upload_assets SET linked_owner_type = 'phase_closure_document', linked_owner_id = $1 WHERE id = $2`, [d.phase.M3, old.assetId]);
      await pool.query(`UPDATE phases SET status = 'closed', closed_at = now(), closure_document_url = $1 WHERE id = $2`, [old.fileUrl, d.phase.M3]);
      assert.equal((await http('GET', `/api/files/${old.assetId}`, { userId: d.actor, roles: ['reception'] })).status, 404);
      assert.equal((await http('GET', `/api/files/${old.assetId}`, { userId: d.actor, roles: ['dn_agent'] })).status, 200);
    });
  });

  describe('WORKFLOW-FOUNDATION-1B - Demandes cockpit next action', () => {
    it('ready → Courrier de clôture à déposer (Chef de service DN); deposited → à mettre en circuit (Réception)', async () => {
      const d = await dossier(['M3']);
      await prepareM3(d);
      const item = async () => (await requestsSvc.listRequestCockpit()).items.find((i: { id: number }) => i.id === d.request);
      const ready = await item();
      assert.equal(ready.nextActionLabel, 'Courrier de clôture à déposer');
      assert.equal(ready.nextActionOwner.label, 'Chef de service DN');
      await closure.startPhaseClosure(d.phase.M3, d.actor, await asset(d.actor));
      const deposited = await item();
      assert.equal(deposited.nextActionLabel, 'Courrier de clôture à mettre en circuit');
      assert.equal(deposited.nextActionOwner.label, 'Réception');
    });
  });

  describe('known transitional exceptions (not on the closure courrier yet)', () => {
    // M6 auto-closes on the R3 verdict (site-inspection/verdict-atomic.db.test.ts)
    // until Inspection V2 replaces the phase.
    it('M7: collecting the certificate closes M7 and completes the dossier, with no courrier', async () => {
      const d = await dossier(['M7']);
      const certificate = (await one(
        `INSERT INTO certificates (request_id, reference, certificate_type, status) VALUES ($1, $2, 'agreement', 'notified') RETURNING id`,
        [d.request, `CERT-PC-${tag}-${++n}`.slice(0, 30)]
      )).id;
      await certificatesSvc.markCollected(certificate, d.actor);
      assert.equal((await phaseRow(d.phase.M7)).status, 'closed');
      assert.equal((await one(`SELECT status FROM requests WHERE id = $1`, [d.request])).status, 'completed');
      assert.equal(await closure.getPhaseClosure(d.phase.M7), null);
    });
  });
});

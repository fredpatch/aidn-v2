/** SESSION1-M1-1 - the Directeur DN annotation circuit between the DG return
 *  and M3. Real PostgreSQL and real files under uploads/, skipped without
 *  DATABASE_URL (needs a migrated, disposable database). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';
const here = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = path.resolve(here, '../../../uploads');

describe('SESSION1-M1-1 Directeur DN annotation circuit (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let closeAppPool: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: Record<string, any>;
  const tag = Date.now().toString(36);
  const createdAssetIds: number[] = [];
  const startedAt = new Date(Date.now() - 1000);
  let n = 0;

  before(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const [courrier, dn, requests, phases, uploads, attach, alertJob, backfill, dbModule] = await Promise.all([
      import('../courrier-tasks/courrier-tasks.service.js'),
      import('./dn-annotation.service.js'),
      import('../requests/requests.service.js'),
      import('../phases/phases.service.js'),
      import('../uploads/asset-registration.js'),
      import('../uploads/upload-attachment.js'),
      import('../../jobs/dg-circuit-alert.job.js'),
      import('./dn-annotation.backfill.js'),
      import('../../shared/db/index.js'),
    ]);
    m = { courrier, dn, requests, phases, uploads, attach, alertJob, backfill, db: dbModule.db };
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    // Remove the files this test wrote (assets may have been relocated).
    const { rows } = await pool.query('SELECT storage_key FROM upload_assets WHERE id = ANY($1)', [createdAssetIds]);
    for (const row of rows) fs.rmSync(path.join(UPLOADS_ROOT, row.storage_key), { force: true });
    const copies = await pool.query(`SELECT storage_key FROM upload_assets WHERE module_hint = 'dn-annotation' AND created_at >= $1`, [startedAt]);
    for (const row of copies.rows) fs.rmSync(path.join(UPLOADS_ROOT, row.storage_key), { force: true });
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];

  /** A real staged upload (file on disk + upload_assets row) as a prepared attachment. */
  async function upload(userId: number, label: string) {
    const key = `staging/m11-${tag}-${++n}-${label}.pdf`;
    const full = path.join(UPLOADS_ROOT, key);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, `%PDF-1.4 ${label}`);
    const { id } = await m.uploads.insertAssetWithAddress(m.db, {
      storageKey: key,
      originalName: `${label}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 20,
      uploadedFromApp: 'admin',
      uploadedByUserId: userId,
    });
    createdAssetIds.push(id);
    return m.attach.prepareUploadAttachment(id, { kind: 'staff', userId });
  }

  /** An intake dossier whose DG circuit is in signature, with its deposit document. */
  async function dossierInDgCircuit(opts: { requestStatus?: string } = {}) {
    const k = `${tag}${++n}`;
    const user = (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Assistante M11', $2) RETURNING id`, [`M11${k}`, `m11-${k}@t.local`])).id;
    const org = (await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [`OMA M11 ${k}`])).id;
    const applicant = (await one(`INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'P', $2, 'x') RETURNING id`, [org, `p-${k}@t.local`])).id;
    const request = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status)
       VALUES ($1, $2, $3, 'issuance', $4) RETURNING id`,
      [`DEM-M11-${k}`, applicant, org, opts.requestStatus ?? 'submitted']
    )).id;
    const circuit = (await one(
      `INSERT INTO dg_circuit_documents (entity_type, request_id, status, signature_sent_at)
       VALUES ('intake_request', $1, 'in_signature_circuit', now()) RETURNING id`,
      [request]
    )).id;
    const deposit = await upload(user, 'depot');
    await pool.query(
      `INSERT INTO document_versions (owner_type, owner_id, file_url, mime_type, is_current) VALUES ('dg_circuit_document', $1, $2, 'application/pdf', true)`,
      [circuit, deposit.fileUrl]
    );
    return { user, request, circuit };
  }

  const requestStatus = async (id: number) => (await one(`SELECT status FROM requests WHERE id = $1`, [id])).status;
  const circuitOf = (request: number, type: string) =>
    one(`SELECT * FROM dg_circuit_documents WHERE request_id = $1 AND entity_type = $2`, [request, type]);
  const versionsOf = async (circuitId: number) =>
    (await pool.query(
      `SELECT file_url, is_current, trashed_at IS NOT NULL AS trashed FROM document_versions
       WHERE owner_type = 'dg_circuit_document' AND owner_id = $1 ORDER BY id`,
      [circuitId]
    )).rows;
  const auditActions = async (request: number) =>
    (await pool.query(`SELECT action FROM audit_logs WHERE request_id = $1 ORDER BY id`, [request])).rows.map((r) => r.action);
  const dnCount = async (request: number) =>
    (await one(`SELECT count(*)::int AS c FROM dg_circuit_documents WHERE request_id = $1 AND entity_type = 'dn_director_annotation'`, [request])).c;

  describe('DG return', () => {
    it('courrier path: finalizes the DG circuit, creates ONE Directeur DN circuit, does not unlock M3', async () => {
      const d = await dossierInDgCircuit();
      const dgReturn = await upload(d.user, 'annote-dg');
      await m.courrier.returnSigned(`intake_request:${d.request}`, dgReturn, d.user);

      assert.equal(await requestStatus(d.request), 'submitted', 'the DG return must not set pending_review');
      assert.equal((await circuitOf(d.request, 'intake_request')).status, 'pending_review');
      const dn = await circuitOf(d.request, 'dn_director_annotation');
      assert.equal(dn.status, 'submitted');
      assert.equal(await dnCount(d.request), 1);

      // Distinct chains: DG circuit = deposit (trashed) + DG-annotated (current);
      // DN circuit = its own physical copy of the DG-annotated file.
      const dgVersions = await versionsOf(d.circuit);
      assert.equal(dgVersions.length, 2);
      assert.deepEqual(dgVersions.map((v) => [v.is_current, v.trashed]), [[false, true], [true, false]]);
      const dnVersions = await versionsOf(dn.id);
      assert.equal(dnVersions.length, 1);
      assert.equal(dnVersions[0].is_current, true);
      assert.notEqual(dnVersions[0].file_url, dgVersions[1].file_url, 'copy-on-create: a separate asset');

      const copyAsset = await one(`SELECT * FROM upload_assets WHERE file_url = $1`, [dnVersions[0].file_url]);
      assert.equal(copyAsset.linked_owner_id, dn.id);
      assert.ok(fs.existsSync(path.join(UPLOADS_ROOT, copyAsset.storage_key)), 'the copy exists on disk');

      const actions = await auditActions(d.request);
      assert.ok(actions.includes('DG_ANNOTATION_RETURNED'));
      assert.ok(actions.includes('DN_ANNOTATION_CIRCUIT_CREATED'));
    });

    it('is idempotent: a repeated upload does not duplicate the Directeur DN circuit', async () => {
      const d = await dossierInDgCircuit();
      const dgReturn = await upload(d.user, 'annote-dg-retry');
      await m.courrier.returnSigned(`intake_request:${d.request}`, dgReturn, d.user);
      await m.courrier.returnSigned(`intake_request:${d.request}`, dgReturn, d.user); // double click
      assert.equal(await dnCount(d.request), 1);
      assert.equal((await versionsOf((await circuitOf(d.request, 'dn_director_annotation')).id)).length, 1);
    });

    it('requests.returnSignedFromDg behaves identically to the courrier path', async () => {
      const viaCourrier = await dossierInDgCircuit();
      const viaRequests = await dossierInDgCircuit();
      await m.courrier.returnSigned(`intake_request:${viaCourrier.request}`, await upload(viaCourrier.user, 'a'), viaCourrier.user);
      await m.requests.returnSignedFromDg(viaRequests.request, await upload(viaRequests.user, 'b'), viaRequests.user);

      for (const d of [viaCourrier, viaRequests]) {
        assert.equal(await requestStatus(d.request), 'submitted');
        assert.equal((await circuitOf(d.request, 'intake_request')).status, 'pending_review');
        assert.equal((await circuitOf(d.request, 'dn_director_annotation')).status, 'submitted');
        assert.equal(await dnCount(d.request), 1);
        assert.deepEqual(
          (await auditActions(d.request)).filter((a) => a.startsWith('DG_') || a.startsWith('DN_')),
          ['DN_ANNOTATION_CIRCUIT_CREATED', 'DG_ANNOTATION_RETURNED']
        );
      }
    });

    it('legacy bypass: no intake path sets pending_review any more', async () => {
      assert.equal(m.requests.markSigned, undefined);
      assert.equal(m.requests.markPendingReview, undefined);
      const d = await dossierInDgCircuit();
      // returnSigned on an intake still in "submitted" (not in signature) is refused
      await pool.query(`UPDATE dg_circuit_documents SET status = 'submitted' WHERE id = $1`, [d.circuit]);
      await assert.rejects(m.requests.returnSignedFromDg(d.request, await upload(d.user, 'x'), d.user), /INVALID_CIRCUIT_TRANSITION/);
      assert.equal(await requestStatus(d.request), 'submitted');
    });
  });

  describe('Directeur DN circuit', () => {
    async function dossierAtDnToSend() {
      const d = await dossierInDgCircuit();
      await m.requests.returnSignedFromDg(d.request, await upload(d.user, 'annote-dg'), d.user);
      return { ...d, taskId: `dn_director_annotation:${d.request}` };
    }

    it('send -> return: only the return makes the request pending_review, atomically, keeping both documents', async () => {
      const d = await dossierAtDnToSend();

      // Cannot return before the hand-over, nor hand over twice.
      await assert.rejects(m.dn.returnAnnotated(d.taskId, await upload(d.user, 'trop-tot'), d.user), /INVALID_CIRCUIT_TRANSITION/);
      const sent = await m.dn.sendToDirector(d.taskId, d.user);
      assert.equal(sent.bucket, 'with_director');
      assert.equal(sent.actionKey, 'record_director_annotation');
      assert.deepEqual(sent.availableActions, ['upload_annotated_return']);
      await assert.rejects(m.dn.sendToDirector(d.taskId, d.user), /INVALID_CIRCUIT_TRANSITION/);
      assert.equal(await requestStatus(d.request), 'submitted');

      const returned = await m.dn.returnAnnotated(d.taskId, await upload(d.user, 'annote-directeur'), d.user);
      assert.equal(returned.bucket, 'returned');
      assert.equal(returned.actionKey, 'handed_to_dn');
      assert.deepEqual(returned.availableActions, []);
      assert.equal(await requestStatus(d.request), 'pending_review');
      assert.equal((await circuitOf(d.request, 'dn_director_annotation')).status, 'pending_review');

      // DG-annotated document untouched on the DG circuit; DN circuit keeps the copy (trashed) + the Director return (current).
      const dgCurrent = (await versionsOf(d.circuit)).filter((v) => v.is_current);
      assert.equal(dgCurrent.length, 1);
      const dnVersions = await versionsOf((await circuitOf(d.request, 'dn_director_annotation')).id);
      assert.deepEqual(dnVersions.map((v) => [v.is_current, v.trashed]), [[false, true], [true, false]]);
      assert.notEqual(dnVersions[1].file_url, dgCurrent[0].file_url);

      const actions = await auditActions(d.request);
      for (const a of ['DG_ANNOTATION_RETURNED', 'DN_ANNOTATION_CIRCUIT_CREATED', 'DN_ANNOTATION_SENT_TO_DIRECTOR', 'DN_ANNOTATION_RETURNED']) {
        assert.ok(actions.includes(a), a);
      }
      // A second return is refused (state no longer in circuit).
      await assert.rejects(m.dn.returnAnnotated(d.taskId, await upload(d.user, 'deux'), d.user), /INVALID_CIRCUIT_TRANSITION/);
    });

    it('an invalid or foreign task id is refused; the intake id format is not a DN task', async () => {
      await assert.rejects(m.dn.sendToDirector('intake_request:1', 1), /DN_TASK_INVALID/);
      await assert.rejects(m.dn.sendToDirector('dn_director_annotation:abc', 1), /DN_TASK_INVALID/);
      await assert.rejects(m.dn.sendToDirector('dn_director_annotation:999999999', 1), /DN_TASK_NOT_FOUND/);
    });

    it('lists the task by bucket; a closed dossier offers no action and leaves the pending buckets', async () => {
      const d = await dossierAtDnToSend();
      let list = await m.dn.listDnAnnotationTasks({});
      const task = list.items.find((t: { requestId: number }) => t.requestId === d.request);
      assert.equal(task.bucket, 'to_send');
      assert.equal(task.actionKey, 'send_to_director');
      assert.deepEqual(task.availableActions, ['send_to_director']);
      assert.ok(task.fileUrl, 'carries the copied DG-annotated document');

      await pool.query(`UPDATE requests SET status = 'rejected', rejection_reason = 'test' WHERE id = $1`, [d.request]);
      list = await m.dn.listDnAnnotationTasks({ bucket: 'to_send' });
      assert.ok(!list.items.some((t: { requestId: number }) => t.requestId === d.request));
      const all = await m.dn.listDnAnnotationTasks({});
      const closed = all.items.find((t: { requestId: number }) => t.requestId === d.request);
      assert.equal(closed.bucket, 'inactive');
      assert.deepEqual(closed.availableActions, []);
      assert.equal(closed.dossierClosed, true);
      await assert.rejects(m.dn.sendToDirector(d.taskId, d.user), /DOSSIER_CLOSED/);
    });
  });

  describe('M3 gate', () => {
    async function dnCircuitState(dnStatus: string, reqStatus: string) {
      const d = await dossierInDgCircuit({ requestStatus: reqStatus });
      await pool.query(`UPDATE dg_circuit_documents SET status = 'pending_review', pending_review_at = now() WHERE id = $1`, [d.circuit]);
      await pool.query(
        `INSERT INTO dg_circuit_documents (entity_type, request_id, status) VALUES ('dn_director_annotation', $1, $2)`,
        [d.request, dnStatus]
      );
      return d;
    }

    it('refuses while only the DG has returned, or the DN circuit is submitted / in circuit', async () => {
      // DG returned only, request still submitted
      const dgOnly = await dossierInDgCircuit();
      await m.requests.returnSignedFromDg(dgOnly.request, await upload(dgOnly.user, 'dg'), dgOnly.user);
      await assert.rejects(m.phases.openPreliminaryPhase(dgOnly.request, dgOnly.user), /REQUEST_NOT_READY_FOR_PHASE/);
      for (const dnStatus of ['submitted', 'in_signature_circuit']) {
        // request/circuit disagree: request already pending_review but the DN circuit has not returned
        const d = await dnCircuitState(dnStatus, 'pending_review');
        await assert.rejects(m.phases.openPreliminaryPhase(d.request, d.user), /DN_ANNOTATION_REQUIRED/, dnStatus);
        assert.equal((await one(`SELECT count(*)::int AS c FROM phases WHERE request_id = $1`, [d.request])).c, 0);
      }
      // the opposite disagreement: DN returned but request not pending_review
      const mismatch = await dnCircuitState('pending_review', 'submitted');
      await assert.rejects(m.phases.openPreliminaryPhase(mismatch.request, mismatch.user), /REQUEST_NOT_READY_FOR_PHASE/);
    });

    it('opens only when the request AND the Directeur DN circuit are pending_review - end to end', async () => {
      const d = await dossierInDgCircuit();
      await m.requests.returnSignedFromDg(d.request, await upload(d.user, 'dg'), d.user);
      const taskId = `dn_director_annotation:${d.request}`;
      await m.dn.sendToDirector(taskId, d.user);
      await assert.rejects(m.phases.openPreliminaryPhase(d.request, d.user), /REQUEST_NOT_READY_FOR_PHASE/);
      await m.dn.returnAnnotated(taskId, await upload(d.user, 'directeur'), d.user);
      const cockpit = await m.requests.listRequestCockpit();
      const item = cockpit.items.find((i: { id: number }) => i.id === d.request);
      assert.equal(item.canStartPreliminary, true);
      assert.equal(item.nextActionLabel, 'Ouvrir la phase préliminaire');
      assert.equal(item.circuitStatusLabel, 'Annotation du Directeur DN reçue');
      assert.match(item.dnAnnotationDocumentUrl, /^\/api\/files\/\d+$/, 'DN agents can read the returned annotation');
      const phase = await m.phases.openPreliminaryPhase(d.request, d.user);
      assert.equal(phase.phaseCode, 'M3');
      assert.equal(await requestStatus(d.request), 'in_progress');
    });
  });

  describe('Réception stays out of it', () => {
    it('the courrier inbox never lists the Directeur DN circuit and cannot act on its id', async () => {
      const d = await dossierInDgCircuit();
      await m.requests.returnSignedFromDg(d.request, await upload(d.user, 'dg'), d.user);
      const list = await m.courrier.listCourrierTasks({});
      assert.ok(list.items.some((t: { requestId: number; source: string }) => t.requestId === d.request && t.source === 'intake_request'));
      assert.ok(!list.items.some((t: { source: string }) => t.source === 'dn_director_annotation'));
      await assert.rejects(m.courrier.confirmPrintedForSignature(`dn_director_annotation:${d.request}`, d.user), /COURRIER_TASK_INVALID/);
      await assert.rejects(m.courrier.returnSigned(`dn_director_annotation:${d.request}`, await upload(d.user, 'x'), d.user), /COURRIER_TASK_INVALID/);
    });

    it('the courrier queue counts the DG circuits only', async () => {
      const d = await dossierInDgCircuit();
      await m.requests.returnSignedFromDg(d.request, await upload(d.user, 'dg'), d.user);
      const list = await m.courrier.listCourrierTasks({});
      assert.ok(list.items.some((t: { id: string; source: string; requestId: number }) => t.source === 'intake_request' && t.requestId === d.request));
      assert.ok(!list.items.some((t: { id: string }) => t.id === `dn_director_annotation:${d.request}`));
      const returned = list.items.filter((t: { bucket: string }) => t.bucket === 'returned');
      assert.equal(list.counts.returned, returned.length);
      assert.ok(returned.every((t: { source: string }) => t.source !== 'dn_director_annotation'));
    });

    it('the cockpit shows the intake DG circuit and the DN stage, never the other way round', async () => {
      const d = await dossierInDgCircuit();
      await m.requests.returnSignedFromDg(d.request, await upload(d.user, 'dg'), d.user);
      const cockpit = await m.requests.listRequestCockpit();
      const item = cockpit.items.find((i: { id: number }) => i.id === d.request);
      assert.equal(item.circuitStatus, 'pending_review');
      assert.equal(item.dnAnnotationStatus, 'submitted');
      assert.equal(item.circuitStatusLabel, 'À transmettre au Directeur DN');
      assert.equal(item.nextActionLabel, 'À transmettre au Directeur DN');
      assert.equal(item.canStartPreliminary, false);
    });
  });

  describe('DG alert', () => {
    it('keeps alerting a stuck DG circuit, and does not alert the Directeur DN circuit (no rule validated yet)', async () => {
      const dg = await dossierInDgCircuit();
      await pool.query(`UPDATE dg_circuit_documents SET signature_sent_at = now() - interval '60 days' WHERE id = $1`, [dg.circuit]);

      const dnDossier = await dossierInDgCircuit();
      await m.requests.returnSignedFromDg(dnDossier.request, await upload(dnDossier.user, 'dg'), dnDossier.user);
      await m.dn.sendToDirector(`dn_director_annotation:${dnDossier.request}`, dnDossier.user);
      await pool.query(
        `UPDATE dg_circuit_documents SET signature_sent_at = now() - interval '60 days' WHERE request_id = $1 AND entity_type = 'dn_director_annotation'`,
        [dnDossier.request]
      );

      await pool.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'reception')`, [dg.user]);
      await m.alertJob.runDgCircuitAlertCheck();

      const dgAlert = await one(`SELECT blocked_alert_sent_at FROM dg_circuit_documents WHERE id = $1`, [dg.circuit]);
      assert.ok(dgAlert.blocked_alert_sent_at, 'the stuck DG circuit is still alerted');
      const dnAlert = await one(
        `SELECT blocked_alert_sent_at FROM dg_circuit_documents WHERE request_id = $1 AND entity_type = 'dn_director_annotation'`,
        [dnDossier.request]
      );
      assert.equal(dnAlert.blocked_alert_sent_at, null, 'no automatic alert for the Directeur DN circuit');
      const notified = await one(`SELECT count(*)::int AS c FROM notifications WHERE request_id = $1`, [dnDossier.request]);
      assert.equal(notified.c, 0);
    });
  });

  describe('grandfather backfill (script run after db:migrate, not a migration)', () => {
    it('adds a pending_review Directeur DN circuit to a dossier already past the DG return, once', async () => {
      const k = `${tag}${++n}`;
      const org = (await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [`OMA BF ${k}`])).id;
      const applicant = (await one(`INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'P', $2, 'x') RETURNING id`, [org, `bf-${k}@t.local`])).id;
      const legacyReady = (await one(
        `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status) VALUES ($1, $2, $3, 'issuance', 'pending_review') RETURNING id`,
        [`DEM-BF-${k}`, applicant, org]
      )).id;
      await pool.query(`INSERT INTO dg_circuit_documents (entity_type, request_id, status, pending_review_at) VALUES ('intake_request', $1, 'pending_review', now())`, [legacyReady]);

      // A dossier still in the DG circuit gets nothing.
      const org2 = (await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [`OMA BF2 ${k}`])).id;
      const applicant2 = (await one(`INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'P', $2, 'x') RETURNING id`, [org2, `bf2-${k}@t.local`])).id;
      const inCircuit = (await one(
        `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status) VALUES ($1, $2, $3, 'issuance', 'submitted') RETURNING id`,
        [`DEM-BF2-${k}`, applicant2, org2]
      )).id;
      await pool.query(`INSERT INTO dg_circuit_documents (entity_type, request_id, status) VALUES ('intake_request', $1, 'in_signature_circuit')`, [inCircuit]);

      const first = await m.backfill.backfillLegacyDnAnnotations(pool);
      assert.ok(first.inserted >= 1, 'the legacy dossier got its circuit');
      assert.equal(first.eligible, first.inserted + first.alreadyPresent);
      const second = await m.backfill.backfillLegacyDnAnnotations(pool); // idempotent
      assert.equal(second.inserted, 0);
      assert.equal(second.alreadyPresent, second.eligible);
      assert.equal(await dnCount(legacyReady), 1);
      assert.equal((await circuitOf(legacyReady, 'dn_director_annotation')).status, 'pending_review');
      assert.equal(await dnCount(inCircuit), 0);
      assert.equal(await requestStatus(legacyReady), 'pending_review', 'request status is not regressed');

      // ...and such a dossier can open M3, as before.
      const phase = await m.phases.openPreliminaryPhase(legacyReady, 1);
      assert.equal(phase.phaseCode, 'M3');
      const task = (await m.dn.listDnAnnotationTasks({})).items.find((t: { requestId: number }) => t.requestId === legacyReady);
      assert.equal(task.predatesProcess, true);
    });
  });
});

/** SESSION1-COCKPIT-1 - Circuit Directeur DN queue read model: bucket / state /
 *  owner / actionKey / blockReason / urgency computed server-side. Real
 *  PostgreSQL, skipped without DATABASE_URL (needs a migrated, disposable database). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { OPERATIONAL_OWNERS } from '@aidn/shared';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';
const here = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = path.resolve(here, '../../../uploads');

describe('SESSION1-COCKPIT-1 Directeur DN circuit queue (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let appPool: pg.Pool;
  let closeAppPool: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: Record<string, any>;
  const tag = Date.now().toString(36);
  const createdAssetIds: number[] = [];
  const startedAt = new Date(Date.now() - 1000);
  let n = 0;

  before(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const [dn, requests, uploads, attach, dbModule] = await Promise.all([
      import('./dn-annotation.service.js'),
      import('../requests/requests.service.js'),
      import('../uploads/asset-registration.js'),
      import('../uploads/upload-attachment.js'),
      import('../../shared/db/index.js'),
    ]);
    m = { dn, requests, uploads, attach, db: dbModule.db };
    appPool = dbModule.db.$client as pg.Pool;
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    const { rows } = await pool.query('SELECT storage_key FROM upload_assets WHERE id = ANY($1)', [createdAssetIds]);
    for (const row of rows) fs.rmSync(path.join(UPLOADS_ROOT, row.storage_key), { force: true });
    const copies = await pool.query(`SELECT storage_key FROM upload_assets WHERE module_hint = 'dn-annotation' AND created_at >= $1`, [startedAt]);
    for (const row of copies.rows) fs.rmSync(path.join(UPLOADS_ROOT, row.storage_key), { force: true });
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];

  async function countQueries<T>(run: () => Promise<T>): Promise<{ count: number; value: T }> {
    const original = appPool.query.bind(appPool);
    let count = 0;
    (appPool as unknown as { query: unknown }).query = (...args: unknown[]) => {
      count += 1;
      return (original as (...a: unknown[]) => unknown)(...args);
    };
    try {
      const value = await run();
      return { count, value };
    } finally {
      (appPool as unknown as { query: unknown }).query = original;
    }
  }

  async function upload(userId: number, label: string) {
    const key = `staging/cq-${tag}-${++n}-${label}.pdf`;
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
  async function dossierInDgCircuit() {
    const k = `${tag}${++n}`;
    const user = (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Assistante CQ', $2) RETURNING id`, [`CQ${k}`, `cq-${k}@t.local`])).id;
    const org = (await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [`OMA CQ ${k}`])).id;
    const applicant = (await one(`INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'P', $2, 'x') RETURNING id`, [org, `p-${k}@t.local`])).id;
    const request = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status)
       VALUES ($1, $2, $3, 'issuance', 'submitted') RETURNING id`,
      [`DEM-CQ-${k}`, applicant, org]
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
    return { user, request, circuit, taskId: `dn_director_annotation:${request}` };
  }

  /** The DG return creates the DN circuit (status submitted). */
  async function dossierAtDnToSend() {
    const d = await dossierInDgCircuit();
    await m.requests.returnSignedFromDg(d.request, await upload(d.user, 'annote-dg'), d.user);
    return d;
  }

  const itemOf = async (requestId: number) =>
    (await m.dn.listDnAnnotationTasks({})).items.find((i: { requestId: number }) => i.requestId === requestId);

  it('submitted: to_send / action_required / Assistante DN / send_to_director, urgency normal', async () => {
    const d = await dossierAtDnToSend();
    const item = await itemOf(d.request);
    assert.deepEqual(
      [item.bucket, item.state, item.owner, item.actionKey, item.urgency],
      ['to_send', 'action_required', OPERATIONAL_OWNERS.assistantDn, 'send_to_director', 'normal']
    );
    assert.equal(item.blockReason, null);
    assert.equal('statusLabel' in item, false);
  });

  it('sent: with_director / waiting / Assistante DN / record_director_annotation; urgency normal however long (D10)', async () => {
    const d = await dossierAtDnToSend();
    await m.dn.sendToDirector(d.taskId, d.user);
    await pool.query(
      `UPDATE dg_circuit_documents SET signature_sent_at = now() - interval '30 days' WHERE request_id = $1 AND entity_type = 'dn_director_annotation'`,
      [d.request]
    );
    const item = await itemOf(d.request);
    assert.deepEqual(
      [item.bucket, item.state, item.owner, item.actionKey, item.urgency],
      ['with_director', 'waiting', OPERATIONAL_OWNERS.assistantDn, 'record_director_annotation', 'normal']
    );
    assert.ok(item.directorWorkingDays >= 15, 'the wait stays informational');
  });

  it('returned: returned / done / owner null / handed_to_dn', async () => {
    const d = await dossierAtDnToSend();
    await m.dn.sendToDirector(d.taskId, d.user);
    await m.dn.returnAnnotated(d.taskId, await upload(d.user, 'annote-directeur'), d.user);
    const item = await itemOf(d.request);
    assert.deepEqual(
      [item.bucket, item.state, item.owner, item.actionKey, item.urgency],
      ['returned', 'done', null, 'handed_to_dn', 'normal']
    );
  });

  it('B1: pending on a closed dossier is inactive in items and outside to_send / with_director counts', async () => {
    const d = await dossierAtDnToSend();
    const before = (await m.dn.listDnAnnotationTasks({})).counts;
    await pool.query(`UPDATE requests SET status = 'cancelled' WHERE id = $1`, [d.request]);
    const list = await m.dn.listDnAnnotationTasks({});
    const item = list.items.find((i: { requestId: number }) => i.requestId === d.request);
    assert.deepEqual(
      [item.bucket, item.state, item.owner, item.actionKey, item.blockReason, item.dossierClosed],
      ['inactive', 'done', null, 'none', 'dossier_closed', true]
    );
    assert.deepEqual(item.availableActions, []);
    assert.equal(list.counts.to_send, before.to_send - 1);
    assert.equal(list.counts.inactive, before.inactive + 1);
    const toSend = await m.dn.listDnAnnotationTasks({ bucket: 'to_send' });
    assert.ok(!toSend.items.some((i: { requestId: number }) => i.requestId === d.request));
  });

  it('issues exactly 4 queries whatever the number of circuits', async () => {
    await dossierAtDnToSend();
    const first = await countQueries(() => m.dn.listDnAnnotationTasks({}));
    for (let i = 0; i < 3; i += 1) await dossierAtDnToSend();
    const second = await countQueries(() => m.dn.listDnAnnotationTasks({}));
    assert.equal(first.count, 4);
    assert.equal(second.count, 4);
  });
});

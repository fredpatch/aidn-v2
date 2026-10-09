/** K7c - the staff work lists (S5 payment queues, meeting cockpit, courrier
 *  tasks, R3 queue) flag a closed dossier and offer no action on it (real
 *  PostgreSQL, skipped without DATABASE_URL). The same pending items are
 *  built on a closed and an open dossier; only the closed one loses its
 *  actions. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

describe('K7c closed dossier in the staff work lists (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let closeAppPool: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: Record<string, any>;
  const tag = Date.now().toString(36);
  let n = 0;

  before(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const [deep, site, cert, meetings, courrier, dbModule] = await Promise.all([
      import('../deep-evaluation/deep-evaluation.service.js'),
      import('../site-inspection/site-inspection.service.js'),
      import('../certificates/certificates.service.js'),
      import('../meetings/meetings.service.js'),
      import('../courrier-tasks/courrier-tasks.service.js'),
      import('../../shared/db/index.js'),
    ]);
    m = { deep, site, cert, meetings, courrier };
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];

  /** A dossier with one pending item in each list. The M6 payment is
   *  validated and the visit scheduled, so an open dossier's R3 must hold it. */
  async function dossier(status: string) {
    const k = `${tag}${++n}`;
    const user = (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Agent K7c', $2) RETURNING id`, [`K7C${k}`, `k7c-${k}@t.local`])).id;
    const org = (await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [`OMA K7c ${k}`])).id;
    const applicant = (await one(`INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'P', $2, 'x') RETURNING id`, [org, `p7c-${k}@t.local`])).id;
    const request = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status) VALUES ($1, $2, $3, 'issuance', $4) RETURNING id`,
      [`DEM-K7C-${k}`, applicant, org, status]
    )).id;
    const phase: Record<string, number> = {};
    for (const code of ['M3', 'M5', 'M6', 'M7']) {
      phase[code] = (await one(`INSERT INTO phases (request_id, phase_code) VALUES ($1, $2) RETURNING id`, [request, code])).id;
    }
    await pool.query(`INSERT INTO payments (phase_id, status, invoice_file_url, proof_file_url) VALUES ($1, 'pending_validation', 'i', 'p'), ($2, 'validated', 'i', 'p'), ($3, 'awaiting_invoice', NULL, NULL)`, [phase.M5, phase.M6, phase.M7]);
    const meeting = (await one(
      `INSERT INTO meetings (phase_id, meeting_type, dn_agent_id, scheduled_at, status) VALUES ($1, 'preliminary', $2, now() + interval '1 day', 'scheduled') RETURNING id`,
      [phase.M3, user]
    )).id;
    await pool.query(`INSERT INTO meetings (phase_id, meeting_type, dn_agent_id, scheduled_at, status) VALUES ($1, 'site_visit', $2, now() + interval '1 hour', 'scheduled')`, [phase.M6, user]);
    await pool.query(`INSERT INTO dg_circuit_documents (entity_type, request_id, status) VALUES ('formal_request_letter', $1, 'submitted')`, [request]);
    return { user, request, meeting };
  }

  async function lists(d: Awaited<ReturnType<typeof dossier>>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mine = (items: Array<Record<string, any>>) => {
      const found = items.find((item) => item.requestId === d.request);
      assert.ok(found, 'item listed');
      return found;
    };
    const cockpit = await m.meetings.listMeetingCockpit({});
    return {
      m5: mine(await m.deep.getPaymentQueue()),
      m6: mine(await m.site.getPaymentQueue()),
      m7: mine(await m.cert.getPaymentQueue()),
      meeting: cockpit.items.find((item: { id: number }) => item.id === d.meeting),
      courrier: mine((await m.courrier.listCourrierTasks({})).items),
      mission: mine(await m.site.getMyQueue(d.user)),
    };
  }

  for (const status of ['rejected', 'cancelled', 'completed']) {
    it(`${status} dossier: listed for history, flagged closed, no action offered`, async () => {
      const l = await lists(await dossier(status));
      for (const item of [l.m5, l.m6, l.m7, l.meeting, l.courrier, l.mission]) {
        assert.equal(item.dossierStatus, status);
        assert.equal(item.dossierClosed, true);
      }
      assert.equal(l.meeting.canManage, false);
      assert.equal(l.meeting.actionLabel, 'Dossier clos');
      assert.deepEqual(l.courrier.availableActions, []);
      assert.equal(l.courrier.bucket, 'to_signature');
      assert.equal(l.mission.missionStatus, 'closed');
      assert.equal(l.mission.nextAction, 'consult');
      assert.equal(l.mission.statusLabel, 'Dossier clos');
    });
  }

  it('open dossier: unchanged, every action still offered', async () => {
    const l = await lists(await dossier('in_progress'));
    for (const item of [l.m5, l.m6, l.m7, l.meeting, l.courrier, l.mission]) {
      assert.equal(item.dossierStatus, 'in_progress');
      assert.equal(item.dossierClosed, false);
    }
    assert.equal(l.m5.nextAction, 'validate_payment');
    assert.equal(l.m7.nextAction, 'send_invoice');
    assert.equal(l.meeting.canManage, true);
    assert.equal(l.meeting.actionLabel, 'Resoudre la reunion');
    assert.deepEqual(l.courrier.availableActions, ['print', 'confirm_signature_circuit']);
    assert.equal(l.mission.missionStatus, 'to_hold');
    assert.equal(l.mission.nextAction, 'mark_held');
  });
});

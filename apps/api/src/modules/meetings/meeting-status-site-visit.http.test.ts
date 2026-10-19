/** BUG-MEETING-SITE-VISIT-STATUS-1 - the generic PATCH /api/meetings/:id/status
 *  manages preliminary and formal meetings only. A site visit goes through the
 *  Cellule Inspection workflow (assignment, validated payment, compare-and-set,
 *  SITE_VISIT_HELD), so the generic route refuses every status for it before
 *  any write. Real HTTP + PostgreSQL (skipped without DATABASE_URL). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';
import { pgConnectionConfig } from '../../shared/db/connection.js';

process.env.JWT_SECRET ??= 'site-visit-status-http-test-secret';
const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';
const GENERIC_AUDITS = ['MEETING_HELD', 'MEETING_NO_SHOW', 'MEETING_FILE_CANCELLED'];

describe('PATCH /api/meetings/:id/status refuses site visits (HTTP)', { skip }, () => {
  let server: Server;
  let baseUrl: string;
  let pool: pg.Pool;
  let cookieFor: (userId: number, roles: string[]) => string;
  let closeAppPool: () => Promise<void>;
  const tag = Date.now().toString(36);
  let n = 0;
  const created = { users: [] as number[], organisations: [] as number[], applicants: [] as number[], requests: [] as number[] };

  before(async () => {
    pool = new pg.Pool(pgConnectionConfig(DATABASE_URL));
    const [{ default: express }, { default: cookieParser }, meetingsRoute, siteRoute, jwt, guards, dbModule] = await Promise.all([
      import('express'),
      import('cookie-parser'),
      import('./meetings.route.js'),
      import('../site-inspection/site-inspection.route.js'),
      import('../../shared/utils/jwt.js'),
      import('../../shared/guards/auth.middleware.js'),
      import('../../shared/db/index.js'),
    ]);
    closeAppPool = () => dbModule.db.$client.end();
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api/meetings', meetingsRoute.default);
    app.use('/api/site-inspection', siteRoute.default);
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    cookieFor = (userId, roles) =>
      `${guards.ACCESS_TOKEN_COOKIE}=${jwt.signAccessToken({ kind: 'staff', userId, employeeCode: 'T', roles })}`;
  });

  after(async () => {
    const requests = created.requests;
    if (requests.length) {
      const meetingIds = `SELECT m.id FROM meetings m JOIN phases p ON p.id = m.phase_id WHERE p.request_id = ANY($1)`;
      await pool.query(`DELETE FROM audit_logs WHERE request_id = ANY($1) OR (entity_id IN (${meetingIds}) AND action LIKE ANY (ARRAY['MEETING_%', 'SITE_VISIT_HELD']))`, [requests]);
      await pool.query(`DELETE FROM meetings WHERE id IN (${meetingIds})`, [requests]);
      await pool.query(`DELETE FROM payments WHERE phase_id IN (SELECT id FROM phases WHERE request_id = ANY($1))`, [requests]);
      await pool.query(`DELETE FROM phases WHERE request_id = ANY($1)`, [requests]);
      await pool.query(`DELETE FROM requests WHERE id = ANY($1)`, [requests]);
    }
    if (created.applicants.length) await pool.query(`DELETE FROM applicants WHERE id = ANY($1)`, [created.applicants]);
    if (created.organisations.length) await pool.query(`DELETE FROM organisations WHERE id = ANY($1)`, [created.organisations]);
    if (created.users.length) {
      await pool.query(`DELETE FROM audit_logs WHERE user_id = ANY($1)`, [created.users]);
      await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [created.users]);
    }
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];

  async function user(label: string) {
    const k = `${tag}-${++n}`;
    const id = (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, $2, $3) RETURNING id`, [
      `MSV${k}`,
      label,
      `msv-${k}@test.local`,
    ])).id as number;
    created.users.push(id);
    return id;
  }

  async function dossier() {
    const k = `${tag}-${++n}`;
    const org = (await one(`INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`, [`OMA MSV ${k}`])).id as number;
    created.organisations.push(org);
    const applicant = (await one(`INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'Postulant', $2, 'x') RETURNING id`, [org, `msv-a-${k}@test.local`])).id as number;
    created.applicants.push(applicant);
    const request = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status) VALUES ($1, $2, $3, 'issuance', 'in_progress') RETURNING id`,
      [`DEM-MSV-${k}`, applicant, org]
    )).id as number;
    created.requests.push(request);
    return request;
  }

  async function siteVisit(paymentStatus: string) {
    const ci = await user('Agent CI');
    const request = await dossier();
    const phase = (await one(`INSERT INTO phases (request_id, phase_code, status) VALUES ($1, 'M6', 'open') RETURNING id`, [request])).id as number;
    await pool.query(`INSERT INTO payments (phase_id, status) VALUES ($1, $2)`, [phase, paymentStatus]);
    const visit = (await one(
      `INSERT INTO meetings (phase_id, meeting_type, dn_agent_id, scheduled_at, status, confirmation_status)
       VALUES ($1, 'site_visit', $2, now() + interval '1 day', 'scheduled', 'not_required') RETURNING id`,
      [phase, ci]
    )).id as number;
    return { ci, request, visit };
  }

  async function confirmedMeeting(phaseCode: 'M3' | 'M4', meetingType: 'preliminary' | 'formal') {
    const dn = await user('Agent DN');
    const request = await dossier();
    const phase = (await one(`INSERT INTO phases (request_id, phase_code, status) VALUES ($1, $2, 'open') RETURNING id`, [request, phaseCode])).id as number;
    const meeting = (await one(
      `INSERT INTO meetings (phase_id, meeting_type, dn_agent_id, scheduled_at, status, confirmation_status, confirmed_at)
       VALUES ($1, $2, $3, now() + interval '2 days', 'scheduled', 'confirmed', now()) RETURNING id`,
      [phase, meetingType, dn]
    )).id as number;
    return { dn, meeting };
  }

  const setStatus = (meeting: number, status: string, cookie: string) =>
    fetch(`${baseUrl}/api/meetings/${meeting}/status`, {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

  const genericAudits = async (meeting: number) =>
    Number((await one(`SELECT count(*) AS c FROM audit_logs WHERE entity_id = $1 AND action = ANY($2)`, [meeting, GENERIC_AUDITS])).c);

  for (const status of ['held', 'no_show', 'file_cancelled']) {
    it(`site visit + "${status}": 409, visit still scheduled, dossier unchanged, no generic audit`, async () => {
      const { request, visit } = await siteVisit('pending_validation');
      const dn = await user('Agent DN');
      const response = await setStatus(visit, status, cookieFor(dn, ['dn_agent']));
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), {
        message: 'Les visites sur site sont gérées depuis le workflow Cellule Inspection.',
        code: 'MEETING_STATUS_NOT_APPLICABLE_TO_SITE_VISIT',
      });
      assert.equal((await one(`SELECT status FROM meetings WHERE id = $1`, [visit])).status, 'scheduled');
      const dossierRow = await one(`SELECT status, rejection_reason FROM requests WHERE id = $1`, [request]);
      assert.equal(dossierRow.status, 'in_progress', 'file_cancelled must not reject the dossier');
      assert.equal(dossierRow.rejection_reason, null);
      assert.equal(await genericAudits(visit), 0);
    });
  }

  it('SU and dn_supervisor are refused the same way (no role bypasses the workflow)', async () => {
    const { visit } = await siteVisit('validated');
    const actor = await user('SU');
    for (const roles of [['SU'], ['dn_supervisor']]) {
      const response = await setStatus(visit, 'held', cookieFor(actor, roles));
      assert.equal(response.status, 409);
    }
    assert.equal((await one(`SELECT status FROM meetings WHERE id = $1`, [visit])).status, 'scheduled');
  });

  it('a confirmed preliminary (M3) meeting is still marked held, audited MEETING_HELD under M3', async () => {
    const { dn, meeting } = await confirmedMeeting('M3', 'preliminary');
    const response = await setStatus(meeting, 'held', cookieFor(dn, ['dn_agent']));
    assert.equal(response.status, 200);
    assert.equal((await one(`SELECT status FROM meetings WHERE id = $1`, [meeting])).status, 'held');
    const audit = await one(`SELECT module, user_id FROM audit_logs WHERE entity_id = $1 AND action = 'MEETING_HELD'`, [meeting]);
    assert.equal(audit.module, 'M3');
    assert.equal(audit.user_id, dn);
  });

  it('a confirmed formal (M4) meeting is still marked no_show', async () => {
    const { dn, meeting } = await confirmedMeeting('M4', 'formal');
    const response = await setStatus(meeting, 'no_show', cookieFor(dn, ['dn_agent']));
    assert.equal(response.status, 200);
    assert.equal((await one(`SELECT status FROM meetings WHERE id = $1`, [meeting])).status, 'no_show');
  });

  it('the dedicated CI path still records a paid visit held, and still refuses an unpaid one', async () => {
    const paid = await siteVisit('validated');
    const ok = await fetch(`${baseUrl}/api/site-inspection/site-visits/${paid.visit}/held`, {
      method: 'PATCH',
      headers: { Cookie: cookieFor(paid.ci, ['r3_agent']) },
    });
    assert.equal(ok.status, 200);
    assert.equal((await one(`SELECT status FROM meetings WHERE id = $1`, [paid.visit])).status, 'held');
    assert.equal(Number((await one(`SELECT count(*) AS c FROM audit_logs WHERE entity_id = $1 AND action = 'SITE_VISIT_HELD'`, [paid.visit])).c), 1);
    assert.equal(await genericAudits(paid.visit), 0);

    const unpaid = await siteVisit('pending_validation');
    const refused = await fetch(`${baseUrl}/api/site-inspection/site-visits/${unpaid.visit}/held`, {
      method: 'PATCH',
      headers: { Cookie: cookieFor(unpaid.ci, ['r3_agent']) },
    });
    assert.equal(refused.status, 409);
    assert.equal(((await refused.json()) as { code: string }).code, 'SITE_VISIT_PAYMENT_NOT_VALIDATED');
  });
});

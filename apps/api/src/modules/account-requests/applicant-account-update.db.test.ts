/** SESSION1-ACCOUNT-1 - updateApplicantAccount against a real PostgreSQL
 *  (skipped without DATABASE_URL; needs a migrated, disposable database). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

type Row = {
  id: number;
  organisation_id: number;
  full_name: string;
  email: string;
  phone: string | null;
  contact_order: string;
  active: boolean;
  password_hash: string;
};

describe('SESSION1-ACCOUNT-1 updateApplicantAccount (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let service: typeof import('./account-requests.service.js');
  let closeAppPool: () => Promise<void>;
  const tag = Date.now().toString(36);
  let orgId: number;
  let actor: number;
  let staffId: number;
  let a: number;
  let b: number;
  const staffEmail = `staff-${tag}@test.local`;
  const emailA = `a-${tag}@test.local`;
  const emailB = `Mixed.B-${tag}@Test.local`;
  const HASH = 'known-hash-value';

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
  const row = async (id: number) => (await one('SELECT * FROM applicants WHERE id = $1', [id])) as Row;
  const audits = async (id: number) =>
    (
      await pool.query(
        `SELECT * FROM audit_logs WHERE module='M13' AND entity_id=$1 AND action='APPLICANT_ACCOUNT_UPDATED' ORDER BY id`,
        [id]
      )
    ).rows as Array<{ user_id: number | null; details: { changedFields: string[]; changes: Record<string, unknown> } }>;

  async function reset() {
    await pool.query(`DELETE FROM audit_logs WHERE module='M13' AND entity_id IN ($1,$2)`, [a, b]);
    await pool.query(
      `UPDATE applicants SET full_name='Alice', email=$2, phone='0102', contact_order='primary', active=true, password_hash=$3 WHERE id=$1`,
      [a, emailA, HASH]
    );
    await pool.query(
      `UPDATE applicants SET full_name='Bob', email=$2, phone=NULL, contact_order='secondary', active=true, password_hash=$3 WHERE id=$1`,
      [b, emailB, HASH]
    );
  }

  async function assertImmutable() {
    const r = await row(a);
    assert.equal(r.organisation_id, orgId);
    assert.equal(r.password_hash, HASH);
    assert.equal(r.active, true);
  }

  async function code(promise: Promise<unknown>): Promise<string> {
    try {
      await promise;
    } catch (e) {
      return (e as Error).message;
    }
    return 'NO_ERROR';
  }

  before(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    service = await import('./account-requests.service.js');
    const dbModule = await import('../../shared/db/index.js');
    closeAppPool = () => dbModule.db.$client.end();
    orgId = (
      await one(
        `INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`,
        [`OMA AU ${tag}`]
      )
    ).id;
    actor = (
      await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Agent DN', $2) RETURNING id`, [
        `AU${tag}`.slice(0, 20),
        `agent-${tag}@test.local`,
      ])
    ).id;
    staffId = (
      await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Staff', $2) RETURNING id`, [
        `AS${tag}`.slice(0, 20),
        staffEmail,
      ])
    ).id;
    a = (
      await one(
        `INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1,'Alice',$2,$3) RETURNING id`,
        [orgId, emailA, HASH]
      )
    ).id;
    b = (
      await one(
        `INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1,'Bob',$2,$3) RETURNING id`,
        [orgId, emailB, HASH]
      )
    ).id;
  });

  after(async () => {
    await pool.query(`DELETE FROM audit_logs WHERE module='M13' AND entity_id IN ($1,$2)`, [a, b]);
    await pool.query('DELETE FROM applicants WHERE id IN ($1,$2)', [a, b]);
    await pool.query('DELETE FROM organisations WHERE id = $1', [orgId]);
    await pool.query('DELETE FROM audit_logs WHERE user_id IN ($1,$2)', [actor, staffId]);
    await pool.query('DELETE FROM users WHERE id IN ($1,$2)', [actor, staffId]);
    await pool.end();
    await closeAppPool();
  });

  it('1 name only (trimmed)', async () => {
    await reset();
    const view = await service.updateApplicantAccount(a, { fullName: '  Alice Nouvelle ' }, actor);
    assert.equal(view.fullName, 'Alice Nouvelle');
    assert.equal(view.organisationName, `OMA AU ${tag}`);
    const r = await row(a);
    assert.equal(r.full_name, 'Alice Nouvelle');
    assert.equal(r.email, emailA);
    assert.equal(r.phone, '0102');
    assert.equal((await audits(a)).length, 1);
    await assertImmutable();
  });

  it('2 email is normalised (also covers 9)', async () => {
    await reset();
    const newEmail = `new.mail-${tag}@example.com`;
    const view = await service.updateApplicantAccount(a, { email: `  New.Mail-${tag}@Example.COM ` }, actor);
    assert.equal(view.email, newEmail);
    assert.equal((await row(a)).email, newEmail);
    assert.equal((await audits(a)).length, 1);
    await assertImmutable();
  });

  it('3 phone', async () => {
    await reset();
    await service.updateApplicantAccount(a, { phone: ' 0707 ' }, actor);
    assert.equal((await row(a)).phone, '0707');
    assert.equal((await audits(a)).length, 1);
  });

  it('4 null and blank phone clear to null', async () => {
    await reset();
    await service.updateApplicantAccount(a, { phone: null }, actor);
    assert.equal((await row(a)).phone, null);
    await pool.query(`UPDATE applicants SET phone='0102' WHERE id=$1`, [a]);
    await service.updateApplicantAccount(a, { phone: '   ' }, actor);
    assert.equal((await row(a)).phone, null);
    assert.equal((await audits(a)).length, 2);
    assert.equal(
      await code(service.updateApplicantAccount(a, { phone: 'x'.repeat(51) }, actor)),
      'APPLICANT_PHONE_TOO_LONG'
    );
    for (const bad of [42, {}, true]) {
      assert.equal(
        await code(service.updateApplicantAccount(a, { phone: bad as never }, actor)),
        'INVALID_APPLICANT_PHONE',
        JSON.stringify(bad)
      );
    }
  });

  it('5 contact order', async () => {
    await reset();
    await service.updateApplicantAccount(a, { contactOrder: 'tertiary' }, actor);
    assert.equal((await row(a)).contact_order, 'tertiary');
    assert.equal((await audits(a)).length, 1);
  });

  it('6 several fields -> one audit row with exact changedFields and from/to', async () => {
    await reset();
    await service.updateApplicantAccount(a, { fullName: 'Zed', phone: '0909', contactOrder: 'secondary' }, actor);
    const rows = await audits(a);
    assert.equal(rows.length, 1);
    assert.deepEqual([...rows[0].details.changedFields].sort(), ['contactOrder', 'fullName', 'phone']);
    assert.deepEqual(rows[0].details.changes, {
      fullName: { from: 'Alice', to: 'Zed' },
      phone: { from: '0102', to: '0909' },
      contactOrder: { from: 'primary', to: 'secondary' },
    });
  });

  it('7 email of another applicant (even stored in mixed case) -> APPLICANT_EMAIL_EXISTS', async () => {
    await reset();
    assert.equal(
      await code(service.updateApplicantAccount(a, { email: emailB.toLowerCase() }, actor)),
      'APPLICANT_EMAIL_EXISTS'
    );
    assert.equal(await code(service.updateApplicantAccount(a, { email: emailB }, actor)), 'APPLICANT_EMAIL_EXISTS');
    assert.equal((await row(a)).email, emailA);
    assert.equal((await audits(a)).length, 0);
  });

  it('7b duplicate email + invalid other field -> the 400 of the invalid field', async () => {
    await reset();
    assert.equal(
      await code(service.updateApplicantAccount(a, { email: emailB, contactOrder: 'owner' }, actor)),
      'INVALID_CONTACT_ORDER'
    );
    assert.equal(
      await code(service.updateApplicantAccount(a, { email: emailB, phone: 'x'.repeat(51) }, actor)),
      'APPLICANT_PHONE_TOO_LONG'
    );
    assert.equal((await row(a)).email, emailA);
    assert.equal((await audits(a)).length, 0);
  });

  it('8 own email in upper case is a no-op success without audit', async () => {
    await reset();
    const view = await service.updateApplicantAccount(a, { email: emailA.toUpperCase() }, actor);
    assert.equal(view.email, emailA);
    assert.equal((await row(a)).email, emailA);
    assert.equal((await audits(a)).length, 0);
  });

  it('10 invalid email values -> INVALID_APPLICANT_EMAIL', async () => {
    await reset();
    for (const bad of ['not-an-email', '', 42, `${'x'.repeat(251)}@a.co`]) {
      assert.equal(
        await code(service.updateApplicantAccount(a, { email: bad }, actor)),
        'INVALID_APPLICANT_EMAIL',
        String(bad)
      );
    }
    assert.equal((await row(a)).email, emailA);
    assert.equal((await audits(a)).length, 0);
  });

  it('11 name validation', async () => {
    await reset();
    assert.equal(await code(service.updateApplicantAccount(a, { fullName: '   ' }, actor)), 'APPLICANT_NAME_REQUIRED');
    assert.equal(await code(service.updateApplicantAccount(a, { fullName: null }, actor)), 'APPLICANT_NAME_REQUIRED');
    assert.equal(
      await code(service.updateApplicantAccount(a, { fullName: 'n'.repeat(201) }, actor)),
      'APPLICANT_NAME_TOO_LONG'
    );
    await service.updateApplicantAccount(a, { fullName: 'n'.repeat(200) }, actor);
    assert.equal((await row(a)).full_name.length, 200);
  });

  it('12 bad contact order', async () => {
    await reset();
    assert.equal(
      await code(service.updateApplicantAccount(a, { contactOrder: 'owner' }, actor)),
      'INVALID_CONTACT_ORDER'
    );
    assert.equal(
      await code(service.updateApplicantAccount(a, { contactOrder: null }, actor)),
      'INVALID_CONTACT_ORDER'
    );
    assert.equal((await row(a)).contact_order, 'primary');
  });

  it('13 unknown or non-positive id -> APPLICANT_NOT_FOUND', async () => {
    assert.equal(await code(service.updateApplicantAccount(999999999, { fullName: 'X' }, actor)), 'APPLICANT_NOT_FOUND');
    assert.equal(await code(service.updateApplicantAccount(0, { fullName: 'X' }, actor)), 'APPLICANT_NOT_FOUND');
    assert.equal(await code(service.updateApplicantAccount(-3, { fullName: 'X' }, actor)), 'APPLICANT_NOT_FOUND');
    assert.equal(await code(service.updateApplicantAccount(Number.NaN, { fullName: 'X' }, actor)), 'APPLICANT_NOT_FOUND');
    assert.equal(await code(service.updateApplicantAccount(3000000000, { fullName: 'X' }, actor)), 'APPLICANT_NOT_FOUND');
  });

  it('14/15 organisation, password and active are ignored even if smuggled in, and stay unchanged', async () => {
    await reset();
    const smuggled = { fullName: 'S', organisationId: 1, passwordHash: 'evil', active: false };
    await service.updateApplicantAccount(a, smuggled, actor);
    await assertImmutable();
    assert.equal((await row(a)).full_name, 'S');
  });

  it('16 email equal to a staff user email -> success', async () => {
    await reset();
    const view = await service.updateApplicantAccount(a, { email: staffEmail }, actor);
    assert.equal(view.email, staffEmail);
    assert.equal((await row(a)).email, staffEmail);
  });

  it('17 audit row: one, actor, no password key', async () => {
    await reset();
    await service.updateApplicantAccount(a, { fullName: 'Audit', email: `audit-${tag}@test.local` }, actor);
    const rows = await audits(a);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, actor);
    assert.ok(!JSON.stringify(rows[0].details).toLowerCase().includes('password'));
  });

  it('18 failing update leaves row and audit untouched; failing audit rolls the update back', async () => {
    await reset();
    await code(service.updateApplicantAccount(a, { fullName: 'Nope', email: emailB.toLowerCase() }, actor));
    assert.equal((await row(a)).full_name, 'Alice');
    assert.equal((await audits(a)).length, 0);

    // actor id not in users -> audit_logs FK violation inside the transaction
    let pgCode: string | undefined;
    try {
      await service.updateApplicantAccount(a, { fullName: 'Rolled back' }, 2147000000);
      assert.fail('expected the audit FK violation');
    } catch (e) {
      const failure = e as { code?: string; cause?: { code?: string } };
      pgCode = failure.code ?? failure.cause?.code;
    }
    assert.equal(pgCode, '23503');
    assert.equal((await row(a)).full_name, 'Alice');
    assert.equal((await audits(a)).length, 0);
  });

  it('19 no-op (same values or empty body) returns the view without audit', async () => {
    await reset();
    const v1 = await service.updateApplicantAccount(
      a,
      { fullName: ' Alice ', phone: '0102', contactOrder: 'primary' },
      actor
    );
    assert.equal(v1.id, a);
    const v2 = await service.updateApplicantAccount(a, {}, actor);
    assert.equal(v2.fullName, 'Alice');
    assert.equal((await audits(a)).length, 0);
  });
});

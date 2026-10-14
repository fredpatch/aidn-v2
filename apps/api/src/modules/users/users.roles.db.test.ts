/** Role writes are atomic: a role the database rejects (for example an enum
 *  value whose migration is still pending) must never leave a user without any
 *  role - that account then lands on « Accès refusé ». Real PostgreSQL, skipped
 *  without DATABASE_URL. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

describe('user role writes are atomic (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let closeAppPool: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let users: Record<string, any>;
  const tag = String(Date.now() % 1_000_000_00);
  const codeOf = (n: number) => `9${tag}${n}`;
  const rolesOf = async (id: number) =>
    (await pool.query('SELECT role FROM user_roles WHERE user_id = $1', [id])).rows.map((r) => r.role as string).sort();

  before(async () => {
    process.env.PERSONNEL_ANAC_ENFORCE = 'false';
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const [service, dbModule] = await Promise.all([import('./users.service.js'), import('../../shared/db/index.js')]);
    users = service;
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    await pool.end();
    await closeAppPool();
  });

  it('createUser: an unknown role rolls the whole creation back (no role-less account)', async () => {
    const code = codeOf(1);
    await assert.rejects(
      users.createUser({ employeeCode: code, fullName: 'Atomic Test', email: `${code}@t.local`, roles: ['dn_agent', 'not_a_role'], createdByUserId: 1 }),
      (error: Error) => error.message !== 'INVALID_EMPLOYEE_CODE' // it failed on the role insert, not earlier
    );
    assert.equal((await pool.query('SELECT 1 FROM users WHERE employee_code = $1', [code])).rowCount, 0);
  });

  it('createUser / updateUserRoles can assign assistant_dn, alone', async () => {
    const code = codeOf(2);
    const { user } = await users.createUser({ employeeCode: code, fullName: 'Assistante Test', email: `${code}@t.local`, roles: ['assistant_dn'], createdByUserId: 1 });
    assert.deepEqual(await rolesOf(user.id), ['assistant_dn']);
    await users.updateUserRoles(user.id, { roles: ['assistant_dn', 'reception'], actorRoles: ['SU'], updatedByUserId: 1 });
    assert.deepEqual(await rolesOf(user.id), ['assistant_dn', 'reception']);
    await users.updateUserRoles(user.id, { roles: ['assistant_dn'], actorRoles: ['SU'], updatedByUserId: 1 });
    assert.deepEqual(await rolesOf(user.id), ['assistant_dn']);
  });

  it('updateUser: a failing role insert keeps the previous roles', async () => {
    const code = codeOf(3);
    const { user } = await users.createUser({ employeeCode: code, fullName: 'Keep Roles', email: `${code}@t.local`, roles: ['reception'], createdByUserId: 1 });
    await assert.rejects(users.updateUser(user.id, { roles: ['dn_agent', 'not_a_role'], updatedByUserId: 1 }));
    assert.deepEqual(await rolesOf(user.id), ['reception']);
  });
});

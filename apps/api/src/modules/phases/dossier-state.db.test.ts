/** K7b - GET /phases/requests/:id/dossier-state tells a phase page whether the
 *  dossier is closed (then the page is read-only). Real PostgreSQL, skipped
 *  without DATABASE_URL. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

process.env.JWT_SECRET ??= 'dossier-context-test-secret';
process.env.JWT_REFRESH_SECRET ??= 'dossier-context-test-refresh-secret';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';

describe('K7b dossier state (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let closeAppPool: () => Promise<void>;
  let getDossierState: typeof import('./phases.service.js').getDossierState;
  const tag = Date.now().toString(36);
  let n = 0;

  before(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const [svc, dbModule] = await Promise.all([
      import('./phases.service.js'),
      import('../../shared/db/index.js'),
    ]);
    getDossierState = svc.getDossierState;
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];

  async function seedRequest(status: string, rejectionReason: string | null = null) {
    const k = `${tag}${n++}`;
    const org = (await one(
      `INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`,
      [`OMA K7b ${k}`]
    )).id;
    const applicant = (await one(
      `INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'P', $2, 'x') RETURNING id`,
      [org, `k7b-${k}@t.local`]
    )).id;
    return (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status, rejection_reason, updated_at)
       VALUES ($1, $2, $3, 'issuance', $4, $5, '2026-10-02T08:00:00Z') RETURNING id`,
      [`DEM-K7B-${k}`, applicant, org, status, rejectionReason]
    )).id as number;
  }

  it('rejected: closed, closing date and reason', async () => {
    const id = await seedRequest('rejected', 'Paiement rejeté - dossier annulé : test');
    const state = await getDossierState(id);
    assert.equal(state.status, 'rejected');
    assert.equal(state.closed, true);
    assert.equal(state.closedAt?.toISOString(), '2026-10-02T08:00:00.000Z');
    assert.equal(state.rejectionReason, 'Paiement rejeté - dossier annulé : test');
  });

  it('cancelled and completed: closed, no reason', async () => {
    for (const status of ['cancelled', 'completed']) {
      const state = await getDossierState(await seedRequest(status, 'stale text'));
      assert.equal(state.closed, true, status);
      assert.ok(state.closedAt, status);
      assert.equal(state.rejectionReason, null, status);
    }
  });

  it('open statuses: not closed, no date, no reason', async () => {
    for (const status of ['pending_review', 'in_progress']) {
      const state = await getDossierState(await seedRequest(status));
      assert.deepEqual(state, { status, closed: false, closedAt: null, rejectionReason: null, identity: null });
    }
  });

  it('unknown dossier: REQUEST_NOT_FOUND (404)', async () => {
    await assert.rejects(getDossierState(2_000_000_000), /REQUEST_NOT_FOUND/);
  });

  describe('DOSSIER-CONTEXT-UX-1 identity', () => {
    const identityOf = async (id: number) => {
      const row = await one(
        `SELECT r.reference, o.name AS organisation FROM requests r JOIN organisations o ON o.id = r.organisation_id WHERE r.id = $1`,
        [id]
      );
      return row as { reference: string; organisation: string };
    };

    it('phase-page roles (DN, Finance, CI) get reference, organisation, applicant and the reading-pane status label', async () => {
      const id = await seedRequest('in_progress');
      const expected = await identityOf(id);
      for (const roles of [['dn_agent'], ['dn_supervisor'], ['SU'], ['s5_agent'], ['r3_agent']]) {
        const state = await getDossierState(id, roles);
        assert.deepEqual(
          state.identity,
          { reference: expected.reference, organisationName: expected.organisation, applicantName: 'P', statusLabel: 'En cours' },
          roles.join()
        );
      }
    });

    it('other staff roles keep the bare state (no identity)', async () => {
      const id = await seedRequest('in_progress');
      for (const roles of [['reception'], ['assistant_dg'], []]) {
        assert.equal((await getDossierState(id, roles)).identity, null, roles.join());
      }
    });

    it('status label is the effective one: closed M7 reads « Terminé », a rejected dossier « Rejeté »', async () => {
      const delivered = await seedRequest('in_progress');
      await pool.query(`INSERT INTO phases (request_id, phase_code, status, closed_at) VALUES ($1, 'M7', 'closed', now())`, [delivered]);
      assert.equal((await getDossierState(delivered, ['dn_agent'])).identity?.statusLabel, 'Terminé');
      const rejected = await seedRequest('rejected', 'motif');
      assert.equal((await getDossierState(rejected, ['s5_agent'])).identity?.statusLabel, 'Rejeté');
    });

    it('HTTP: the route passes the caller roles (CI gets the identity, Réception does not)', async () => {
      const [{ default: express }, { default: cookieParser }, { default: phasesRoute }, jwt, guards] = await Promise.all([
        import('express'),
        import('cookie-parser'),
        import('./phases.route.js'),
        import('../../shared/utils/jwt.js'),
        import('../../shared/guards/auth.middleware.js'),
      ]);
      const app = express();
      app.use(cookieParser());
      app.use('/api/phases', phasesRoute);
      const server = await new Promise<import('node:http').Server>((resolve) => {
        const listening = app.listen(0, () => resolve(listening));
      });
      try {
        const port = (server.address() as import('node:net').AddressInfo).port;
        const id = await seedRequest('in_progress');
        const read = async (roles: string[]) => {
          const token = jwt.signAccessToken({ kind: 'staff', userId: 1, employeeCode: 'E1', roles });
          const response = await fetch(`http://127.0.0.1:${port}/api/phases/requests/${id}/dossier-state`, {
            headers: { Cookie: `${guards.ACCESS_TOKEN_COOKIE}=${token}` },
          });
          assert.equal(response.status, 200);
          return (await response.json()) as { identity: { reference: string } | null };
        };
        assert.equal((await read(['r3_agent'])).identity?.reference, (await identityOf(id)).reference);
        assert.equal((await read(['reception'])).identity, null);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });
});

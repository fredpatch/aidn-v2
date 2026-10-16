/** SESSION1-UX-1 - GET /api/applicant/actions over real HTTP: the router behind
 *  cookie-parser, as in server.ts. Without the applicant cookie: 401. With it
 *  (needs DATABASE_URL): 200 and an array. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

process.env.JWT_SECRET ??= 'ux1-http-test-secret';

describe('GET /api/applicant/actions (HTTP)', () => {
  let server: Server;
  let baseUrl: string;
  let applicantCookie: string;
  let closeAppPool: () => Promise<void>;

  before(async () => {
    const [{ default: express }, { default: cookieParser }, { default: route }, jwt, guards, dbModule] = await Promise.all([
      import('express'),
      import('cookie-parser'),
      import('./applicant-actions.route.js'),
      import('../../shared/utils/jwt.js'),
      import('../../shared/guards/auth.middleware.js'),
      import('../../shared/db/index.js'),
    ]);
    closeAppPool = () => dbModule.db.$client.end();
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api/applicant/actions', route);
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const token = jwt.signApplicantAccessToken({
      kind: 'applicant',
      applicantId: 987654321,
      organisationId: 7,
      email: 'postulant@test.local',
    });
    applicantCookie = `${guards.APPLICANT_ACCESS_TOKEN_COOKIE}=${token}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await closeAppPool();
  });

  it('without the applicant cookie: 401', async () => {
    const response = await fetch(`${baseUrl}/api/applicant/actions`);
    assert.equal(response.status, 401);
  });

  it(
    'with an applicant cookie: 200 and an array',
    { skip: process.env.DATABASE_URL ? false : 'DATABASE_URL not set' },
    async () => {
      const response = await fetch(`${baseUrl}/api/applicant/actions`, { headers: { Cookie: applicantCookie } });
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(await response.json()));
    }
  );
});

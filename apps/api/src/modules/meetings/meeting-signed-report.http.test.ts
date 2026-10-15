/** SESSION1-MEET-2 - POST /api/meetings/:id/signed-report over real HTTP: the
 *  meetings router behind express.json + cookie-parser, as in server.ts. The
 *  body is strict (only uploadAssetId): any other key - an applicantId above
 *  all - is a 400 VALIDATION_ERROR before anything is read, so the applicant
 *  identity can only come from the authentication cookie. No database needed:
 *  every request here is refused before the service runs. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

process.env.JWT_SECRET ??= 'meet2-http-test-secret';

describe('POST /api/meetings/:id/signed-report (HTTP)', () => {
  let server: Server;
  let baseUrl: string;
  let applicantCookie: string;

  before(async () => {
    const [{ default: express }, { default: cookieParser }, { default: meetingsRoute }, jwt, guards] = await Promise.all([
      import('express'),
      import('cookie-parser'),
      import('./meetings.route.js'),
      import('../../shared/utils/jwt.js'),
      import('../../shared/guards/auth.middleware.js'),
    ]);
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api/meetings', meetingsRoute);
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const token = jwt.signApplicantAccessToken({
      kind: 'applicant',
      applicantId: 41,
      organisationId: 7,
      email: 'postulant@test.local',
    });
    applicantCookie = `${guards.APPLICANT_ACCESS_TOKEN_COOKIE}=${token}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  const post = (body: unknown, cookie: string | null = applicantCookie) =>
    fetch(`${baseUrl}/api/meetings/12/signed-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });

  it('rejects an unknown body field (applicantId) with 400 VALIDATION_ERROR', async () => {
    const response = await post({ uploadAssetId: 123, applicantId: 999 });
    assert.equal(response.status, 400);
    const payload = (await response.json()) as { code?: string; message?: string };
    assert.equal(payload.code, 'VALIDATION_ERROR');
    assert.equal(payload.message, 'Seul le fichier téléversé (uploadAssetId) est attendu.');
  });

  it('rejects any other extra key the same way (meetingId, ownerType)', async () => {
    for (const extra of [{ meetingId: 99 }, { ownerType: 'meeting_report' }]) {
      const response = await post({ uploadAssetId: 123, ...extra });
      assert.equal(response.status, 400, JSON.stringify(extra));
      assert.equal(((await response.json()) as { code?: string }).code, 'VALIDATION_ERROR');
    }
  });

  it('rejects a body without uploadAssetId with 400 VALIDATION_ERROR', async () => {
    const response = await post({});
    assert.equal(response.status, 400);
    assert.equal(((await response.json()) as { code?: string }).code, 'VALIDATION_ERROR');
  });

  it('without the applicant cookie: 401, the body is never considered', async () => {
    const response = await post({ uploadAssetId: 123, applicantId: 41 }, null);
    assert.equal(response.status, 401);
  });
});

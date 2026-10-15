/** SESSION1-MEET-1 - who can write on meetings. Static check, no database.
 *  - the applicant has exactly two write routes (confirm, propose-alternate),
 *    authenticated as an applicant only (identity from the token);
 *  - every other write route is DN-only: dn_agent, dn_supervisor, SU - no
 *    other role gains anything. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const routeSource = fs.readFileSync(path.join(dir, 'meetings.route.ts'), 'utf8');

const writeRoutes = [...routeSource.matchAll(/router\.(post|patch|put|delete)\(\s*'([^']+)',([\s\S]*?)\);/g)].map(
  ([, method, routePath, guards]) => ({ route: `${method.toUpperCase()} ${routePath}`, guards })
);

const APPLICANT_WRITES = ['POST /:id/confirm', 'POST /:id/propose-alternate'];
const DN_GUARD = /requireRole\(\s*'dn_agent',\s*'dn_supervisor',\s*'SU'\s*\)/;

describe('meetings write routes', () => {
  it('lists the negotiation commands', () => {
    const routes = writeRoutes.map((r) => r.route);
    for (const expected of [
      ...APPLICANT_WRITES,
      'POST /:id/alternate/accept',
      'POST /:id/alternate/refuse',
      'POST /:id/confirm-on-behalf',
    ]) {
      assert.ok(routes.includes(expected), `${expected} is missing`);
    }
  });

  it('gives the applicant exactly two write routes, applicant-authenticated only', () => {
    const applicantRoutes = writeRoutes.filter((r) => /authenticateApplicant/.test(r.guards)).map((r) => r.route);
    assert.deepEqual(applicantRoutes.sort(), [...APPLICANT_WRITES].sort());
    for (const route of writeRoutes.filter((r) => APPLICANT_WRITES.includes(r.route))) {
      assert.doesNotMatch(route.guards, /authenticateEither|requireRole|requireApplicantOrRole/, route.route);
    }
  });

  it('keeps every other write route DN-only with the same three roles', () => {
    for (const route of writeRoutes.filter((r) => !APPLICANT_WRITES.includes(r.route))) {
      assert.match(route.guards, /\bauthenticate\b/, route.route);
      assert.match(route.guards, DN_GUARD, `${route.route} must require exactly dn_agent, dn_supervisor, SU`);
    }
  });
});

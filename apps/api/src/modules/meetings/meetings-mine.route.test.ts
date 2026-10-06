/** GET /meetings/mine guardrails (portal "Mes réunions").
 *  Static checks, no database needed - same approach as the requests
 *  reference invariant:
 *  - '/mine' must be declared before '/:id', otherwise Express routes
 *    "mine" to the by-id handler (Number("mine") -> NaN -> 404);
 *  - it must stay applicant-only: staff use the cockpit list ('/');
 *  - the service query must scope by requests.applicantId (ownership in the
 *    WHERE clause, not a post-filter). */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const routeSource = fs.readFileSync(path.join(dir, 'meetings.route.ts'), 'utf8');
const serviceSource = fs.readFileSync(path.join(dir, 'meetings.service.ts'), 'utf8');

function routeIndex(pathLiteral: string): number {
  const match = new RegExp(`router\\.get\\(\\s*['"]${pathLiteral}['"]`).exec(routeSource);
  return match ? match.index : -1;
}

describe('GET /meetings/mine', () => {
  it("is declared before '/:id' so it is not shadowed", () => {
    const mine = routeIndex('/mine');
    const byId = routeIndex('/:id');
    assert.ok(mine !== -1, "route '/mine' is missing");
    assert.ok(byId !== -1, "route '/:id' is missing");
    assert.ok(mine < byId, "'/mine' must be registered before '/:id'");
  });

  it('is guarded by authenticateApplicant only', () => {
    const line = routeSource.slice(routeIndex('/mine')).split(');')[0];
    assert.match(line, /authenticateApplicant/);
    assert.doesNotMatch(line, /authenticateEither|requireRole|requireApplicantOrRole/);
  });

  it('scopes the query by the requesting applicant', () => {
    const start = serviceSource.indexOf('export async function listApplicantMeetings');
    assert.ok(start !== -1, 'listApplicantMeetings is missing');
    const body = serviceSource.slice(start, serviceSource.indexOf('\nexport async function', start + 1));
    assert.match(body, /\.where\(\s*eq\(requests\.applicantId,\s*applicantId\)\s*\)/);
    assert.doesNotMatch(body, /dnAgentId/, 'agent ids must not be exposed to applicants');
  });
});

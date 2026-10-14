/** SESSION1-M1-1 - role boundaries of the two circuit inboxes, exercised on the
 *  real routers' guard middleware (no database). */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import courrierRoute from '../courrier-tasks/courrier-tasks.route.js';
import dnAnnotationRoute from './dn-annotation.route.js';

type Layer = { handle: (req: Request, res: Response, next: () => void) => void };

/** The role guard is the router-level layer after `authenticate`. */
function roleGuard(router: unknown): Layer['handle'] {
  const stack = (router as { stack: Layer[] }).stack;
  return stack[1].handle;
}

function passes(router: unknown, role: string): boolean {
  let allowed = false;
  const res = { status: () => ({ json: () => undefined }) } as unknown as Response;
  roleGuard(router)({ user: { userId: 1, roles: [role] } } as unknown as Request, res, () => {
    allowed = true;
  });
  return allowed;
}

describe('courrier inbox (Réception / Assistant DG)', () => {
  it('stays closed to assistant_dn and the DN agents', () => {
    for (const role of ['reception', 'assistant_dg', 'SU']) assert.equal(passes(courrierRoute, role), true, role);
    for (const role of ['assistant_dn', 'dn_agent', 'dn_supervisor', 'r3_agent', 's5_agent']) {
      assert.equal(passes(courrierRoute, role), false, role);
    }
  });
});

describe('Circuit Directeur DN inbox (Assistante DN)', () => {
  it('is open to assistant_dn and SU only', () => {
    for (const role of ['assistant_dn', 'SU']) assert.equal(passes(dnAnnotationRoute, role), true, role);
    for (const role of ['reception', 'assistant_dg', 'dn_agent', 'dn_supervisor', 'r3_agent', 's5_agent']) {
      assert.equal(passes(dnAnnotationRoute, role), false, role);
    }
  });
});

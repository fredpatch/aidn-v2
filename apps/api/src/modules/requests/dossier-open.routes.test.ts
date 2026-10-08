/** K7 - every write route of the workflow modules is known. A new POST /
 *  PATCH / PUT / DELETE route makes this test fail on purpose: guard its
 *  service with requests/dossier-open.ts (a closed dossier is read-only),
 *  add it to the matrix in dossier-open.db.test.ts, then add it here.
 *  Static check, no database needed. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const modulesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW_MODULES = [
  'phases',
  'preliminary-evaluation',
  'formal-request',
  'deep-evaluation',
  'site-inspection',
  'certificates',
  'meetings',
  'courrier-tasks',
  'requests',
];

/** Route -> why a closed dossier cannot reach it (guard or own rule). */
const KNOWN_WRITE_ROUTES: Record<string, string> = {
  'phases POST /requests/:requestId/start-preliminary-phase': 'requires pending_review',
  'phases POST /:id/close': 'guarded',
  'preliminary-evaluation POST /:phaseId/make-available': 'guarded',
  'preliminary-evaluation POST /:phaseId/submit': 'guarded',
  'formal-request POST /requests/:requestId/start-formal-phase': 'guarded',
  'formal-request POST /requests/:requestId/letter': 'guarded',
  'formal-request POST /requests/:requestId/letter/mark-signed': 'guarded',
  'formal-request POST /requests/:requestId/letter/mark-pending-review': 'guarded',
  'formal-request POST /requests/:requestId/documents': 'guarded',
  'formal-request POST /phases/:phaseId/close': 'guarded',
  'deep-evaluation POST /requests/:requestId/start-deep-evaluation': 'guarded',
  'deep-evaluation POST /phases/:phaseId/invoice': 'guarded',
  'deep-evaluation POST /phases/:phaseId/requests/:requestId/proof': 'guarded',
  'deep-evaluation POST /phases/:phaseId/payment/validate': 'guarded',
  'deep-evaluation POST /phases/:phaseId/payment/reject': 'guarded',
  'deep-evaluation PATCH /evaluations/:evaluationId/verdict': 'guarded',
  'deep-evaluation POST /evaluations/:evaluationId/resubmit': 'guarded',
  'deep-evaluation POST /phases/:phaseId/close': 'guarded',
  'site-inspection POST /requests/:requestId/start-site-inspection': 'guarded',
  'site-inspection POST /phases/:phaseId/invoice': 'guarded',
  'site-inspection POST /phases/:phaseId/requests/:requestId/proof': 'guarded',
  'site-inspection POST /phases/:phaseId/payment/validate': 'guarded',
  'site-inspection POST /phases/:phaseId/payment/reject': 'guarded',
  'site-inspection POST /phases/:phaseId/site-visit': 'guarded',
  'site-inspection PATCH /site-visits/:meetingId/held': 'guarded',
  'site-inspection POST /phases/:phaseId/verdict': 'guarded',
  'certificates POST /requests/:requestId/start-delivery': 'guarded',
  'certificates POST /phases/:phaseId/invoice': 'guarded',
  'certificates POST /phases/:phaseId/requests/:requestId/proof': 'guarded',
  'certificates POST /phases/:phaseId/payment/validate': 'guarded',
  'certificates POST /phases/:phaseId/payment/reject': 'guarded',
  'certificates PATCH /:certificateId/fields': 'guarded',
  'certificates POST /:certificateId/type': 'guarded',
  'certificates POST /:certificateId/generate': 'guarded',
  'certificates POST /:certificateId/printed': 'guarded',
  'certificates POST /:certificateId/signed': 'guarded',
  'certificates POST /:certificateId/archived': 'guarded',
  'certificates POST /:certificateId/notify': 'guarded',
  'certificates POST /:certificateId/collected': 'guarded',
  'meetings POST /': 'guarded',
  'meetings PATCH /:id/status': 'guarded',
  'meetings POST /:id/reschedule': 'guarded',
  'meetings POST /:id/report': 'guarded',
  'courrier-tasks POST /:taskId/confirm-printed-for-signature': 'guarded',
  'courrier-tasks POST /:taskId/return-signed': 'guarded',
  'requests POST /': 'creates a new dossier (one-active rule)',
  'requests POST /:id/send-to-signature': 'guarded',
  'requests POST /:id/confirm-printed-for-signature': 'guarded',
  'requests POST /:id/mark-signed': 'guarded',
  'requests POST /:id/mark-pending-review': 'guarded',
  'requests POST /:id/return-signed-from-dg': 'guarded',
  'requests POST /:id/cancel': 'guarded',
  'requests POST /:id/replace-document': 'guarded',
};

function writeRoutes(): string[] {
  const found: string[] = [];
  for (const mod of WORKFLOW_MODULES) {
    const dir = path.join(modulesRoot, mod);
    for (const file of fs.readdirSync(dir).filter((f) => /\.route\.ts$/.test(f))) {
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      for (const match of source.matchAll(/router\.(post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)) {
        found.push(`${mod} ${match[1].toUpperCase()} ${match[2]}`);
      }
    }
  }
  return found.sort();
}

describe('K7 write routes of the workflow modules', () => {
  it('are all known (a new one must be guarded against closed dossiers)', () => {
    assert.deepEqual(writeRoutes(), Object.keys(KNOWN_WRITE_ROUTES).sort());
  });

  it('the service of each guarded module calls the closed-dossier guard', () => {
    for (const mod of WORKFLOW_MODULES.filter((m) => m !== 'requests')) {
      const service = fs
        .readdirSync(path.join(modulesRoot, mod))
        .filter((f) => /\.service\.ts$/.test(f))
        .map((f) => fs.readFileSync(path.join(modulesRoot, mod, f), 'utf8'))
        .join('\n');
      assert.match(service, /assert\w*DossierOpen\(/, `${mod}: no closed-dossier guard`);
    }
  });
});

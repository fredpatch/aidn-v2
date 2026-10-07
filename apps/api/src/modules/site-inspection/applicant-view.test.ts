/** Applicant view of the M6 bundle: the "avis R3" and the assigned R3 agent
 *  never leave the server for an applicant. Pure functions, no database. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toApplicantSiteInspectionBundle } from './applicant-view.js';
import type { SiteInspectionBundle } from './site-inspection.types.js';

const AT = new Date('2026-10-13T08:00:00Z');
const full = (): SiteInspectionBundle => ({
  phase: { id: 6, status: 'open', openedAt: AT, closedAt: null },
  payment: {
    id: 3,
    status: 'validated',
    invoiceFileUrl: 'u/i',
    invoiceUploadedAt: AT,
    proofFileUrl: 'u/p',
    proofUploadedAt: AT,
    validatedAt: AT,
    rejectionReason: null,
    rejectionAction: null,
  },
  siteVisit: { id: 9, r3AgentId: 42, scheduledAt: AT, location: 'Hangar 3', status: 'held' },
  inspection: {
    id: 1,
    r3AgentId: 42,
    verdict: 'non_compliant',
    note: 'Avis interne DN',
    submittedAt: AT,
  },
});

describe('toApplicantSiteInspectionBundle', () => {
  it('never carries the avis R3, even when one exists', () => {
    const out = toApplicantSiteInspectionBundle(full());
    assert.equal(out.inspection, null);
    const json = JSON.stringify(out);
    assert.doesNotMatch(json, /Avis interne DN|non_compliant|verdict/);
  });

  it('drops the assigned R3 agent id from the site visit, keeps what the applicant needs', () => {
    const out = toApplicantSiteInspectionBundle(full());
    assert.deepEqual(out.siteVisit, {
      id: 9,
      scheduledAt: AT,
      location: 'Hangar 3',
      status: 'held',
    });
    assert.doesNotMatch(JSON.stringify(out), /r3AgentId|"42"|:42\b/);
  });

  it('whitelist: a field added to the source later is not passed through', () => {
    const source = full();
    (source.siteVisit as unknown as Record<string, unknown>).internalNote = 'secret';
    assert.doesNotMatch(
      JSON.stringify(toApplicantSiteInspectionBundle(source)),
      /internalNote|secret/
    );
  });

  it('phase and own payment are unchanged; empty bundle stays empty', () => {
    const source = full();
    const out = toApplicantSiteInspectionBundle(source);
    assert.equal(out.phase, source.phase);
    assert.equal(out.payment, source.payment);
    assert.deepEqual(
      toApplicantSiteInspectionBundle({
        phase: null,
        payment: null,
        siteVisit: null,
        inspection: null,
      }),
      { phase: null, payment: null, siteVisit: null, inspection: null }
    );
  });

  it('does not mutate the staff bundle it reads from', () => {
    const source = full();
    toApplicantSiteInspectionBundle(source);
    assert.equal(source.siteVisit?.r3AgentId, 42);
    assert.equal(source.inspection?.note, 'Avis interne DN');
  });
});

describe('GET /site-inspection/by-request/:id - wiring', () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const controller = fs.readFileSync(path.join(dir, 'site-inspection.controller.ts'), 'utf8');
  const getBundle = controller.slice(controller.indexOf('export async function getBundle'));
  // Bound the slice at the next export: the body holds indented closers
  // (try/catch), and no file ending puts a newline after the final '}' - so
  // '\n}\n' can miss (-1) and let the slice swallow the rest of the file.
  const nextExport = getBundle.indexOf('\nexport ', 1);
  const body = nextExport === -1 ? getBundle : getBundle.slice(0, nextExport);

  it('an applicant caller gets the applicant view, staff the full bundle', () => {
    assert.match(body, /req\.applicant \? toApplicantSiteInspectionBundle\(bundle\) : bundle/);
  });
  it('no other res.json in the handler could bypass it', () => {
    assert.equal((body.match(/res\.json\(/g) ?? []).length, 1);
  });
});

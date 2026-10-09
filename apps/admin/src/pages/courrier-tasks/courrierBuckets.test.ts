/** C2b - Courriers à traiter rules: tabs (K7d), step date, sorting and day
 *  grouping, signature wait and the one action offered. */
import { describe, expect, it } from 'vitest';
import type { CourrierTask } from '../../lib/api/courrier-tasks';
import {
  averageSignatureWait,
  countTabs,
  courrierActionKind,
  defaultSortFor,
  filterCourriers,
  groupCourriersByDay,
  inTab,
  isSignatureLate,
  signatureWaitDays,
  stepDateOf,
} from './courrierBuckets';

// Friday 9 October 2026, local time.
const NOW = new Date(2026, 9, 9, 12, 0);
const at = (day: number, month = 9) => new Date(2026, month, day, 10, 0).toISOString();

const task = (over: Partial<CourrierTask>): CourrierTask => ({
  id: 'formal_request_letter:1',
  source: 'formal_request_letter',
  bucket: 'to_signature',
  requestId: 1,
  requestReference: 'DEM-2026-10-01-ORG-01',
  requestType: 'issuance',
  organisationName: 'OMA Estuaire',
  applicantName: 'Jean Mba',
  circuitDocumentId: 1,
  circuitStatus: 'submitted',
  fileUrl: '/api/files/lettre.pdf',
  mimeType: 'application/pdf',
  depositedAt: at(5),
  signatureSentAt: null,
  signedAt: null,
  pendingReviewAt: null,
  availableActions: ['print', 'confirm_signature_circuit'],
  dossierStatus: 'in_progress',
  dossierClosed: false,
  ...over,
});

const closed = { dossierStatus: 'rejected', dossierClosed: true, availableActions: [] };

describe('tabs (K7d)', () => {
  it('a closed dossier leaves « À imprimer » and « En signature », stays under « Tous »', () => {
    const toPrint = task({ ...closed });
    const inSign = task({ ...closed, bucket: 'in_signature', signatureSentAt: at(6) });
    expect(inTab(toPrint, 'to_signature')).toBe(false);
    expect(inTab(inSign, 'in_signature')).toBe(false);
    expect(inTab(toPrint, 'all')).toBe(true);
  });

  it('a returned courrier keeps its tab even on a closed dossier; legacy signed only under « Tous »', () => {
    expect(inTab(task({ ...closed, bucket: 'returned' }), 'returned')).toBe(true);
    const legacy = task({ bucket: 'legacy_signed' });
    expect(
      ['to_signature', 'in_signature', 'returned'].some((t) => inTab(legacy, t as never))
    ).toBe(false);
    expect(inTab(legacy, 'all')).toBe(true);
  });

  it('counts follow the same rule', () => {
    const counts = countTabs([
      task({}),
      task({ ...closed }),
      task({ bucket: 'in_signature', signatureSentAt: at(6) }),
      task({ bucket: 'returned' }),
      task({ bucket: 'legacy_signed' }),
    ]);
    expect(counts).toEqual({ to_signature: 1, in_signature: 1, returned: 1, all: 5 });
  });
});

describe('step date, sorting and grouping', () => {
  it('uses the date of the current step', () => {
    expect(stepDateOf(task({}))).toBe(at(5));
    expect(stepDateOf(task({ bucket: 'in_signature', signatureSentAt: at(7) }))).toBe(at(7));
    expect(stepDateOf(task({ bucket: 'returned', pendingReviewAt: at(8) }))).toBe(at(8));
  });

  it('work queues are oldest first, history newest first', () => {
    expect(defaultSortFor('to_signature')).toBe('oldest');
    expect(defaultSortFor('in_signature')).toBe('oldest');
    expect(defaultSortFor('returned')).toBe('newest');
    expect(defaultSortFor('all')).toBe('newest');
  });

  it('filters by tab and accent-insensitive search (source label included), sorted by step date', () => {
    const a = task({ id: 'a', depositedAt: at(9), organisationName: 'Aéro Ogooué' });
    const b = task({ id: 'b', depositedAt: at(1), source: 'pre_evaluation' });
    const list = filterCourriers([a, b], { tab: 'to_signature', search: '', sort: 'oldest' });
    expect(list.map((t) => t.id)).toEqual(['b', 'a']);
    expect(filterCourriers([a, b], { tab: 'all', search: 'aero ogooue', sort: 'oldest' })).toEqual([
      a,
    ]);
    expect(
      filterCourriers([a, b], { tab: 'all', search: 'pré-évaluation', sort: 'oldest' })
    ).toEqual([b]);
  });

  it('groups by day in the list order (oldest first: older groups on top)', () => {
    const list = [
      task({ id: 'old', depositedAt: at(1) }),
      task({ id: 'today', depositedAt: at(9) }),
    ];
    const groups = groupCourriersByDay(list, NOW);
    expect(groups.map((g) => g.label)).toEqual(['Plus ancien', "Aujourd'hui"]);
  });
});

describe('signature wait and action', () => {
  it('counts whole days since the signature was sent; late from 7 days, never on a closed dossier', () => {
    const late = task({ bucket: 'in_signature', signatureSentAt: at(1) });
    expect(signatureWaitDays(late, NOW)).toBe(8);
    expect(isSignatureLate(late, NOW)).toBe(true);
    expect(isSignatureLate(task({ ...late, ...closed }), NOW)).toBe(false);
    expect(signatureWaitDays(task({}), NOW)).toBeNull();
    expect(
      averageSignatureWait([late, task({ bucket: 'in_signature', signatureSentAt: at(8) })], NOW)
    ).toBe('4,5 j');
  });

  it('print to sign, scan the return, nothing otherwise or on a closed dossier (K7c)', () => {
    expect(courrierActionKind(task({}))).toBe('print');
    expect(courrierActionKind(task({ bucket: 'in_signature' }))).toBe('return');
    expect(courrierActionKind(task({ bucket: 'returned' }))).toBe('none');
    expect(courrierActionKind(task({ ...closed }))).toBe('none');
  });
});

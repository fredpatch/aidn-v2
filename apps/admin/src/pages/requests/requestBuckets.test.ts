/** D1 - Demandes cockpit rules: exclusive tabs, search, day grouping and
 *  what the reading pane offers. */
import { describe, expect, it } from 'vitest';
import type { RequestCockpitItem } from '../../lib/api/requests.types';
import {
  bucketOf,
  countBuckets,
  dayGroupOf,
  filterRequests,
  groupRequestsByDay,
  nextActionKind,
} from './requestBuckets';

const item = (over: Partial<RequestCockpitItem>): RequestCockpitItem => ({
  id: 1,
  reference: 'DEM-2026-10-01-ORG-01',
  requestType: 'issuance',
  requestTypeLabel: 'Delivrance',
  status: 'in_progress',
  statusLabel: 'En cours',
  circuitStatus: 'completed',
  circuitStatusLabel: 'Circuit termine',
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z',
  lastActivityAt: '2026-10-01T09:00:00.000Z',
  unread: false,
  organisationName: 'OMA Test',
  organisationEmail: null,
  organisationPhone: null,
  applicantName: 'Jean Test',
  applicantEmail: 'jean@test.ga',
  applicantPhone: null,
  currentPhaseCode: 'M4',
  currentPhaseLabel: 'Demande formelle',
  phases: [],
  documentSummary: { completed: 0, missing: 0, pending: 0, total: 0 },
  nextActionLabel: 'Poursuivre Demande formelle',
  nextActionDescription: '',
  nextActionHref: '/demandes/1/phase-formelle',
  nextActionTone: 'info',
  canStartPreliminary: false,
  activity: [],
  ...over,
});

describe('bucketOf', () => {
  it('closed wins over the signature circuit (K7: rejected, cancelled and completed are closed)', () => {
    expect(bucketOf(item({ status: 'rejected', circuitStatus: 'submitted' }))).toBe('closed');
    expect(bucketOf(item({ status: 'cancelled', circuitStatus: null }))).toBe('closed');
    expect(bucketOf(item({ status: 'completed' }))).toBe('closed');
  });

  it('an unfinished DG circuit is « En attente DG »', () => {
    for (const circuitStatus of ['submitted', 'in_signature_circuit', 'signed']) {
      expect(bucketOf(item({ status: 'submitted', circuitStatus }))).toBe('waiting_dg');
    }
  });

  it('everything else is « À traiter », including a signed return ready to open', () => {
    expect(bucketOf(item({ status: 'pending_review', circuitStatus: 'pending_review' }))).toBe(
      'todo'
    );
    expect(bucketOf(item({ status: 'in_progress' }))).toBe('todo');
  });

  it('counts are exclusive: the buckets add up to « Toutes »', () => {
    const counts = countBuckets([
      item({ status: 'pending_review', circuitStatus: 'pending_review' }),
      item({ status: 'in_progress' }),
      item({ status: 'submitted', circuitStatus: 'in_signature_circuit' }),
      item({ status: 'rejected' }),
      item({ status: 'completed' }),
    ]);
    expect(counts).toEqual({ all: 5, todo: 2, waiting_dg: 1, closed: 2 });
    expect(counts.todo + counts.waiting_dg + counts.closed).toBe(counts.all);
  });
});

describe('filterRequests', () => {
  const items = [
    item({
      id: 1,
      organisationName: 'Aéro Ogooué',
      createdAt: '2026-10-01T09:00:00.000Z',
      reference: 'B',
    }),
    item({
      id: 2,
      organisationName: 'Sky Technic',
      createdAt: '2026-10-03T09:00:00.000Z',
      reference: 'A',
    }),
    item({ id: 3, status: 'rejected', createdAt: '2026-10-02T09:00:00.000Z', reference: 'C' }),
  ];

  it('filters by bucket and accent-insensitive search', () => {
    expect(
      filterRequests(items, { bucket: 'closed', search: '', sort: 'newest' }).map((i) => i.id)
    ).toEqual([3]);
    expect(
      filterRequests(items, { bucket: 'all', search: 'aero', sort: 'newest' }).map((i) => i.id)
    ).toEqual([1]);
  });

  it('sorts by submission date or reference', () => {
    expect(
      filterRequests(items, { bucket: 'all', search: '', sort: 'newest' }).map((i) => i.id)
    ).toEqual([2, 3, 1]);
    expect(
      filterRequests(items, { bucket: 'all', search: '', sort: 'oldest' }).map((i) => i.id)
    ).toEqual([1, 3, 2]);
    expect(
      filterRequests(items, { bucket: 'all', search: '', sort: 'reference' }).map((i) => i.id)
    ).toEqual([2, 1, 3]);
  });
});

describe('day grouping', () => {
  // Wednesday 7 October 2026, 10:00 local time; the week started Monday 5.
  const now = new Date(2026, 9, 7, 10, 0);
  const at = (d: number, h = 9) => new Date(2026, 9, d, h, 0).toISOString();

  it('today, yesterday, this week (from Monday), older', () => {
    expect(dayGroupOf(at(7, 8), now)).toBe('today');
    expect(dayGroupOf(at(8), now)).toBe('today'); // clock skew: future counts as today
    expect(dayGroupOf(at(6, 23), now)).toBe('yesterday');
    expect(dayGroupOf(at(5, 0), now)).toBe('week');
    expect(dayGroupOf(at(4, 23), now)).toBe('older');
  });

  it('keeps the sort order and labels each group; no groups when sorted by reference', () => {
    const items = [
      item({ id: 1, createdAt: at(7) }),
      item({ id: 2, createdAt: at(7, 8) }),
      item({ id: 3, createdAt: at(1) }),
    ];
    const groups = groupRequestsByDay(items, 'newest', now);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ["Aujourd'hui", [1, 2]],
      ['Plus ancien', [3]],
    ]);
    expect(groupRequestsByDay(items, 'reference', now)).toEqual([
      { key: 'flat', label: null, items },
    ]);
    expect(groupRequestsByDay([], 'newest', now)).toEqual([]);
  });
});

describe('nextActionKind', () => {
  it('start, treat, consult (closed with a page), readonly', () => {
    expect(nextActionKind(item({ status: 'pending_review', canStartPreliminary: true }))).toBe(
      'start'
    );
    expect(nextActionKind(item({}))).toBe('treat');
    expect(
      nextActionKind(item({ status: 'completed', nextActionHref: '/demandes/1/delivrance' }))
    ).toBe('consult');
    expect(nextActionKind(item({ status: 'rejected', nextActionHref: null }))).toBe('readonly');
    expect(
      nextActionKind(
        item({ status: 'submitted', circuitStatus: 'submitted', nextActionHref: null })
      )
    ).toBe('readonly');
  });
});

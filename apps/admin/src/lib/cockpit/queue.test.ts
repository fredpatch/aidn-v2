import { describe, expect, it } from 'vitest';
import { defaultOrderFor, filterQueue, groupQueue, sortQueue } from './queue';

const row = (id: string, urgency: 'normal' | 'warning' | 'overdue', stepSince: string | null, bucket = 'a') => ({
  id, urgency, stepSince, bucket,
});

describe('sortQueue', () => {
  it('action mode: overdue, warning, normal; oldest first inside; null dates last; id tie-break', () => {
    const items = [
      row('n1', 'normal', '2026-10-10T09:00:00Z'),
      row('o2', 'overdue', '2026-10-09T09:00:00Z'),
      row('w1', 'warning', null),
      row('o1', 'overdue', '2026-10-01T09:00:00Z'),
      row('w0', 'warning', '2026-10-12T09:00:00Z'),
      row('n0', 'normal', '2026-10-10T09:00:00Z'),
    ];
    expect(sortQueue(items, 'action', 'oldest').map((i) => i.id)).toEqual(['o1', 'o2', 'w0', 'w1', 'n0', 'n1']);
    expect(sortQueue(items, 'action', 'newest').map((i) => i.id)).toEqual(['o2', 'o1', 'w0', 'w1', 'n0', 'n1']);
  });

  it('history mode: date only, newest first by default, nulls last', () => {
    const items = [row('a', 'overdue', '2026-10-01T09:00:00Z'), row('b', 'normal', null), row('c', 'normal', '2026-10-05T09:00:00Z')];
    expect(sortQueue(items, 'history', 'newest').map((i) => i.id)).toEqual(['c', 'a', 'b']);
    expect(sortQueue(items, 'history', 'oldest').map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });

  it('defaults: action oldest first, history newest first', () => {
    expect(defaultOrderFor('action')).toBe('oldest');
    expect(defaultOrderFor('waiting')).toBe('oldest');
    expect(defaultOrderFor('history')).toBe('newest');
  });
});

describe('groupQueue', () => {
  it('action mode: one group per urgency present, labelled', () => {
    const groups = groupQueue(sortQueue([row('a', 'normal', null), row('b', 'overdue', null)], 'action', 'oldest'), 'action');
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['En retard', ['b']],
      ['À traiter', ['a']],
    ]);
  });

  it('waiting mode: urgency first like action, but a normal item is « En attente », never « À traiter »', () => {
    const items = [row('n', 'normal', '2026-10-01T09:00:00Z'), row('o', 'overdue', '2026-10-05T09:00:00Z'), row('w', 'warning', null)];
    const groups = groupQueue(sortQueue(items, 'waiting', 'oldest'), 'waiting');
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['En retard', ['o']],
      ['Échéance proche', ['w']],
      ['En attente', ['n']],
    ]);
    expect(groups.some((g) => g.label === 'À traiter')).toBe(false);
  });

  it('history mode: day groups; a null date never produces Invalid Date', () => {
    const now = new Date('2026-10-16T12:00:00Z');
    const groups = groupQueue([row('a', 'normal', '2026-10-16T08:00:00Z'), row('b', 'normal', null)], 'history', now);
    expect(groups.map((g) => g.label)).toEqual(["Aujourd'hui", 'Plus ancien']);
  });
});

describe('filterQueue', () => {
  const items = [row('x', 'normal', null, 'to_print'), row('y', 'normal', null, 'inactive')];
  it('« all » keeps inactive rows; a bucket tab keeps its bucket only; search is accent-insensitive', () => {
    expect(filterQueue(items, 'all', '', () => '').map((i) => i.id)).toEqual(['x', 'y']);
    expect(filterQueue(items, 'to_print', '', () => '').map((i) => i.id)).toEqual(['x']);
    expect(filterQueue(items, 'all', 'societe', (i) => (i.id === 'x' ? 'Société' : 'autre')).map((i) => i.id)).toEqual(['x']);
  });
});

import { describe, expect, it } from 'vitest';
import { MEETING_STATUS_LABELS, PAYMENT_STATUS_LABELS, labelOf } from './constants';

describe('labelOf - a backend code never reaches the screen', () => {
  it('translates a known code', () => expect(labelOf(PAYMENT_STATUS_LABELS, 'validated')).toBe('Paiement validé'));
  it('unknown code -> fallback, not the raw value', () => expect(labelOf(MEETING_STATUS_LABELS, 'brand_new_status')).toBe('Non renseigné'));
  it('empty value -> custom fallback', () => expect(labelOf(PAYMENT_STATUS_LABELS, null, 'En attente')).toBe('En attente'));
});

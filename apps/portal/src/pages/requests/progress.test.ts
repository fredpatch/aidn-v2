import { describe, expect, it } from 'vitest';
import type { PhaseCode } from '../../lib/react-query/queryKeys';
import {
  buildBanner,
  buildProgressItems,
  isIntakeDone,
  isTerminalDossier,
  phasesReachable,
  phaseStage,
  type PhasePresentation,
  type PhaseSnapshot,
} from './progress';

const snap = (over: Partial<PhaseSnapshot> = {}): PhaseSnapshot => ({
  enabled: true,
  isLoading: false,
  loadFailed: false,
  phaseStatus: null,
  presentation: null,
  summary: null,
  ...over,
});
const open = (presentation: PhasePresentation) => snap({ phaseStatus: 'open', presentation, summary: 'résumé' });
const closed = (summary = 'résumé') => snap({ phaseStatus: 'closed', presentation: { title: 't', description: 'd', tone: 'success' }, summary });

function items(over: Partial<Record<PhaseCode, PhaseSnapshot>> = {}) {
  const base: Record<PhaseCode, PhaseSnapshot> = { M3: snap(), M4: snap(), M5: snap(), M6: snap(), M7: snap() };
  return buildProgressItems({ ...base, ...over });
}

const inProgress = { status: 'in_progress', circuitStatus: 'pending_review', rejectionReason: null };

describe('phaseStage', () => {
  it('not fetched (gated) -> upcoming', () => expect(phaseStage(snap({ enabled: false }))).toBe('upcoming'));
  it('load failed wins over loading', () => expect(phaseStage(snap({ loadFailed: true, isLoading: true }))).toBe('error'));
  it('loading', () => expect(phaseStage(snap({ isLoading: true }))).toBe('loading'));
  it('loaded, phase not opened -> upcoming', () => expect(phaseStage(snap())).toBe('upcoming'));
  it('open -> current', () => expect(phaseStage(snap({ phaseStatus: 'open' }))).toBe('current'));
  it('closed', () => expect(phaseStage(snap({ phaseStatus: 'closed' }))).toBe('closed'));
});

describe('buildProgressItems', () => {
  it('keeps the 5 phases in workflow order with their stage', () => {
    const result = items({ M3: closed(), M4: open({ title: 't', description: 'd', tone: 'info' }) });
    expect(result.map((i) => i.code)).toEqual(['M3', 'M4', 'M5', 'M6', 'M7']);
    expect(result.map((i) => i.stage)).toEqual(['closed', 'current', 'upcoming', 'upcoming', 'upcoming']);
  });
});

describe('dossier status helpers', () => {
  it.each(['completed', 'rejected', 'cancelled'])('%s is terminal', (status) =>
    expect(isTerminalDossier({ status })).toBe(true));
  it.each(['submitted', 'signed', 'pending_review', 'in_progress'])('%s is not terminal', (status) =>
    expect(isTerminalDossier({ status })).toBe(false));

  it('intake done once handed to the DN, or once processed', () => {
    expect(isIntakeDone({ status: 'submitted', circuitStatus: 'submitted' })).toBe(false);
    expect(isIntakeDone({ status: 'signed', circuitStatus: 'signed' })).toBe(false);
    expect(isIntakeDone({ status: 'pending_review', circuitStatus: 'pending_review' })).toBe(true);
    expect(isIntakeDone({ status: 'completed', circuitStatus: 'pending_review' })).toBe(true);
  });

  it('a cancelled dossier never reached the DN: no phase is fetched', () => {
    expect(isIntakeDone({ status: 'cancelled', circuitStatus: 'submitted' })).toBe(false);
    expect(phasesReachable({ status: 'cancelled' })).toBe(false);
  });

  it('M4-M7 are reachable while processing and after a final outcome', () => {
    for (const status of ['in_progress', 'completed', 'rejected']) expect(phasesReachable({ status })).toBe(true);
    for (const status of ['submitted', 'signed', 'pending_review']) expect(phasesReachable({ status })).toBe(false);
  });
});

describe('buildBanner - active dossier', () => {
  it('waits for every phase before speaking (no flicker)', () => {
    expect(buildBanner(inProgress, items({ M3: closed(), M4: snap({ isLoading: true }) }))).toBeNull();
  });

  it('warning tone on the current phase -> "Action requise", with that phase\'s own text', () => {
    const banner = buildBanner(inProgress, items({ M3: closed(), M4: open({ title: 'Pièces à compléter', description: 'Déposez…', tone: 'warning' }) }));
    expect(banner).toMatchObject({ kind: 'action', eyebrow: 'Action requise', title: 'Pièces à compléter', description: 'Déposez…' });
  });

  it('any other tone -> waiting for ANAC', () => {
    const banner = buildBanner(inProgress, items({ M5: open({ title: 'Quittance en validation', description: '…', tone: 'info' }) }));
    expect(banner).toMatchObject({ kind: 'waiting', eyebrow: "En attente de l'ANAC", title: 'Quittance en validation' });
  });

  it('between two phases -> announces the next step after the last closed one', () => {
    const banner = buildBanner(inProgress, items({ M3: closed(), M4: closed() }));
    expect(banner).toMatchObject({ kind: 'waiting', title: 'Demande formelle : étape clôturée' });
  });

  it('a failing phase with nothing current -> no banner rather than a wrong one', () => {
    expect(buildBanner(inProgress, items({ M3: closed(), M4: snap({ loadFailed: true }) }))).toBeNull();
  });

  it.each([
    ['submitted', 'Demande déposée'],
    ['in_signature_circuit', 'Demande en signature'],
    ['signed', 'Demande signée'],
    ['pending_review', 'Transmise à la Direction de la Navigabilité'],
  ])('intake, circuit %s -> "%s"', (circuitStatus, title) => {
    const gated = items({ M3: snap({ enabled: false }), M4: snap({ enabled: false }), M5: snap({ enabled: false }), M6: snap({ enabled: false }), M7: snap({ enabled: false }) });
    expect(buildBanner({ status: 'submitted', circuitStatus, rejectionReason: null }, gated)).toMatchObject({ kind: 'waiting', title });
  });
});

describe('buildBanner - terminal dossier (outcome replaces "what now")', () => {
  it('completed -> done, titled with the delivery summary', () => {
    const banner = buildBanner({ status: 'completed', circuitStatus: 'pending_review', rejectionReason: null }, items({ M7: closed('Certificat retiré le 05/10/2026') }));
    expect(banner).toMatchObject({ kind: 'done', eyebrow: 'Dossier terminé', title: 'Certificat retiré le 05/10/2026' });
  });

  it('rejected -> shows the reason', () => {
    const banner = buildBanner({ status: 'rejected', circuitStatus: 'pending_review', rejectionReason: 'Manuel MPM non conforme' }, items());
    expect(banner).toMatchObject({ kind: 'rejected', description: 'Motif : Manuel MPM non conforme' });
  });

  it('outcome is shown even while phases are still loading', () => {
    const banner = buildBanner({ status: 'cancelled', circuitStatus: 'submitted', rejectionReason: null }, items({ M3: snap({ isLoading: true }) }));
    expect(banner).toMatchObject({ kind: 'cancelled', eyebrow: 'Demande annulée' });
  });
});

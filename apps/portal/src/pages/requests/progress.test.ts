import { describe, expect, it } from 'vitest';
import type { ApplicantAction } from '@aidn/shared';
import type { PhaseCode } from '../../lib/react-query/queryKeys';
import {
  buildBanner,
  buildProgressItems,
  currentPhase,
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

const inProgress = { id: 42, status: 'in_progress', circuitStatus: 'pending_review', rejectionReason: null };

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

describe('buildProgressItems - rejected dossier', () => {
  const rejectedItems = (over: Partial<Record<PhaseCode, PhaseSnapshot>>) =>
    buildProgressItems(
      { M3: snap(), M4: snap(), M5: snap(), M6: snap(), M7: snap(), ...over },
      { rejected: true },
    );

  it('the phase still open at rejection is interrupted, closed ones stay closed', () => {
    const result = rejectedItems({ M3: closed(), M4: closed(), M5: open({ title: 't', description: 'd', tone: 'warning' }) });
    expect(result.map((i) => i.stage)).toEqual(['closed', 'closed', 'interrupted', 'upcoming', 'upcoming']);
    expect(currentPhase(result)).toBeUndefined();
  });

  it('loading and error stay as they are (only an open phase is relabelled)', () => {
    const result = rejectedItems({ M3: snap({ isLoading: true }), M4: snap({ loadFailed: true }) });
    expect(result.map((i) => i.stage).slice(0, 2)).toEqual(['loading', 'error']);
  });

  it('without the flag an open phase is current', () => {
    expect(items({ M5: open({ title: 't', description: 'd', tone: 'info' }) })[2].stage).toBe('current');
  });
});

describe('currentPhase', () => {
  it('returns the open phase', () => {
    const result = items({ M3: closed(), M4: open({ title: 't', description: 'd', tone: 'info' }) });
    expect(currentPhase(result)?.code).toBe('M4');
  });
  it('none between two phases', () => expect(currentPhase(items({ M3: closed() }))).toBeUndefined());
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

const action = (over: Partial<ApplicantAction> = {}): ApplicantAction => ({
  id: 'payment_proof:42:1',
  key: 'payment_proof',
  requestId: 42,
  requestReference: 'DEM-42',
  phaseCode: 'M5',
  priority: 20,
  urgent: false,
  anchor: 'paiement-M5',
  dueAt: null,
  ...over,
});

describe('buildBanner - active dossier', () => {
  it('waits for every phase before speaking (no flicker)', () => {
    expect(buildBanner(inProgress, items({ M3: closed(), M4: snap({ isLoading: true }) }), [action()])).toBeNull();
  });

  it('the top action of this dossier wins: "Action requise", its phase wording and a link to its anchor', () => {
    const banner = buildBanner(
      inProgress,
      items({ M3: closed(), M4: open({ title: 'Lettre transmise', description: 'd', tone: 'info' }) }),
      [
        action({ id: 'other', requestId: 7, key: 'meeting_confirmation', anchor: 'rendez-vous-1', priority: 10 }),
        // Server order is kept even when a later action has a lower priority.
        action({ id: 'f', key: 'formal_missing_documents', phaseCode: 'M4', anchor: 'pieces', priority: 50, count: 3 }),
        action({ id: 'c', key: 'meeting_confirmation', phaseCode: 'M4', anchor: 'rendez-vous-12', priority: 10 }),
      ],
    );
    expect(banner).toEqual({
      kind: 'action',
      eyebrow: 'Action requise',
      title: 'Pièces à compléter',
      description: 'Déposez les pièces manquantes du dossier formel (3 manquante(s)).',
      action: { label: 'Déposer les pièces', href: '#pieces' },
    });
  });

  it('no action for this dossier -> the open phase passive wording', () => {
    const banner = buildBanner(
      inProgress,
      items({ M5: open({ title: 'Quittance transmise', description: '…', tone: 'info' }) }),
      [action({ requestId: 7 })],
    );
    expect(banner).toEqual({
      kind: 'waiting',
      eyebrow: 'Aucune action requise de votre part',
      title: 'Quittance transmise',
      description: '…',
    });
  });

  it('a warning tone alone never makes an action', () => {
    const banner = buildBanner(inProgress, items({ M4: open({ title: 'x', description: 'd', tone: 'warning' }) }), []);
    expect(banner?.kind).toBe('waiting');
  });

  it('actions not loaded (null, e.g. load failed) -> passive, never kind "action"', () => {
    const banner = buildBanner(inProgress, items({ M5: open({ title: 'Facture disponible', description: 'd', tone: 'info' }) }), null);
    expect(banner).toMatchObject({ kind: 'waiting', title: 'Facture disponible' });
    expect(banner?.action).toBeUndefined();
  });

  it('actions failed to load -> passive eyebrow « Situation du dossier », never "no action"', () => {
    const failed = { actionsFailed: true };
    expect(
      buildBanner(inProgress, items({ M5: open({ title: 'Facture disponible', description: 'd', tone: 'info' }) }), null, failed),
    ).toMatchObject({ kind: 'waiting', eyebrow: 'Situation du dossier', title: 'Facture disponible' });
    expect(buildBanner(inProgress, items({ M3: closed(), M4: closed() }), null, failed)).toMatchObject({
      kind: 'waiting',
      eyebrow: 'Situation du dossier',
    });
    const gated = items({ M3: snap({ enabled: false }), M4: snap({ enabled: false }), M5: snap({ enabled: false }), M6: snap({ enabled: false }), M7: snap({ enabled: false }) });
    expect(buildBanner({ id: 42, status: 'submitted', circuitStatus: 'submitted', rejectionReason: null }, gated, null, failed)).toMatchObject({
      kind: 'waiting',
      eyebrow: 'Situation du dossier',
    });
  });

  it('between two phases -> announces the next step after the last closed one', () => {
    const banner = buildBanner(inProgress, items({ M3: closed(), M4: closed() }), []);
    expect(banner).toEqual({
      kind: 'waiting',
      eyebrow: 'Aucune action requise de votre part',
      title: 'Demande formelle : étape clôturée',
      description: 'La prochaine étape de votre dossier sera ouverte par la DN.',
    });
  });

  it('an action targeting a closed phase (MEET-2) is shown between two phases', () => {
    const banner = buildBanner(inProgress, items({ M3: closed(), M4: closed() }), [
      action({ key: 'signed_meeting_report', phaseCode: 'M3', anchor: 'compte-rendu-9', priority: 80 }),
    ]);
    expect(banner).toMatchObject({
      kind: 'action',
      title: 'Action requise — Compte rendu à signer',
      action: { label: 'Accéder au compte rendu', href: '#compte-rendu-9' },
    });
  });

  it('a failing phase with nothing current -> no banner rather than a wrong one', () => {
    expect(buildBanner(inProgress, items({ M3: closed(), M4: snap({ loadFailed: true }) }), [])).toBeNull();
  });

  it.each([
    ['submitted', 'Demande déposée'],
    ['in_signature_circuit', 'Demande en cours d’annotation'],
    ['signed', 'Demande signée'],
    ['pending_review', 'Transmise à la Direction de la Navigabilité'],
  ])('intake, circuit %s -> "%s"', (circuitStatus, title) => {
    const gated = items({ M3: snap({ enabled: false }), M4: snap({ enabled: false }), M5: snap({ enabled: false }), M6: snap({ enabled: false }), M7: snap({ enabled: false }) });
    expect(buildBanner({ id: 42, status: 'submitted', circuitStatus, rejectionReason: null }, gated, [])).toMatchObject({ kind: 'waiting', title });
  });
});

describe('buildBanner - terminal dossier (outcome replaces "what now")', () => {
  it('completed -> done, titled with the delivery summary', () => {
    const banner = buildBanner({ id: 42, status: 'completed', circuitStatus: 'pending_review', rejectionReason: null }, items({ M7: closed('Certificat retiré le 05/10/2026') }), []);
    expect(banner).toMatchObject({ kind: 'done', eyebrow: 'Dossier terminé', title: 'Certificat retiré le 05/10/2026' });
  });

  it('rejected -> shows the reason', () => {
    const banner = buildBanner({ id: 42, status: 'rejected', circuitStatus: 'pending_review', rejectionReason: 'Manuel MPM non conforme' }, items(), [action()]);
    expect(banner).toMatchObject({ kind: 'rejected', description: 'Motif : Manuel MPM non conforme' });
  });

  it('outcome is shown even while phases are still loading', () => {
    const banner = buildBanner({ id: 42, status: 'cancelled', circuitStatus: 'submitted', rejectionReason: null }, items({ M3: snap({ isLoading: true }) }), null);
    expect(banner).toMatchObject({ kind: 'cancelled', eyebrow: 'Demande annulée' });
  });
});

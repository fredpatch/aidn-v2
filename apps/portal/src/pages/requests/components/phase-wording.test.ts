/** SESSION1-UX-1 - the phase builders are passive (state only, §6.6) and use
 *  the approved wording (§8). Applicant actions come from GET /applicant/actions. */
import { describe, expect, it } from 'vitest';
import type { MeetingConfirmationBlock, MeetingReportBlock } from '../../../lib/api/meetings.api';
import type {
  CertificatesBundle,
  DeepEvaluationBundle,
  FormalBundle,
  PaymentInfo,
  PreliminaryBundle,
  SiteInspectionBundle,
} from '../../../lib/api/requests.types';
import { buildPreliminaryPresentation } from './PreliminaryPhaseSection';
import { buildFormalPresentation } from './FormalPhaseSection';
import { buildDeepEvaluationPresentation } from './DeepEvaluationSection';
import { buildSiteInspectionPresentation } from './SiteInspectionSection';
import { buildCertificatesPresentation } from './CertificatesSection';

const DAY = '2026-10-10T08:00:00.000Z';

type Confirmation = MeetingConfirmationBlock['confirmationStatus'];
function meeting(over: { status?: string; confirmation?: Confirmation; report?: Partial<MeetingReportBlock> } = {}) {
  return {
    id: 9,
    scheduledAt: DAY,
    location: null,
    status: over.status ?? 'scheduled',
    confirmationStatus: over.confirmation ?? 'confirmed',
    confirmedAt: null,
    alternate: null,
    lastRefusal: null,
    actions: [] as Array<'confirm' | 'propose_alternate'>,
    ticketAvailable: false,
    crDocumentUrl: null,
    crUploadedAt: null,
    signedCrDocumentUrl: null,
    signedCrUploadedAt: null,
    canSubmitSignedReport: false,
    ...over.report,
  };
}

function m3(
  over: {
    phase?: string;
    meeting?: ReturnType<typeof meeting> | null;
    declaration?: 'none' | 'available' | 'done';
  } = {},
): PreliminaryBundle {
  const declaration = over.declaration ?? 'none';
  return {
    phase: { id: 3, status: over.phase ?? 'open' },
    meeting: over.meeting === undefined ? meeting({ status: 'held' }) : over.meeting,
    evaluation:
      declaration === 'none'
        ? null
        : {
            templateFileUrl: 'u/t',
            madeAvailableAt: DAY,
            returnDeadline: DAY,
            submittedFileUrl: declaration === 'done' ? 'u/d' : null,
            submittedAt: declaration === 'done' ? DAY : null,
          },
  };
}

function m4(
  over: {
    phase?: string;
    letter?: string | null;
    completionRate?: number;
    meeting?: ReturnType<typeof meeting> | null;
  } = {},
): FormalBundle {
  return {
    phase: { id: 4, status: over.phase ?? 'open' },
    letterCircuit: over.letter === null ? null : { id: 1, status: over.letter ?? 'pending_review', fileUrl: 'u/l' },
    documents: [],
    meeting: over.meeting === undefined ? null : over.meeting,
    completionRate: over.completionRate ?? 11,
  };
}

function payment(over: Partial<PaymentInfo> = {}): PaymentInfo {
  return { id: 1, status: 'awaiting_proof', invoiceFileUrl: 'u/i', proofFileUrl: null, rejectionReason: null, ...over };
}

function m5(
  over: { phase?: string; payment?: PaymentInfo | null; verdict?: 'validated' | 'needs_correction' | 'rejected' | null } = {},
): DeepEvaluationBundle {
  const verdict = over.verdict === undefined ? null : over.verdict;
  return {
    phase: { id: 5, status: over.phase ?? 'open' },
    payment: over.payment === undefined ? payment({ status: 'validated', proofFileUrl: 'u/p' }) : over.payment,
    evaluations: [{ id: 1, slot: 'a', label: 'Doc A', currentFileUrl: 'u/a', verdict, correctionDeadline: null }],
    completionRate: { total: 1, validated: verdict === 'validated' ? 1 : 0 },
  };
}

function m6(over: { phase?: string; payment?: PaymentInfo | null; visit?: string | null } = {}): SiteInspectionBundle {
  return {
    phase: { id: 6, status: over.phase ?? 'open' },
    payment: over.payment === undefined ? payment({ status: 'validated', proofFileUrl: 'u/p' }) : over.payment,
    siteVisit: over.visit ? { id: 2, scheduledAt: DAY, location: null, status: over.visit } : null,
  };
}

function m7(over: { phase?: string; payment?: PaymentInfo | null; certificate?: string | null } = {}): CertificatesBundle {
  return {
    phase: { id: 7, status: over.phase ?? 'open' },
    payment: over.payment === undefined ? payment({ status: 'validated', proofFileUrl: 'u/p' }) : over.payment,
    certificate: over.certificate ? { status: over.certificate, notifiedAt: DAY, collectedAt: null } : null,
  };
}

const awaitingProof = [payment(), payment({ rejectionReason: 'illisible' })];
const pendingValidation = payment({ status: 'pending_validation', proofFileUrl: 'u/p' });

/** States an ApplicantAction covers: the builders only describe them. */
const passiveCases = [
  buildPreliminaryPresentation(m3({ declaration: 'available' })),
  buildPreliminaryPresentation(m3({ meeting: meeting({ confirmation: 'awaiting_applicant' }) })),
  buildPreliminaryPresentation(
    m3({ declaration: 'done', meeting: meeting({ status: 'held', report: { crDocumentUrl: 'u/cr', canSubmitSignedReport: true } }) }),
  ),
  buildPreliminaryPresentation(
    m3({ phase: 'closed', meeting: meeting({ status: 'held', report: { crDocumentUrl: 'u/cr', canSubmitSignedReport: true } }) }),
  ),
  buildFormalPresentation(m4({ letter: null })),
  buildFormalPresentation(m4({ completionRate: 7 })),
  buildFormalPresentation(m4({ letter: 'submitted', completionRate: 3 })),
  buildFormalPresentation(m4({ meeting: meeting({ confirmation: 'awaiting_applicant' }) })),
  buildFormalPresentation(m4({ meeting: meeting({ status: 'held', report: { crDocumentUrl: 'u/cr', canSubmitSignedReport: true } }) })),
  ...awaitingProof.map((p) => buildDeepEvaluationPresentation(m5({ payment: p }))),
  ...awaitingProof.map((p) => buildSiteInspectionPresentation(m6({ payment: p }))),
  ...awaitingProof.map((p) => buildCertificatesPresentation(m7({ payment: p }))),
  buildDeepEvaluationPresentation(m5({ verdict: 'needs_correction' })),
  buildDeepEvaluationPresentation(m5({ verdict: 'rejected' })),
  buildCertificatesPresentation(m7({ certificate: 'notified' })),
];

interface Texts {
  title: string;
  description: string;
  steps?: Array<{ detail: string }>;
}
const texts = (p: Texts) => [p.title, p.description, ...(p.steps ?? []).map((s) => s.detail)];

/** Every title / description / step detail over a state matrix of the five builders. */
function collectAllBuilderTexts(): string[] {
  const out: Texts[] = [];
  const meetings = [
    null,
    meeting({ confirmation: 'awaiting_applicant' }),
    meeting({ confirmation: 'awaiting_dn' }),
    meeting({ confirmation: 'confirmed' }),
    meeting({ status: 'held' }),
    meeting({ status: 'held', report: { crDocumentUrl: 'u/cr', canSubmitSignedReport: true } }),
  ];
  for (const phase of ['open', 'closed']) {
    for (const mt of meetings) {
      for (const declaration of ['none', 'available', 'done'] as const) {
        out.push(buildPreliminaryPresentation(m3({ phase, meeting: mt, declaration })));
      }
      for (const letter of [null, 'submitted', 'in_signature_circuit', 'signed', 'pending_review']) {
        for (const completionRate of [0, 7, 11]) out.push(buildFormalPresentation(m4({ phase, letter, completionRate, meeting: mt })));
      }
    }
    const payments: Array<PaymentInfo | null> = [
      null,
      payment({ status: 'awaiting_invoice', invoiceFileUrl: null }),
      ...awaitingProof,
      pendingValidation,
      payment({ status: 'pending_validation', proofFileUrl: 'u/p', rejectionReason: 'illisible' }),
      payment({ status: 'validated', proofFileUrl: 'u/p' }),
      payment({ status: 'validated', proofFileUrl: 'u/p', rejectionReason: 'illisible' }),
      payment({ status: 'rejected', proofFileUrl: 'u/p', rejectionReason: 'illisible' }),
    ];
    for (const p of payments) {
      for (const verdict of [null, 'validated', 'needs_correction', 'rejected'] as const) {
        out.push(buildDeepEvaluationPresentation(m5({ phase, payment: p, verdict })));
      }
      for (const visit of [null, 'scheduled', 'held']) out.push(buildSiteInspectionPresentation(m6({ phase, payment: p, visit })));
      for (const certificate of [null, 'in_preparation', 'notified', 'collected']) {
        out.push(buildCertificatesPresentation(m7({ phase, payment: p, certificate })));
      }
    }
  }
  return out.flatMap(texts);
}

describe('passive phase builders (SESSION1-UX-1)', () => {
  it('M3 declaration submitted: neutral wording (no "en cours de traitement")', () => {
    const p = buildPreliminaryPresentation(m3({ declaration: 'done' }));
    expect(p.title).toBe('Déclaration transmise');
    expect(p.description).toBe(
      "Votre déclaration a bien été transmise. Vous serez informé dès qu'une nouvelle étape ou une action de votre part sera nécessaire.",
    );
    expect(p.tone).toBe('success');
    expect(p.steps.find((s) => s.key === 'closure')?.detail).toBe('Prochaine étape à venir');
  });

  it('M3 passive states', () => {
    expect(buildPreliminaryPresentation(m3({ declaration: 'available' }))).toMatchObject({
      title: 'Déclaration disponible',
      description: 'Le formulaire de pré-évaluation est disponible dans cette phase.',
      tone: 'info',
    });
    expect(buildPreliminaryPresentation(m3({ meeting: meeting({ confirmation: 'awaiting_applicant' }) }))).toMatchObject({
      title: 'Rendez-vous proposé',
      description: 'La DN vous a proposé un rendez-vous pour la réunion préliminaire.',
    });
    expect(buildPreliminaryPresentation(m3())).toMatchObject({
      title: 'Déclaration en préparation',
      description: 'Le formulaire de pré-évaluation vous sera transmis ici.',
    });
  });

  it('M4 passive states', () => {
    expect(buildFormalPresentation(m4({ letter: null }))).toMatchObject({
      title: 'Lettre officielle',
      description: "La lettre officielle de demande d'agrément OMA n'a pas encore été déposée.",
      tone: 'info',
    });
    expect(buildFormalPresentation(m4({ letter: 'submitted', completionRate: 3 }))).toMatchObject({
      title: 'Lettre transmise',
      description:
        "Votre lettre a bien été transmise et suivra le circuit de signature de l'ANAC. La réunion formelle sera planifiée après le retour signé.",
    });
    expect(buildFormalPresentation(m4({ completionRate: 7 }))).toMatchObject({
      title: 'Pièces du dossier formel',
      description: '7/11 pièces déposées.',
    });
    expect(buildFormalPresentation(m4({ meeting: meeting({ confirmation: 'awaiting_applicant' }) }))).toMatchObject({
      title: 'Rendez-vous proposé',
      description: 'La DN vous a proposé un rendez-vous pour la réunion formelle.',
    });
    expect(buildFormalPresentation(m4())).toMatchObject({
      title: 'Pièces déposées',
      description: 'Votre dossier formel est complet. La DN vous proposera une date de réunion formelle.',
    });
  });

  it('M5 / M6 / M7 payment and M5 evaluation states', () => {
    for (const build of [
      (p: PaymentInfo) => buildDeepEvaluationPresentation(m5({ payment: p })),
      (p: PaymentInfo) => buildSiteInspectionPresentation(m6({ payment: p })),
      (p: PaymentInfo) => buildCertificatesPresentation(m7({ payment: p })),
    ]) {
      for (const p of awaitingProof) {
        expect(build(p)).toMatchObject({ title: 'Facture disponible', description: 'La facture de cette phase est disponible.' });
      }
      expect(build(pendingValidation)).toMatchObject({
        title: 'Quittance transmise',
        description: 'Votre quittance a bien été transmise. Elle sera validée par le service Finance.',
      });
    }
    expect(buildDeepEvaluationPresentation(m5())).toMatchObject({
      title: 'Évaluation approfondie ouverte',
      description: "Les pièces de votre dossier sont soumises à l'évaluation de la DN.",
    });
    expect(buildDeepEvaluationPresentation(m5({ verdict: 'needs_correction' }))).toMatchObject({
      title: 'Corrections demandées',
      description: '1 document(s) font l\'objet d\'une demande de correction.',
    });
    expect(buildCertificatesPresentation(m7({ certificate: 'notified' }))).toMatchObject({ title: 'Certificat prêt', tone: 'info' });
  });

  it('builders are passive: no tone warning and no action for states an ApplicantAction covers', () => {
    for (const p of passiveCases) {
      expect(p.tone).not.toBe('warning');
      expect('action' in p).toBe(false);
    }
  });

  it('D11: payment validated with an old rejectionReason never reads "Nouvelle quittance requise"', () => {
    for (const build of [buildDeepEvaluationPresentation, buildSiteInspectionPresentation, buildCertificatesPresentation] as Array<
      (b: never) => { title: string }
    >) {
      const bundle = { phase: { id: 1, status: 'open' }, payment: payment({ status: 'validated', rejectionReason: 'illisible', proofFileUrl: 'u/p' }), evaluations: [], completionRate: { total: 0, validated: 0 }, siteVisit: null, certificate: null };
      const p = build(bundle as never);
      expect(p.title).not.toBe('Nouvelle quittance requise');
      expect(p.title).not.toBe('Facture disponible');
    }
  });

  it('§8 wording: no forbidden phrase in any builder output', () => {
    const all = collectAllBuilderTexts();
    expect(all.length).toBeGreaterThan(100);
    for (const text of all) {
      expect(text).not.toMatch(/en cours de traitement par|en cours d['’]analyse|l['’]ANAC analyse|Traitement ANAC en cours|en cours de vérification/);
      expect(text).not.toMatch(/^Action requise/);
    }
  });
});

/** SESSION1-UX-1 §7.4 - Demandes cockpit next action: state, typed owner and
 *  the D9 open-phase resolution (pure, no DB). */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ApplicantAction, ApplicantActionKey, ApplicantActionPhase } from '@aidn/shared';
import { OWNERS, resolveCockpitNextAction, type CockpitFacts } from './cockpit-next-action.js';
import type { RequestCockpitPhase } from './requests.types.js';

const ID = 42;
const CODES = ['M3', 'M4', 'M5', 'M6', 'M7'] as const;
const LABELS: Record<string, string> = {
  M3: 'Préliminaire',
  M4: 'Demande formelle',
  M5: 'Évaluation approfondie',
  M6: 'Démonstration / Inspection',
  M7: 'Délivrance',
};

function phases(statuses: Partial<Record<(typeof CODES)[number], 'open' | 'closed'>>): RequestCockpitPhase[] {
  return CODES.map((phaseCode) => ({
    phaseCode,
    label: LABELS[phaseCode],
    status: statuses[phaseCode] ?? 'not_started',
    href: `/demandes/${ID}/${phaseCode}`,
  }));
}

function act(
  key: ApplicantActionKey,
  phaseCode: ApplicantActionPhase,
  extra: Partial<ApplicantAction> = {}
): ApplicantAction {
  return {
    id: `${key}:${ID}:1`,
    key,
    requestId: ID,
    requestReference: 'DEM-1',
    phaseCode,
    priority: 0,
    urgent: false,
    anchor: 'x',
    dueAt: null,
    ...extra,
  };
}

function facts(over: Partial<CockpitFacts> = {}): CockpitFacts {
  return {
    requestId: ID,
    status: 'in_progress',
    circuitStatus: 'pending_review',
    dnCircuitStatus: 'pending_review',
    preliminaryOpenable: false,
    phases: phases({}),
    applicantActions: [],
    meetingAwaitingDn: false,
    m5DocumentsAwaitingVerdict: 0,
    openPhasePayment: null,
    m6VisitHeldWithoutVerdict: false,
    openPhaseCircuitStatus: null,
    ...over,
  };
}

const DN = { kind: 'staff', label: 'DN', roles: ['dn_agent', 'dn_supervisor', 'SU'] };
const ASSISTANT_DN = { kind: 'staff', label: 'Assistante DN', roles: ['assistant_dn', 'SU'] };
const FINANCE = { kind: 'staff', label: 'Finance', roles: ['s5_agent', 'SU'] };
const APPLICANT = { kind: 'applicant', label: 'Postulant' };

describe('resolveCockpitNextAction - pre-phase branches (§7.4)', () => {
  it('intake submitted → Impression et mise en circuit DG, action_required, owner Réception with route roles', () => {
    const r = resolveCockpitNextAction(facts({ status: 'submitted', circuitStatus: 'submitted', phases: [] }));
    assert.equal(r.nextActionLabel, 'Impression et mise en circuit DG');
    assert.equal(r.nextActionDescription, 'Le dossier attend impression et mise en circuit DG.');
    assert.equal(r.nextActionState, 'action_required');
    assert.deepEqual(r.nextActionOwner, { kind: 'staff', label: 'Réception', roles: ['assistant_dg', 'reception', 'SU'] });
    assert.equal(r.nextActionHref, null);
    assert.equal(r.nextActionTone, 'warning');
    assert.equal(r.canStartPreliminary, false);
  });

  it('intake in_signature_circuit → Annotation du DG attendue, waiting, Assistant DG', () => {
    const r = resolveCockpitNextAction(facts({ status: 'submitted', circuitStatus: 'in_signature_circuit', dnCircuitStatus: null }));
    assert.equal(r.nextActionLabel, 'Annotation du DG attendue');
    assert.equal(r.nextActionDescription, 'Le dossier est dans le circuit de signature du DG. La DN le suit en lecture seule.');
    assert.equal(r.nextActionState, 'waiting');
    assert.deepEqual(r.nextActionOwner, { kind: 'staff', label: 'Assistant DG', roles: ['assistant_dg', 'reception', 'SU'] });
    assert.equal(r.nextActionHref, null);
  });

  it('DG annotation in, DN circuit not sent → À transmettre au Directeur DN, action_required, Assistante DN', () => {
    const r = resolveCockpitNextAction(facts({ status: 'submitted', dnCircuitStatus: 'submitted' }));
    assert.equal(r.nextActionLabel, 'À transmettre au Directeur DN');
    assert.equal(r.nextActionDescription, 'Annotation du DG reçue. L’Assistante DN doit transmettre le dossier au Directeur DN.');
    assert.equal(r.nextActionState, 'action_required');
    assert.deepEqual(r.nextActionOwner, ASSISTANT_DN);
    assert.equal(r.nextActionTone, 'warning');
  });

  it('DN circuit in_signature_circuit → En attente du retour du Directeur DN, waiting, Assistante DN', () => {
    const r = resolveCockpitNextAction(facts({ status: 'submitted', dnCircuitStatus: 'in_signature_circuit' }));
    assert.equal(r.nextActionLabel, 'En attente du retour du Directeur DN');
    assert.equal(
      r.nextActionDescription,
      'Le dossier est chez le Directeur DN (circuit papier). L’Assistante DN enregistrera le retour annoté.'
    );
    assert.match(r.nextActionDescription, /Directeur DN \(circuit papier\)/);
    assert.equal(r.nextActionState, 'waiting');
    assert.deepEqual(r.nextActionOwner, ASSISTANT_DN);
  });

  it('preliminary openable → Ouvrir la phase préliminaire, canStartPreliminary, owner DN, href M3', () => {
    const r = resolveCockpitNextAction(facts({ status: 'pending_review', preliminaryOpenable: true }));
    assert.equal(r.nextActionLabel, 'Ouvrir la phase préliminaire');
    assert.equal(r.nextActionDescription, 'L’annotation du Directeur DN est reçue. La DN peut démarrer le traitement.');
    assert.equal(r.canStartPreliminary, true);
    assert.equal(r.nextActionState, 'action_required');
    assert.equal(r.nextActionTone, 'info');
    assert.deepEqual(r.nextActionOwner, DN);
    assert.equal(r.nextActionHref, `/demandes/${ID}/phase-preliminaire`);
  });

  it('completed → done, owner null (labels unchanged)', () => {
    const r = resolveCockpitNextAction(facts({ status: 'completed', phases: phases({ M3: 'closed', M7: 'closed' }) }));
    assert.equal(r.nextActionLabel, 'Workflow terminé');
    assert.equal(r.nextActionDescription, 'Dossier clos : consultation et téléchargement uniquement.');
    assert.equal(r.nextActionHref, `/demandes/${ID}/delivrance`);
    assert.equal(r.nextActionTone, 'success');
    assert.equal(r.nextActionState, 'done');
    assert.equal(r.nextActionOwner, null);
  });

  it('rejected → done, owner null, last started phase href; cancelled before any phase → no href', () => {
    const rejected = resolveCockpitNextAction(facts({ status: 'rejected', phases: phases({ M3: 'closed', M4: 'open' }) }));
    assert.equal(rejected.nextActionLabel, 'Dossier rejeté');
    assert.equal(rejected.nextActionDescription, 'Dossier clos : consultation et téléchargement uniquement.');
    assert.equal(rejected.nextActionHref, `/demandes/${ID}/M4`);
    assert.equal(rejected.nextActionTone, 'danger');
    assert.equal(rejected.nextActionState, 'done');
    assert.equal(rejected.nextActionOwner, null);

    const cancelled = resolveCockpitNextAction(facts({ status: 'cancelled', circuitStatus: 'submitted' }));
    assert.equal(cancelled.nextActionLabel, 'Dossier annulé');
    assert.equal(cancelled.nextActionDescription, 'Dossier clos avant la phase préliminaire : aucune page de phase à consulter.');
    assert.equal(cancelled.nextActionHref, null);
    assert.equal(cancelled.nextActionState, 'done');
    assert.equal(cancelled.nextActionOwner, null);
  });
});

describe('resolveCockpitNextAction - open phase (D9)', () => {
  it('step 0: M5 documents awaiting a verdict win over an applicant correction - never « En attente du postulant »', () => {
    const r = resolveCockpitNextAction(
      facts({
        phases: phases({ M3: 'closed', M4: 'closed', M5: 'open' }),
        m5DocumentsAwaitingVerdict: 2,
        applicantActions: [act('document_correction', 'M5', { count: 1 })],
      })
    );
    assert.equal(r.nextActionLabel, 'Évaluer 2 document(s)');
    assert.equal(r.nextActionState, 'action_required');
    assert.equal(r.nextActionTone, 'info');
    assert.deepEqual(r.nextActionOwner, DN);
    assert.equal(r.nextActionHref, `/demandes/${ID}/M5`);
  });

  it('step 0: a counter-proposal awaiting the DN → Contre-proposition à traiter, DN', () => {
    const r = resolveCockpitNextAction(
      facts({
        phases: phases({ M3: 'open' }),
        meetingAwaitingDn: true,
        applicantActions: [act('preliminary_declaration', 'M3')],
      })
    );
    assert.equal(r.nextActionLabel, 'Contre-proposition à traiter');
    assert.equal(r.nextActionState, 'action_required');
    assert.deepEqual(r.nextActionOwner, DN);
  });

  it('step 0 for M5 documents applies to M5 only', () => {
    const r = resolveCockpitNextAction(facts({ phases: phases({ M3: 'closed', M4: 'open' }), m5DocumentsAwaitingVerdict: 3 }));
    assert.equal(r.nextActionLabel, 'Traiter Demande formelle');
  });

  it('step 1: payment proof expected on the open phase → En attente du postulant, applicant owner', () => {
    const r = resolveCockpitNextAction(
      facts({
        phases: phases({ M3: 'closed', M4: 'closed', M5: 'open' }),
        applicantActions: [act('payment_proof', 'M5')],
        openPhasePayment: { status: 'awaiting_proof', invoiceFileUrl: '/api/files/1' },
      })
    );
    assert.equal(r.nextActionLabel, 'En attente du postulant');
    assert.equal(r.nextActionDescription, 'Quittance de paiement attendue du postulant (M5).');
    assert.equal(r.nextActionState, 'waiting');
    assert.equal(r.nextActionTone, 'warning');
    assert.deepEqual(r.nextActionOwner, APPLICANT);
    assert.equal(r.nextActionHref, `/demandes/${ID}/M5`);
  });

  it('step 1: payment proof after a rejection → Nouvelle quittance attendue', () => {
    const r = resolveCockpitNextAction(
      facts({
        phases: phases({ M3: 'closed', M4: 'closed', M5: 'open' }),
        applicantActions: [act('payment_proof', 'M5', { variant: 'after_rejection' })],
      })
    );
    assert.equal(r.nextActionDescription, 'Nouvelle quittance attendue du postulant (M5).');
  });

  it('step 1: missing M4 pieces → {n} pièce(s) attendue(s) du postulant', () => {
    const r = resolveCockpitNextAction(
      facts({
        phases: phases({ M3: 'closed', M4: 'open' }),
        applicantActions: [act('formal_missing_documents', 'M4', { count: 3 })],
      })
    );
    assert.equal(r.nextActionLabel, 'En attente du postulant');
    assert.equal(r.nextActionDescription, '3 pièce(s) attendue(s) du postulant.');
  });

  it('step 1: the first action of the open phase is used, other phases are ignored', () => {
    const r = resolveCockpitNextAction(
      facts({
        phases: phases({ M3: 'closed', M4: 'open' }),
        applicantActions: [act('meeting_confirmation', 'M3'), act('formal_letter', 'M4'), act('formal_missing_documents', 'M4', { count: 1 })],
      })
    );
    assert.equal(r.nextActionDescription, 'Lettre officielle attendue du postulant.');
  });

  it('signed_meeting_report alone on a closed M3 is never a waiting reason (falls to the DN branch)', () => {
    const r = resolveCockpitNextAction(
      facts({
        phases: phases({ M3: 'closed', M4: 'open' }),
        applicantActions: [act('signed_meeting_report', 'M3')],
      })
    );
    assert.equal(r.nextActionLabel, 'Traiter Demande formelle');
    assert.deepEqual(r.nextActionOwner, DN);
  });

  it('signed_meeting_report on the open phase is not a waiting reason either', () => {
    const r = resolveCockpitNextAction(
      facts({ phases: phases({ M3: 'open' }), applicantActions: [act('signed_meeting_report', 'M3')] })
    );
    assert.equal(r.nextActionLabel, 'Traiter Préliminaire');
  });

  it('step 2: payment pending_validation → Quittance à valider, Finance', () => {
    const r = resolveCockpitNextAction(
      facts({
        phases: phases({ M3: 'closed', M4: 'closed', M5: 'open' }),
        openPhasePayment: { status: 'pending_validation', invoiceFileUrl: '/api/files/1' },
      })
    );
    assert.equal(r.nextActionLabel, 'Quittance à valider');
    assert.equal(r.nextActionDescription, 'La quittance du postulant doit être validée par le service Finance.');
    assert.equal(r.nextActionState, 'action_required');
    assert.equal(r.nextActionTone, 'warning');
    assert.deepEqual(r.nextActionOwner, FINANCE);
  });

  it('step 2: payment without invoice → Facture à émettre, Finance', () => {
    const r = resolveCockpitNextAction(
      facts({
        phases: phases({ M3: 'closed', M4: 'closed', M5: 'closed', M6: 'open' }),
        openPhasePayment: { status: 'awaiting_invoice', invoiceFileUrl: null },
      })
    );
    assert.equal(r.nextActionLabel, 'Facture à émettre');
    assert.equal(r.nextActionDescription, 'La facture de la phase doit être émise par le service Finance.');
    assert.deepEqual(r.nextActionOwner, FINANCE);
  });

  it('a validated payment is not Finance work', () => {
    const r = resolveCockpitNextAction(
      facts({
        phases: phases({ M3: 'closed', M4: 'closed', M5: 'open' }),
        openPhasePayment: { status: 'validated', invoiceFileUrl: '/api/files/1' },
      })
    );
    assert.equal(r.nextActionLabel, 'Traiter Évaluation approfondie');
  });

  it('step 3: M6 visit held without verdict → Avis d’inspection attendu, Cellule Inspection', () => {
    const r = resolveCockpitNextAction(
      facts({ phases: phases({ M3: 'closed', M4: 'closed', M5: 'closed', M6: 'open' }), m6VisitHeldWithoutVerdict: true })
    );
    assert.equal(r.nextActionLabel, 'Avis d’inspection attendu');
    assert.equal(r.nextActionDescription, 'La visite est tenue. La Cellule Inspection doit rendre son avis.');
    assert.equal(r.nextActionState, 'action_required');
    assert.deepEqual(r.nextActionOwner, { kind: 'staff', label: 'Cellule Inspection', roles: ['r3_agent', 'SU'] });
  });

  it('step 4: M4 letter circuit submitted → Réception print; in_signature_circuit / signed → Assistant DG waiting', () => {
    const open = phases({ M3: 'closed', M4: 'open' });
    const print = resolveCockpitNextAction(facts({ phases: open, openPhaseCircuitStatus: 'submitted' }));
    assert.equal(print.nextActionLabel, 'Impression et mise en circuit DG');
    assert.equal(print.nextActionDescription, 'Le document de la phase attend impression et mise en circuit DG.');
    assert.equal(print.nextActionState, 'action_required');
    assert.equal(print.nextActionTone, 'warning');
    assert.deepEqual(print.nextActionOwner, OWNERS.reception);
    assert.equal(print.nextActionHref, `/demandes/${ID}/M4`);

    for (const status of ['in_signature_circuit', 'signed']) {
      const dg = resolveCockpitNextAction(facts({ phases: open, openPhaseCircuitStatus: status }));
      assert.equal(dg.nextActionLabel, 'Circuit DG en cours');
      assert.equal(dg.nextActionDescription, 'Le document de la phase est dans le circuit de signature du DG.');
      assert.equal(dg.nextActionState, 'waiting');
      assert.deepEqual(dg.nextActionOwner, { kind: 'staff', label: 'Assistant DG', roles: ['assistant_dg', 'reception', 'SU'] });
    }
    // pending_review: back at the DN.
    const back = resolveCockpitNextAction(facts({ phases: open, openPhaseCircuitStatus: 'pending_review' }));
    assert.equal(back.nextActionLabel, 'Traiter Demande formelle');
  });

  it('step 5: open phase, nothing else → Traiter <label>, DN', () => {
    const r = resolveCockpitNextAction(facts({ phases: phases({ M3: 'open' }) }));
    assert.equal(r.nextActionLabel, 'Traiter Préliminaire');
    assert.equal(r.nextActionDescription, 'La DN poursuit le traitement de la phase ouverte.');
    assert.equal(r.nextActionState, 'action_required');
    assert.equal(r.nextActionTone, 'info');
    assert.deepEqual(r.nextActionOwner, DN);
    assert.equal(r.nextActionHref, `/demandes/${ID}/M3`);
    assert.equal(r.canStartPreliminary, false);
  });
});

describe('resolveCockpitNextAction - after the phases', () => {
  it('last closed, none open → Ouvrir la phase suivante, DN', () => {
    const r = resolveCockpitNextAction(facts({ phases: phases({ M3: 'closed', M4: 'closed' }) }));
    assert.equal(r.nextActionLabel, 'Ouvrir la phase suivante');
    assert.equal(r.nextActionDescription, 'La dernière phase est clôturée. La DN peut poursuivre le circuit.');
    assert.equal(r.nextActionHref, `/demandes/${ID}/M4`);
    assert.equal(r.nextActionState, 'action_required');
    assert.equal(r.nextActionTone, 'info');
    assert.deepEqual(r.nextActionOwner, DN);
  });

  it('nothing at all → À vérifier, information, DN', () => {
    const r = resolveCockpitNextAction(facts({ status: 'in_progress', circuitStatus: null, dnCircuitStatus: null }));
    assert.equal(r.nextActionLabel, 'À vérifier');
    assert.equal(r.nextActionDescription, 'Le dossier ne correspond pas encore à une action DN standard.');
    assert.equal(r.nextActionHref, null);
    assert.equal(r.nextActionTone, 'warning');
    assert.equal(r.nextActionState, 'information');
    assert.deepEqual(r.nextActionOwner, DN);
  });
});

/** DASH-ACTIVITY-LABELS-1 - one catalog says how a dossier event reads, for
 *  the Demandes reading pane and the dashboard alike: exact French titles,
 *  their tones, business phase names, and never a raw audit code. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCataloguedRequestActivity,
  resolveRequestActivityPresentation,
} from './request-activity-labels.js';

describe('resolveRequestActivityPresentation', () => {
  const known: Array<[string, string, string]> = [
    ['PAYMENT_VALIDATED', 'Paiement validé', 'success'],
    ['PAYMENT_REJECTED', 'Paiement rejeté', 'danger'],
    ['DOCUMENT_VERDICT_SET', 'Document évalué', 'info'],
    ['DN_ANNOTATION_RETURNED', 'Annotation du Directeur DN reçue', 'success'],
    ['CERTIFICATE_STATUS_CHANGED', 'Statut du certificat modifié', 'info'],
    ['MEETING_HELD', 'Réunion tenue', 'success'],
    ['MEETING_SCHEDULED', 'Réunion planifiée', 'info'],
    ['REQUEST_SUBMITTED', 'Demande déposée', 'info'],
    ['REQUEST_CANCELLED', 'Demande annulée', 'danger'],
    ['COURRIER_SENT_TO_SIGNATURE', 'Courrier mis en signature', 'warning'],
  ];
  for (const [action, title, tone] of known) {
    it(`${action} -> « ${title} » (${tone})`, () => {
      assert.deepEqual(resolveRequestActivityPresentation(action), { title, tone });
    });
  }

  const phases: Array<[string, string, string]> = [
    ['PHASE_OPENED', 'M3', 'Phase ouverte - Préliminaire'],
    ['PHASE_OPENED', 'M4', 'Phase ouverte - Demande formelle'],
    ['PHASE_CLOSED', 'M4', 'Phase clôturée - Demande formelle'],
    ['PHASE_CLOSED', 'M5', 'Phase clôturée - Évaluation approfondie'],
    ['PHASE_CLOSED', 'M6', 'Phase clôturée - Démonstration / Inspection'],
    ['PHASE_CLOSED', 'M7', 'Phase clôturée - Délivrance'],
  ];
  for (const [action, module, title] of phases) {
    it(`${action} + ${module} -> « ${title} », no phase code`, () => {
      const presentation = resolveRequestActivityPresentation(action, module);
      assert.equal(presentation.title, title);
      assert.doesNotMatch(presentation.title, /M[3-7]/);
    });
  }

  it('phase event with an unknown or missing module: the bare title, never the module', () => {
    assert.deepEqual(resolveRequestActivityPresentation('PHASE_OPENED', 'UNKNOWN_PHASE'), { title: 'Phase ouverte', tone: 'info' });
    assert.deepEqual(resolveRequestActivityPresentation('PHASE_CLOSED', null), { title: 'Phase clôturée', tone: 'success' });
    assert.equal(resolveRequestActivityPresentation('PHASE_OPENED', 'toString').title, 'Phase ouverte');
  });

  it('an uncatalogued meeting status reads « Réunion mise à jour »', () => {
    assert.deepEqual(resolveRequestActivityPresentation('MEETING_SOME_NEW_STATUS'), { title: 'Réunion mise à jour', tone: 'info' });
  });

  it('an unknown action reads « Activité du dossier mise à jour », never its audit code', () => {
    for (const action of ['SOME_NEW_DOSSIER_EVENT', 'USER_CREATED', 'toString']) {
      const presentation = resolveRequestActivityPresentation(action);
      assert.deepEqual(presentation, { title: 'Activité du dossier mise à jour', tone: 'info' });
      assert.doesNotMatch(presentation.title, /some new|SOME_NEW|user created|_/i);
    }
  });
});

describe('isCataloguedRequestActivity', () => {
  it('names catalogued actions and meeting statuses only', () => {
    assert.equal(isCataloguedRequestActivity('PAYMENT_VALIDATED'), true);
    assert.equal(isCataloguedRequestActivity('MEETING_SOME_NEW_STATUS'), true);
    assert.equal(isCataloguedRequestActivity('USER_CREATED'), false);
    assert.equal(isCataloguedRequestActivity('SOME_NEW_DOSSIER_EVENT'), false);
    assert.equal(isCataloguedRequestActivity('constructor'), false);
  });
});

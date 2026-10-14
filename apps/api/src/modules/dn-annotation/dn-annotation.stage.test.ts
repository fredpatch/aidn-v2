import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { INTAKE_STAGE_LABELS, intakeStage, isPreliminaryOpenable } from './dn-annotation.stage.js';

describe('intake stage (two physical circuits before M3)', () => {
  it('follows the DG circuit, then the Directeur DN circuit', () => {
    assert.equal(intakeStage(null, null), 'none');
    assert.equal(intakeStage('submitted', null), 'dg_to_circuit');
    assert.equal(intakeStage('in_signature_circuit', null), 'dg_in_circuit');
    assert.equal(intakeStage('pending_review', null), 'dn_to_send');
    assert.equal(intakeStage('pending_review', 'submitted'), 'dn_to_send');
    assert.equal(intakeStage('pending_review', 'in_signature_circuit'), 'dn_in_circuit');
    assert.equal(intakeStage('pending_review', 'pending_review'), 'dn_returned');
  });

  it('shows business wording, never a technical status', () => {
    for (const label of Object.values(INTAKE_STAGE_LABELS)) {
      assert.doesNotMatch(label, /_|pending|signature_circuit/);
    }
    assert.equal(INTAKE_STAGE_LABELS.dn_to_send, 'À transmettre au Directeur DN');
    assert.equal(INTAKE_STAGE_LABELS.dn_in_circuit, 'En circuit Directeur DN');
    assert.equal(INTAKE_STAGE_LABELS.dn_returned, 'Annotation du Directeur DN reçue');
  });
});

describe('M3 gate', () => {
  it('needs the request AND the Directeur DN circuit at pending_review', () => {
    assert.equal(isPreliminaryOpenable('pending_review', 'pending_review'), true);
    for (const dn of [null, 'submitted', 'in_signature_circuit']) {
      assert.equal(isPreliminaryOpenable('pending_review', dn), false, String(dn));
    }
    for (const status of ['submitted', 'in_progress', 'signed', 'rejected']) {
      assert.equal(isPreliminaryOpenable(status, 'pending_review'), false, status);
    }
  });
});

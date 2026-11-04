/** FINANCE-LABELS-1 - the shared Finance invoice catalog (@aidn/shared
 *  finance-invoice.ts): the full phase x request type matrix. Pure. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FINANCE_INVOICE_FALLBACK_LABEL,
  FINANCE_REQUEST_TYPE_LABELS,
  OMA_REQUEST_TYPES,
  financeInvoiceLabel,
  financeRequestTypeLabel,
} from '@aidn/shared';

const label = (phaseCode: string, requestType: string) => financeInvoiceLabel({ phaseCode, requestType });

describe('financeInvoiceLabel', () => {
  it('M5 Évaluation approfondie - validated study fees (workshop 24/10/2026)', () => {
    assert.equal(label('M5', 'recognition'), 'Frais d’étude de Reconnaissance d’agrément');
    assert.equal(label('M5', 'issuance'), 'Frais d’étude de Certification d’un OMA');
  });

  it('M5 - modification / renewal: provisional - business wording pending confirmation', () => {
    assert.equal(label('M5', 'modification'), 'Frais d’étude de Modification d’un agrément OMA');
    assert.equal(label('M5', 'renewal'), 'Frais d’étude de Renouvellement d’un agrément OMA');
    for (const requestType of OMA_REQUEST_TYPES) assert.doesNotMatch(label('M5', requestType), /provisoire/i);
  });

  it('M6 Démonstration / Inspection - an audit fee for each of the four request types', () => {
    assert.deepEqual(
      OMA_REQUEST_TYPES.map((requestType) => label('M6', requestType)),
      [
        'Frais d’audit - Reconnaissance d’agrément',
        'Frais d’audit - Certification d’un OMA',
        'Frais d’audit - Modification',
        'Frais d’audit - Renouvellement',
      ]
    );
  });

  it('M7 Délivrance - a delivery fee for each of the four request types', () => {
    assert.deepEqual(
      OMA_REQUEST_TYPES.map((requestType) => label('M7', requestType)),
      [
        'Frais de délivrance - Reconnaissance d’agrément',
        'Frais de délivrance - Certification d’un OMA',
        'Frais de délivrance - Modification',
        'Frais de délivrance - Renouvellement',
      ]
    );
  });

  it('unknown request type or phase: the neutral fallback, never the raw value', () => {
    for (const [phaseCode, requestType] of [
      ['M5', 'legacy_type'],
      ['M5', ''],
      ['M3', 'recognition'],
      ['toString', 'recognition'],
      ['M6', 'constructor'],
    ]) {
      const value = label(phaseCode, requestType);
      assert.equal(value, FINANCE_INVOICE_FALLBACK_LABEL, `${phaseCode} / ${requestType}`);
      assert.equal(value, 'Frais liés au dossier OMA');
    }
  });

  it('request type names: no raw enum value, null when unknown', () => {
    assert.deepEqual(FINANCE_REQUEST_TYPE_LABELS, {
      recognition: 'Reconnaissance d’agrément',
      issuance: 'Certification d’un OMA',
      modification: 'Modification',
      renewal: 'Renouvellement',
    });
    assert.equal(financeRequestTypeLabel('issuance'), 'Certification d’un OMA');
    assert.equal(financeRequestTypeLabel('legacy_type'), null);
    assert.equal(financeRequestTypeLabel('constructor'), null);
  });

  it('the catalog covers the request_type DB enum exactly', async () => {
    const { requestTypeEnum } = await import('../../shared/db/schema.js');
    assert.deepEqual([...requestTypeEnum.enumValues], [...OMA_REQUEST_TYPES]);
  });
});

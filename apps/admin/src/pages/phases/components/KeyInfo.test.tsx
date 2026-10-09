/** K7d - phase key info: readable French labels (no raw status codes) and,
 *  on a closed dossier, nothing shown as awaited. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { MEETING_STATUSES } from '@aidn/shared';
import { api } from '../../../lib/axios';
import type { DossierState } from '../../../lib/api/phases.types';
import { queryKeys } from '../../../lib/react-query/queryKeys';
import { renderWithProviders } from '../../../test/render';
import WorkflowCockpit, { type WorkflowKeyInfoItem } from './WorkflowCockpit';
import * as certificates from '../certificates/constants';
import * as deepEvaluation from '../deep-evaluation/constants';
import * as formal from '../formal/constants';
import * as preliminary from '../preliminary/constants';
import * as siteInspection from '../site-inspection/constants';

const AT = '2026-10-02T08:00:00.000Z';
const rejected: DossierState = { status: 'rejected', closed: true, closedAt: AT, rejectionReason: 'Motif' };
const open: DossierState = { status: 'in_progress', closed: false, closedAt: null, rejectionReason: null };
const noop = () => undefined;

beforeEach(() => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: [] });
});
afterEach(() => vi.restoreAllMocks());

function renderKeyInfo(state: DossierState, keyInfo: WorkflowKeyInfoItem[]) {
  renderWithProviders(
    <WorkflowCockpit
      requestId="9"
      currentCode="M6"
      title="Phase - Demonstration / Inspection"
      subtitle="Demande #9"
      phaseStatus="open"
      onBack={noop}
      checklistTitle="Checklist"
      checklist={[{ label: 'Visite tenue', done: false }]}
      action={{ title: 'Avis R3', description: 'Le R3 doit rendre son avis.', owner: 'R3', tone: 'warning' }}
      keyInfo={keyInfo}
    >
      <div />
    </WorkflowCockpit>,
    { seed: [[queryKeys.phases.dossierState('9'), state], [queryKeys.phases.summary('9'), []]] },
  );
}

const avisR3: WorkflowKeyInfoItem = { label: 'Avis R3', value: 'Attendu', tone: 'warning', closedValue: 'Non rendu' };
const docs: WorkflowKeyInfoItem = { label: 'Documents valides', value: '3/11', tone: 'warning' };

describe('<WorkflowCockpit> key info (K7d)', () => {
  it('open dossier: value and tone unchanged', () => {
    renderKeyInfo(open, [avisR3, docs]);
    expect(screen.getByText('Attendu')).toHaveClass('text-anac-warning');
    expect(screen.queryByText('Non rendu')).not.toBeInTheDocument();
    expect(screen.getByText('3/11')).toHaveClass('text-anac-warning');
  });

  it('closed dossier: closedValue replaces the value, nothing is shown as pending', () => {
    renderKeyInfo(rejected, [avisR3, docs]);
    expect(screen.getByText('Non rendu')).toHaveClass('text-anac-muted');
    expect(screen.queryByText('Attendu')).not.toBeInTheDocument();
    expect(screen.getByText('3/11')).toHaveClass('text-anac-muted'); // no closedValue: value kept, tone neutral
  });
});

describe('status label maps used by the key info (K7d)', () => {
  const PAYMENT_STATUSES = ['awaiting_invoice', 'awaiting_proof', 'pending_validation', 'validated', 'rejected'];
  const CERTIFICATE_STATUSES = ['in_preparation', 'printed', 'signed', 'archived', 'notified', 'collected'];

  it('every payment status has a label in M5, M6 and M7 (M5 used "pending" instead of "awaiting_invoice")', () => {
    for (const labels of [deepEvaluation.PAYMENT_STATUS_LABELS, siteInspection.PAYMENT_STATUS_LABELS, certificates.PAYMENT_STATUS_LABELS]) {
      for (const status of PAYMENT_STATUSES) expect(labels[status], status).toBeTruthy();
    }
  });

  it('every meeting / visit status and certificate status has a label', () => {
    for (const labels of [preliminary.MEETING_STATUS_LABELS, formal.MEETING_STATUS_LABELS, siteInspection.SITE_VISIT_STATUS_LABELS]) {
      for (const status of MEETING_STATUSES) expect(labels[status], status).toBeTruthy();
    }
    for (const status of CERTIFICATE_STATUSES) expect(certificates.CERTIFICATE_STATUS_LABELS[status], status).toBeTruthy();
  });
});

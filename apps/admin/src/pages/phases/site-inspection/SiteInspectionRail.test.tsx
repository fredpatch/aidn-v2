/** SESSION1-UX-1 final review I1 - the M6 helper's block reason reaches the
 *  rail callout (it was only rendered for the never-emitted 'blocked' state). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { api } from '../../../lib/axios';
import type { DossierState } from '../../../lib/api/phases.types';
import { queryKeys } from '../../../lib/react-query/queryKeys';
import { renderWithProviders } from '../../../test/render';
import WorkflowCockpit from '../components/WorkflowCockpit';
import { siteInspectionWorkflowSummary } from './helpers';
import type { SiteInspectionBundle } from './types';

vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ user: { roles: ['dn_agent'] } }) }));

const open: DossierState = { status: 'in_progress', closed: false, closedAt: null, rejectionReason: null };

beforeEach(() => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: [] });
});
afterEach(() => vi.restoreAllMocks());

const bundle = {
  phase: { id: 1, status: 'open', openedAt: '2026-01-01', closedAt: null },
  payment: {
    id: 1,
    status: 'awaiting_proof',
    invoiceFileUrl: '/inv.pdf',
    invoiceUploadedAt: null,
    proofFileUrl: null,
    proofUploadedAt: null,
    validatedAt: null,
    rejectionReason: null,
    rejectionAction: null,
  },
  siteVisit: null,
  inspection: null,
} as unknown as SiteInspectionBundle;

describe('M6 rail callout (final review I1)', () => {
  it('shows the helper block reason on a waiting state', () => {
    const summary = siteInspectionWorkflowSummary(bundle);
    expect(summary.state).toBe('waiting');
    renderWithProviders(
      <WorkflowCockpit
        requestId="9"
        currentCode="M6"
        title="Phase - Demonstration / Inspection"
        subtitle="Demande #9"
        phaseStatus="open"
        onBack={() => undefined}
        checklistTitle="Checklist"
        checklist={[]}
        action={{
          title: summary.title,
          description: summary.description,
          state: summary.state,
          owner: summary.owner,
          blockReason: summary.blockReason,
        }}
        keyInfo={[]}
      >
        <div />
      </WorkflowCockpit>,
      { seed: [[queryKeys.phases.dossierState('9'), open], [queryKeys.phases.summary('9'), []]] }
    );
    const rail = screen.getByRole('region', { name: 'Prochaine action' });
    expect(
      within(rail).getByText('L’avis d’inspection ne peut pas finaliser la phase tant que le paiement n’est pas validé.')
    ).toBeInTheDocument();
  });
});

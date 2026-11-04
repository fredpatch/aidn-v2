/** WORKFLOW-FOUNDATION-1B - M3, M4 and M5 close only through the closure
 *  courrier: no immediate « Clôturer la phase » any more, and one « Courrier
 *  de clôture » block driven by the API's PhaseClosureState (readiness never
 *  recomputed here). The phase work cards are stubbed: only the closure
 *  block and the next action matter. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { ComponentType } from 'react';
import type { PhaseClosureState, PhaseClosureView } from '@aidn/shared';
import type { DossierState } from '../../lib/api/phases.types';
import { api } from '../../lib/axios';
import { queryKeys } from '../../lib/react-query/queryKeys';
import { renderWithProviders } from '../../test/render';

const auth = vi.hoisted(() => ({ roles: ['dn_supervisor'] as string[] }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 1, roles: auth.roles } }) }));

const PHASE_ID = 11;
const phase = { id: PHASE_ID, status: 'open', openedAt: '2026-10-01T09:00:00.000Z', closedAt: null };
const heldMeeting = {
  id: 5,
  status: 'held',
  scheduledAt: '2026-10-10T09:00:00.000Z',
  crDocumentUrl: null,
  signedCrDocumentUrl: null,
  negotiation: { confirmationStatus: 'confirmed' },
};
const bundles = vi.hoisted(() => ({ phaseStatus: 'open' }));
const hook = (bundle: () => unknown) => () => ({
  bundle: bundle(),
  loading: false,
  error: null,
  startPhase: () => undefined,
  startingPhase: false,
});
vi.mock('./preliminary/hooks/usePreliminaryBundle', () => ({
  usePreliminaryBundle: hook(() => ({
    phase: { ...phase, status: bundles.phaseStatus },
    meeting: heldMeeting,
    evaluation: { submittedFileUrl: '/api/files/2', madeAvailableAt: '2026-10-11T09:00:00.000Z' },
    circuit: { status: 'pending_review' },
  })),
}));
vi.mock('./formal/hooks/useFormalBundle', () => ({
  useFormalBundle: hook(() => ({
    phase: { ...phase, status: bundles.phaseStatus },
    letterCircuit: { status: 'pending_review' },
    documents: [],
    meeting: heldMeeting,
    completionRate: 11,
  })),
}));
vi.mock('./deep-evaluation/hooks/useDeepEvaluationBundle', () => ({
  useDeepEvaluationBundle: hook(() => ({
    phase: { ...phase, status: bundles.phaseStatus },
    payment: { status: 'validated', invoiceFileUrl: '/api/files/3', proofFileUrl: '/api/files/4' },
    evaluations: [],
    completionRate: { total: 1, validated: 1, pending: 0, needsAction: 0 },
  })),
}));
for (const card of [
  './preliminary/components/MeetingCard',
  './preliminary/components/DeclarationCard',
  './formal/components/DocumentsChecklistCard',
  './formal/components/FormalLetterCard',
  './formal/components/FormalMeetingCard',
  './deep-evaluation/components/PaymentCard',
  './deep-evaluation/components/DocumentEvaluationsCard',
]) {
  vi.doMock(card, () => ({ default: () => null }));
}

const { default: PreliminaryPhasePage } = await import('./PreliminaryPhasePage');
const { default: FormalPhasePage } = await import('./formal/FormalPhasePage');
const { default: DeepEvaluationPhasePage } = await import('./deep-evaluation/DeepEvaluationPhasePage');

const dossier: DossierState = {
  status: 'in_progress',
  closed: false,
  closedAt: null,
  rejectionReason: null,
  identity: { reference: 'DEM-1', organisationName: 'OMA 1', applicantName: 'Jean', statusLabel: 'En cours', requestType: 'issuance' },
};

const view = (status: PhaseClosureView['status']): PhaseClosureView => ({
  id: 3,
  phaseId: PHASE_ID,
  requestId: 42,
  status,
  draftDocumentUrl: '/api/files/20',
  signedDocumentUrl: status === 'signed_returned' ? '/api/files/21' : null,
  submittedAt: '2026-10-20T09:00:00.000Z',
  signatureSentAt: status === 'submitted' ? null : '2026-10-21T09:00:00.000Z',
  signedAt: status === 'signed_returned' ? '2026-10-22T09:00:00.000Z' : null,
});
const STATES: Record<string, PhaseClosureState> = {
  notReady: {
    phaseId: PHASE_ID,
    phaseStatus: 'open',
    closure: null,
    readiness: { ready: false, blockerCode: 'PAYMENT_NOT_VALIDATED', blockerMessage: 'Le paiement doit être validé avant de clôturer la phase.' },
  },
  ready: { phaseId: PHASE_ID, phaseStatus: 'open', closure: null, readiness: { ready: true, blockerCode: null, blockerMessage: null } },
  submitted: { phaseId: PHASE_ID, phaseStatus: 'open', closure: view('submitted'), readiness: null },
  inCircuit: { phaseId: PHASE_ID, phaseStatus: 'open', closure: view('in_signature_circuit'), readiness: null },
  closed: { phaseId: PHASE_ID, phaseStatus: 'closed', closure: view('signed_returned'), readiness: null },
};

function renderPage(path: string, Page: ComponentType, closure: PhaseClosureState) {
  return renderWithProviders(
    <Routes>
      <Route path={`/demandes/:requestId/${path}`} element={<Page />} />
    </Routes>,
    {
      route: `/demandes/42/${path}`,
      seed: [
        [queryKeys.phases.dossierState('42'), dossier],
        [queryKeys.phases.summary('42'), []],
        [queryKeys.phaseClosure.byPhase(PHASE_ID), closure],
      ],
    }
  );
}

const block = () => screen.getByRole('region', { name: 'Courrier de clôture' });

beforeEach(() => {
  auth.roles = ['dn_supervisor'];
  bundles.phaseStatus = 'open';
  vi.restoreAllMocks();
});

const PAGES: Array<[string, string, ComponentType]> = [
  ['Phase préliminaire', 'phase-preliminaire', PreliminaryPhasePage],
  ['Demande formelle', 'phase-formelle', FormalPhasePage],
  ['Évaluation approfondie', 'evaluation-approfondie', DeepEvaluationPhasePage],
];

describe.each(PAGES)('%s - closure courrier', (_label, path, Page) => {
  it('no legacy immediate close, no closure note', () => {
    renderPage(path, Page, STATES.ready);
    expect(screen.queryByRole('button', { name: /Clôturer la phase/ })).toBeNull();
    expect(screen.queryByText(/Note \(optionnel\)/)).toBeNull();
  });

  it('not ready: « Clôture non disponible » with the API blocker, no deposit', () => {
    renderPage(path, Page, STATES.notReady);
    expect(within(block()).getByText('Clôture non disponible')).toBeInTheDocument();
    expect(within(block()).getByText('Le paiement doit être validé avant de clôturer la phase.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Déposer le courrier de clôture' })).toBeNull();
  });

  it('ready, dn_agent: courrier to deposit, reserved to the Chef de service DN', () => {
    auth.roles = ['dn_agent'];
    renderPage(path, Page, STATES.ready);
    expect(within(block()).getByText(/Dépôt réservé au Chef de service DN/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Déposer le courrier de clôture' })).toBeNull();
    // The next action is the courrier's, owned by the Chef de service DN.
    expect(screen.getAllByText('Courrier de clôture à déposer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Chef de service DN').length).toBeGreaterThan(0);
  });

  it('ready, dn_supervisor: the deposit action', () => {
    renderPage(path, Page, STATES.ready);
    expect(within(block()).getByLabelText('Courrier de clôture')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Déposer le courrier de clôture' })).toBeDisabled();
  });

  it('submitted: deposited, awaiting the DG circuit, no DN action', () => {
    renderPage(path, Page, STATES.submitted);
    expect(within(block()).getByText('Courrier déposé')).toBeInTheDocument();
    expect(within(block()).getByText('En attente de mise en circuit DG')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Déposer le courrier de clôture' })).toBeNull();
    expect(screen.getAllByText('Courrier de clôture à mettre en circuit').length).toBeGreaterThan(0);
  });

  it('in the signature circuit: signed return awaited', () => {
    renderPage(path, Page, STATES.inCircuit);
    expect(within(block()).getByText('En circuit DG')).toBeInTheDocument();
    expect(within(block()).getByText('Retour signé attendu')).toBeInTheDocument();
    expect(screen.getAllByText('Retour DG du courrier de clôture attendu').length).toBeGreaterThan(0);
  });

  it('signed return: courrier returned, phase closed', () => {
    bundles.phaseStatus = 'closed';
    renderPage(path, Page, STATES.closed);
    expect(within(block()).getByText('Courrier signé retourné')).toBeInTheDocument();
    expect(within(block()).getByText('Phase clôturée')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bM[3-5]\b.*courrier/i);
  });
});

describe('Demande formelle - deposit upload', () => {
  const file = new File(['%PDF'], 'cloture.pdf', { type: 'application/pdf' });

  function choose() {
    fireEvent.change(within(block()).getByLabelText('Courrier de clôture'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Déposer le courrier de clôture' }));
  }

  it('success: uploads the file, then deposits it on the phase', async () => {
    const post = vi.spyOn(api, 'post').mockImplementation(async (url: string) => {
      if (url === '/uploads') return { data: { uploadAssetId: 77 } };
      return { data: view('submitted') };
    });
    vi.spyOn(api, 'get').mockResolvedValue({ data: STATES.submitted });
    renderPage('phase-formelle', FormalPhasePage, STATES.ready);
    choose();
    await waitFor(() => expect(post).toHaveBeenCalledWith(`/phase-closures/phases/${PHASE_ID}`, { uploadAssetId: 77 }));
  });

  it('error: the API wording is shown, never a code', async () => {
    vi.spyOn(api, 'post').mockImplementation(async (url: string) => {
      if (url === '/uploads') return { data: { uploadAssetId: 77 } };
      throw {
        isAxiosError: true,
        response: { status: 409, data: { code: 'PHASE_CLOSURE_ALREADY_EXISTS', message: 'Un courrier de clôture existe déjà pour cette phase.' } },
      };
    });
    renderPage('phase-formelle', FormalPhasePage, STATES.ready);
    choose();
    expect(await within(block()).findByText('Un courrier de clôture existe déjà pour cette phase.')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/PHASE_CLOSURE_ALREADY_EXISTS/);
  });
});

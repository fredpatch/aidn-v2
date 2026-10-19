/** DOSSIER-CONTEXT-UX-1 - every treatment screen names its dossier (business
 *  reference + organisation), for the DN cockpit, the Finance-only M5/M6/M7
 *  views and the CI M6 view. Bundles are mocked as "phase not started": the
 *  header is what matters here, not the cards. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { ComponentType, ReactElement } from 'react';
import type { DossierState } from '../../lib/api/phases.types';
import { queryKeys } from '../../lib/react-query/queryKeys';
import { renderWithProviders } from '../../test/render';

const auth = vi.hoisted(() => ({ roles: ['dn_agent'] as string[] }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { roles: auth.roles } }) }));

const emptyBundle = vi.hoisted(() => () => ({
  bundle: null,
  loading: false,
  error: null,
  startPhase: () => undefined,
  startingPhase: false,
}));
vi.mock('./preliminary/hooks/usePreliminaryBundle', () => ({ usePreliminaryBundle: emptyBundle }));
vi.mock('./deep-evaluation/hooks/useDeepEvaluationBundle', () => ({ useDeepEvaluationBundle: emptyBundle }));
vi.mock('./site-inspection/hooks/useSiteInspectionBundle', () => ({ useSiteInspectionBundle: emptyBundle }));
vi.mock('./certificates/hooks/useCertificateBundle', () => ({ useCertificateBundle: emptyBundle }));

const { default: PreliminaryPhasePage } = await import('./PreliminaryPhasePage');
const { default: DeepEvaluationPhasePage } = await import('./deep-evaluation/DeepEvaluationPhasePage');
const { default: SiteInspectionPhasePage } = await import('./site-inspection/SiteInspectionPhasePage');
const { default: CertificatesPhasePage } = await import('./certificates/CertificatesPhasePage');

const REFERENCE = 'DEM-2026-10-15-PSGE-01';
const state: DossierState = {
  status: 'in_progress',
  closed: false,
  closedAt: null,
  rejectionReason: null,
  identity: {
    reference: REFERENCE,
    organisationName: 'Air Example Gabon',
    applicantName: 'Jean Dupont',
    statusLabel: 'En cours',
  },
};

function renderPage(path: string, page: ReactElement, dossier: DossierState = state) {
  return renderWithProviders(
    <Routes>
      <Route path={`/demandes/:requestId/${path}`} element={page} />
    </Routes>,
    {
      route: `/demandes/42/${path}`,
      seed: [
        [queryKeys.phases.dossierState('42'), dossier],
        [queryKeys.phases.summary('42'), []],
      ],
    }
  );
}

function expectDossierContext() {
  const region = screen.getByRole('region', { name: `Dossier ${REFERENCE}, Air Example Gabon` });
  expect(within(region).getByText(REFERENCE)).toBeInTheDocument();
  expect(within(region).getByText('Air Example Gabon')).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/Demande #42/);
}

beforeEach(() => {
  auth.roles = ['dn_agent'];
});

describe('DN cockpit (WorkflowCockpit)', () => {
  const pages: Array<[string, string, ComponentType, string]> = [
    ['M3', 'phase-preliminaire', PreliminaryPhasePage, 'Phase - Préliminaire'],
    ['M5', 'evaluation-approfondie', DeepEvaluationPhasePage, 'Phase - Évaluation Approfondie'],
    ['M6', 'demonstration-inspection', SiteInspectionPhasePage, 'Phase - Démonstration / Inspection'],
    ['M7', 'delivrance', CertificatesPhasePage, 'Phase - Délivrance'],
  ];
  for (const [code, path, Page, title] of pages) {
    it(`${code}: phase title, dossier reference + organisation, breadcrumb on the reference`, () => {
      renderPage(path, <Page />);
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
      expectDossierContext();
      const breadcrumb = screen.getByRole('navigation', { name: "Fil d'Ariane" });
      expect(breadcrumb).toHaveTextContent(`Direction de la Navigabilité${REFERENCE}${title}`);
    });
  }

  it('closed dossier: the context stays, with the authoritative status label', () => {
    renderPage('delivrance', <CertificatesPhasePage />, {
      ...state,
      status: 'rejected',
      closed: true,
      closedAt: '2026-10-02T08:00:00.000Z',
      rejectionReason: 'motif',
      identity: { ...state.identity!, statusLabel: 'Rejeté' },
    });
    expectDossierContext();
    expect(screen.getByText('Rejeté')).toBeInTheDocument();
  });

  it('context unavailable: degraded « Dossier #42 » and a neutral breadcrumb, the page still renders', () => {
    renderPage('evaluation-approfondie', <DeepEvaluationPhasePage />, { ...state, identity: null });
    expect(screen.getByText('Dossier #42')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Phase - Évaluation Approfondie' })).toBeInTheDocument();
  });
});

describe('Finance-only views (s5_agent)', () => {
  const pages: Array<[string, string, ComponentType, string]> = [
    ['M5', 'evaluation-approfondie', DeepEvaluationPhasePage, 'Paiement - Évaluation approfondie'],
    ['M6', 'demonstration-inspection', SiteInspectionPhasePage, 'Paiement - Demonstration / Inspection'],
    ['M7', 'delivrance', CertificatesPhasePage, 'Paiement - Délivrance'],
  ];
  for (const [code, path, Page, title] of pages) {
    it(`${code}: Finance title and the same dossier context, no DN cockpit`, () => {
      auth.roles = ['s5_agent'];
      renderPage(path, <Page />);
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
      expectDossierContext();
      expect(screen.queryByRole('navigation', { name: "Fil d'Ariane" })).toBeNull();
      expect(screen.getByRole('button', { name: /Retour aux paiements Finance/ })).toBeInTheDocument();
    });
  }
});

describe('CI view (r3_agent)', () => {
  it('M6: inspection title and the dossier context, no DN cockpit', () => {
    auth.roles = ['r3_agent'];
    renderPage('demonstration-inspection', <SiteInspectionPhasePage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Avis d’inspection - Inspection sur site' })).toBeInTheDocument();
    expectDossierContext();
    expect(screen.queryByRole('navigation', { name: "Fil d'Ariane" })).toBeNull();
    expect(screen.getByRole('button', { name: /Retour aux inspections/ })).toBeInTheDocument();
  });
});

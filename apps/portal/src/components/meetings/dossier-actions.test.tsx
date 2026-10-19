/** SESSION1-UX-1 - the dossier shows the applicant actions of GET
 *  /applicant/actions (server order): banner = top dossier action, phase
 *  summary = top phase action, each action anchored next to its control.
 *  Replaces signed-report-actions.test.tsx (SESSION1-MEET-2). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ApplicantAction, ApplicantActionKey } from '@aidn/shared';
import { api } from '../../lib/axios';
import { notify } from '../../lib/notify';
import { queryKeys, type PhaseCode } from '../../lib/react-query/queryKeys';
import type { RequestView } from '../../lib/api/requests.types';
import { renderWithProviders } from '../../test/render';
import { DossierView } from '../../pages/requests/components/DossierView';
import { PreliminaryPhaseSection } from '../../pages/requests/components/PreliminaryPhaseSection';

const DAY = '2026-10-10T08:00:00.000Z';
const REQUEST_ID = 42;

const request: RequestView = {
  id: REQUEST_ID,
  reference: 'DEM-42',
  requestType: 'issuance',
  message: null,
  status: 'in_progress',
  rejectionReason: null,
  circuitStatus: 'pending_review',
  circuitDocumentUrl: null,
  circuitDocumentMimeType: null,
  createdAt: DAY,
};

const action = (
  key: ApplicantActionKey,
  phaseCode: ApplicantAction['phaseCode'],
  anchor: string,
  over: Partial<ApplicantAction> = {}
): ApplicantAction => ({
  id: `${key}:${REQUEST_ID}:${anchor}`,
  key,
  requestId: REQUEST_ID,
  requestReference: 'DEM-42',
  phaseCode,
  priority: 10,
  urgent: false,
  anchor,
  dueAt: null,
  ...over,
});

const meeting = (over: Record<string, unknown> = {}) => ({
  id: 9,
  scheduledAt: DAY,
  location: 'Salle',
  status: 'held',
  confirmationStatus: 'confirmed',
  confirmedAt: DAY,
  alternate: null,
  lastRefusal: null,
  actions: [],
  ticketAvailable: false,
  crDocumentUrl: null,
  crUploadedAt: null,
  signedCrDocumentUrl: null,
  signedCrUploadedAt: null,
  canSubmitSignedReport: false,
  ...over,
});
const reportToSign = {
  crDocumentUrl: '/api/files/101',
  crUploadedAt: DAY,
  canSubmitSignedReport: true,
};
const evaluation = (submitted: boolean) => ({
  templateFileUrl: 'u/t',
  madeAvailableAt: DAY,
  returnDeadline: DAY,
  submittedFileUrl: submitted ? 'u/d' : null,
  submittedAt: submitted ? DAY : null,
});
const m3 = (status: string, over: Record<string, unknown> = {}) => ({
  phase: { id: 3, status },
  meeting: meeting(),
  evaluation: evaluation(true),
  ...over,
});
const m4 = (status: string, over: Record<string, unknown> = {}) => ({
  phase: { id: 4, status },
  letterCircuit: { id: 1, status: 'pending_review', fileUrl: 'u/l' },
  documents: [],
  meeting: null,
  completionRate: 11,
  ...over,
});
const payment = (status = 'validated') => ({
  id: 1,
  status,
  invoiceFileUrl: 'u/i',
  proofFileUrl: status === 'awaiting_proof' ? null : 'u/p',
  rejectionReason: null,
});
const m5 = (status: string, over: Record<string, unknown> = {}) => ({
  phase: { id: 5, status },
  payment: payment(),
  evaluations: [],
  completionRate: { total: 0, validated: 0 },
  ...over,
});
const m6 = (status: string, over: Record<string, unknown> = {}) => ({
  phase: { id: 6, status },
  payment: payment(),
  siteVisit: null,
  ...over,
});
const m7 = (status: string, over: Record<string, unknown> = {}) => ({
  phase: { id: 7, status },
  payment: payment(),
  certificate: null,
  ...over,
});
const NONE = { phase: null };

type Bundles = Record<PhaseCode, unknown>;
const bundles = (over: Partial<Bundles>): Bundles => ({
  M3: m3('closed'),
  M4: NONE,
  M5: NONE,
  M6: NONE,
  M7: NONE,
  ...over,
});

function seedOf(b: Bundles, actions?: ApplicantAction[]) {
  const seed = (Object.keys(b) as PhaseCode[]).map(
    (code) => [queryKeys.requests.phase(REQUEST_ID, code), b[code]] as [readonly unknown[], unknown]
  );
  if (actions) seed.push([queryKeys.requests.actions(), actions]);
  return seed;
}

function renderDossier(b: Bundles, actions: ApplicantAction[] = []) {
  return renderWithProviders(<DossierView request={request} onChanged={vi.fn()} />, {
    seed: seedOf(b, actions),
  });
}

beforeEach(() => {
  window.location.hash = '';
});
afterEach(() => vi.restoreAllMocks());

describe('phase summary = top action of that phase', () => {
  const signedReport = action('signed_meeting_report', 'M3', 'compte-rendu-9', { priority: 80 });
  const m3WithReport = m3('open', { meeting: meeting(reportToSign) });

  it('M3 shows the signed_meeting_report action when listed, its passive wording otherwise', () => {
    const first = renderWithProviders(<PreliminaryPhaseSection requestId={REQUEST_ID} />, {
      seed: [
        [queryKeys.requests.phase(REQUEST_ID, 'M3'), m3WithReport],
        [queryKeys.requests.actions(), [signedReport]],
      ],
    });
    expect(screen.getByText('Action requise - Compte rendu à signer')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Accéder au compte rendu' })).toHaveAttribute(
      'href',
      '#compte-rendu-9'
    );
    expect(screen.queryByText('Déclaration transmise')).not.toBeInTheDocument();
    first.unmount();

    renderWithProviders(<PreliminaryPhaseSection requestId={REQUEST_ID} />, {
      seed: [
        [queryKeys.requests.phase(REQUEST_ID, 'M3'), m3WithReport],
        [queryKeys.requests.actions(), []],
      ],
    });
    expect(screen.getByText('Déclaration transmise')).toBeInTheDocument();
    expect(screen.queryByText('Action requise - Compte rendu à signer')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Accéder au compte rendu' })).not.toBeInTheDocument();
  });

  it("another dossier's action never reaches this summary", () => {
    renderWithProviders(<PreliminaryPhaseSection requestId={REQUEST_ID} />, {
      seed: [
        [queryKeys.requests.phase(REQUEST_ID, 'M3'), m3WithReport],
        [queryKeys.requests.actions(), [{ ...signedReport, requestId: 7 }]],
      ],
    });
    expect(screen.getByText('Déclaration transmise')).toBeInTheDocument();
  });

  it('after the signed upload, the refetched actions bring back the passive wording', async () => {
    vi.spyOn(notify, 'success').mockImplementation(() => undefined as never);
    vi.spyOn(notify, 'error').mockImplementation(() => undefined as never);
    vi.spyOn(api, 'post').mockImplementation((url: string) =>
      Promise.resolve({ data: url === '/uploads' ? { uploadAssetId: 55 } : {} })
    );
    const sent = m3('open', {
      meeting: meeting({
        ...reportToSign,
        canSubmitSignedReport: false,
        signedCrDocumentUrl: '/api/files/102',
        signedCrUploadedAt: DAY,
      }),
    });
    vi.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url === '/applicant/actions') return Promise.resolve({ data: [] });
      if (url === `/preliminary-evaluation/by-request/${REQUEST_ID}`)
        return Promise.resolve({ data: sent });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    renderWithProviders(<PreliminaryPhaseSection requestId={REQUEST_ID} />, {
      seed: [
        [queryKeys.requests.phase(REQUEST_ID, 'M3'), m3WithReport],
        [queryKeys.requests.actions(), [signedReport]],
      ],
    });
    expect(screen.getByText('Action requise - Compte rendu à signer')).toBeInTheDocument();
    await userEvent.upload(
      screen.getByLabelText('Fichier du compte rendu signé'),
      new File(['%PDF'], 'cr-signe.pdf', { type: 'application/pdf' })
    );
    await waitFor(() => expect(screen.getByText('Déclaration transmise')).toBeInTheDocument());
    expect(screen.queryByText('Action requise - Compte rendu à signer')).not.toBeInTheDocument();
  });
});

describe('dossier banner = top dossier action (server order)', () => {
  it('the first listed action of this dossier wins even if a later one has a lower priority', () => {
    renderDossier(
      bundles({ M4: m4('open', { letterCircuit: null, completionRate: 9, documents: [] }) }),
      [
        action('certificate_collection', 'M7', 'retrait', { requestId: 7, priority: 90 }),
        action('formal_letter', 'M4', 'lettre', { priority: 40 }),
        action('meeting_confirmation', 'M4', 'rendez-vous-12', { priority: 10 }),
      ]
    );
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Action requise');
    expect(banner).toHaveTextContent("Déposez votre lettre officielle de demande d'agrément OMA.");
    expect(within(banner).getByRole('link', { name: 'Déposer la lettre' })).toHaveAttribute(
      'href',
      '#lettre'
    );
  });

  it('no action: passive banner « Aucune action requise de votre part »', () => {
    renderDossier(bundles({ M4: m4('open') }), []);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Aucune action requise de votre part');
    expect(banner).toHaveTextContent('Pièces déposées');
    expect(within(banner).queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('closed phase rows', () => {
  const b = bundles({ M3: m3('closed', { meeting: meeting(reportToSign) }), M4: m4('open') });

  it('a closed M3 opens when an action targets M3 (MEET-2)', () => {
    renderDossier(b, [action('signed_meeting_report', 'M3', 'compte-rendu-9', { priority: 80 })]);
    const row = screen
      .getByText('Phase préliminaire', { selector: 'span' })
      .closest('details') as HTMLDetailsElement;
    expect(row.open).toBe(true);
    expect(document.getElementById('compte-rendu-9')).not.toBeNull();
  });

  it('stays closed otherwise', () => {
    renderDossier(b, []);
    const row = screen
      .getByText('Phase préliminaire', { selector: 'span' })
      .closest('details') as HTMLDetailsElement;
    expect(row.open).toBe(false);
    expect(document.getElementById('compte-rendu-9')).toBeNull();
  });
});

const awaitingApplicant = meeting({
  status: 'scheduled',
  confirmationStatus: 'awaiting_applicant',
  confirmedAt: null,
  actions: ['confirm', 'propose_alternate'],
});

const ANCHOR_CASES: Array<{
  key: ApplicantActionKey;
  phase: ApplicantAction['phaseCode'];
  anchor: string;
  bundles: Bundles;
}> = [
  {
    key: 'meeting_confirmation',
    phase: 'M3',
    anchor: 'rendez-vous-9',
    bundles: bundles({ M3: m3('open', { meeting: awaitingApplicant, evaluation: null }) }),
  },
  {
    key: 'meeting_confirmation',
    phase: 'M4',
    anchor: 'rendez-vous-12',
    bundles: bundles({ M4: m4('open', { meeting: { ...awaitingApplicant, id: 12 } }) }),
  },
  {
    key: 'signed_meeting_report',
    phase: 'M3',
    anchor: 'compte-rendu-9',
    bundles: bundles({ M3: m3('closed', { meeting: meeting(reportToSign) }), M4: m4('open') }),
  },
  {
    key: 'signed_meeting_report',
    phase: 'M4',
    anchor: 'compte-rendu-12',
    bundles: bundles({ M4: m4('open', { meeting: meeting({ ...reportToSign, id: 12 }) }) }),
  },
  {
    key: 'preliminary_declaration',
    phase: 'M3',
    anchor: 'declaration',
    bundles: bundles({ M3: m3('open', { evaluation: evaluation(false) }) }),
  },
  {
    key: 'formal_letter',
    phase: 'M4',
    anchor: 'lettre',
    bundles: bundles({ M4: m4('open', { letterCircuit: null }) }),
  },
  {
    key: 'formal_missing_documents',
    phase: 'M4',
    anchor: 'pieces',
    bundles: bundles({
      M4: m4('open', {
        completionRate: 10,
        documents: [
          {
            id: null,
            slot: 's1',
            label: 'Manuel MPM',
            status: 'missing',
            fileUrl: null,
            submittedAt: null,
          },
        ],
      }),
    }),
  },
  {
    key: 'payment_proof',
    phase: 'M5',
    anchor: 'paiement-M5',
    bundles: bundles({ M4: m4('closed'), M5: m5('open', { payment: payment('awaiting_proof') }) }),
  },
  {
    key: 'payment_proof',
    phase: 'M6',
    anchor: 'paiement-M6',
    bundles: bundles({
      M4: m4('closed'),
      M5: m5('closed'),
      M6: m6('open', { payment: payment('awaiting_proof') }),
    }),
  },
  {
    key: 'payment_proof',
    phase: 'M7',
    anchor: 'paiement-M7',
    bundles: bundles({
      M4: m4('closed'),
      M5: m5('closed'),
      M6: m6('closed'),
      M7: m7('open', { payment: payment('awaiting_proof') }),
    }),
  },
  {
    key: 'document_correction',
    phase: 'M5',
    anchor: 'corrections',
    bundles: bundles({
      M4: m4('closed'),
      M5: m5('open', {
        evaluations: [
          {
            id: 1,
            slot: 'a',
            label: 'Doc A',
            currentFileUrl: 'u/a',
            verdict: 'needs_correction',
            correctionDeadline: null,
          },
        ],
        completionRate: { total: 1, validated: 0 },
      }),
    }),
  },
  {
    key: 'certificate_collection',
    phase: 'M7',
    anchor: 'retrait',
    bundles: bundles({
      M4: m4('closed'),
      M5: m5('closed'),
      M6: m6('closed'),
      M7: m7('open', { certificate: { status: 'notified', notifiedAt: DAY, collectedAt: null } }),
    }),
  },
];

/** An enabled file input inside the anchored element. */
function expectFileInput(target: HTMLElement, label?: string) {
  const inputs = Array.from(target.querySelectorAll<HTMLInputElement>('input[type=file]')).filter(
    (input) => !input.disabled && (!label || input.getAttribute('aria-label') === label)
  );
  expect(inputs.length).toBeGreaterThan(0);
}

/** The exact control each key expects, inside its anchored element. */
const EXPECTED_CONTROL: Record<ApplicantActionKey, (target: HTMLElement) => Promise<void> | void> =
  {
    meeting_confirmation: (target) => {
      expect(
        within(target).getByRole('button', { name: 'Confirmer le rendez-vous' })
      ).toBeEnabled();
      expect(within(target).getByRole('button', { name: 'Proposer une autre date' })).toBeEnabled();
    },
    signed_meeting_report: (target) => {
      expect(
        within(target).getByRole('button', { name: 'Déposer le compte rendu signé' })
      ).toBeEnabled();
      expectFileInput(target, 'Fichier du compte rendu signé');
    },
    preliminary_declaration: (target) => {
      expectFileInput(target);
      expect(
        within(target).getByRole('button', { name: 'Soumettre ma déclaration' })
      ).toBeInTheDocument();
    },
    formal_letter: (target) => {
      expectFileInput(target);
      expect(
        within(target).getByRole('button', { name: 'Soumettre la lettre' })
      ).toBeInTheDocument();
    },
    formal_missing_documents: async (target) => {
      const join = within(target).getByRole('button', { name: 'Joindre' });
      expect(join).toBeEnabled();
      await userEvent.click(join);
      expectFileInput(target);
    },
    payment_proof: (target) => {
      expectFileInput(target);
      expect(
        within(target).getByRole('button', { name: 'Soumettre ma quittance' })
      ).toBeInTheDocument();
    },
    document_correction: (target) => {
      expectFileInput(target);
      expect(
        within(target).getByRole('button', { name: 'Soumettre la correction' })
      ).toBeInTheDocument();
    },
    // Physical collection: the block exists, there is nothing to submit.
    certificate_collection: (target) => {
      expect(target).toHaveTextContent('Certificat prêt au retrait');
    },
  };

describe('anchors: every action lands next to its control', () => {
  it.each(ANCHOR_CASES)('$key ($phase) -> #$anchor', async ({ key, phase, anchor, bundles: b }) => {
    renderDossier(b, [action(key, phase, anchor)]);
    const target = document.getElementById(anchor);
    expect(target).not.toBeNull();
    // The banner (top dossier action) and the phase summary (top phase action) both link to it.
    expect(
      screen.getAllByRole('link').filter((a) => a.getAttribute('href') === `#${anchor}`)
    ).toHaveLength(2);
    await EXPECTED_CONTROL[key](target!);
  });

  it('the anchored element scrolls itself into view when the hash matches on mount', () => {
    const original = Element.prototype.scrollIntoView;
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    try {
      window.location.hash = '#pieces';
      const pieces = ANCHOR_CASES.find((c) => c.anchor === 'pieces')!;
      renderDossier(pieces.bundles, [action('formal_missing_documents', 'M4', 'pieces')]);
      expect(scroll.mock.contexts.map((el) => (el as Element).id)).toContain('pieces');
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});

describe('GET /applicant/actions failing', () => {
  it('sections still render their controls, the banner falls back to passive wording', async () => {
    vi.spyOn(api, 'get').mockImplementation((url: string) =>
      url === '/applicant/actions'
        ? Promise.reject(new Error('boom'))
        : Promise.reject(new Error(`unexpected GET ${url}`))
    );
    const { queryClient } = renderDossier(
      bundles({ M4: m4('closed'), M5: m5('open', { payment: payment('awaiting_proof') }) })
    );
    await queryClient.resetQueries({ queryKey: queryKeys.requests.actions() });
    await waitFor(() =>
      expect(queryClient.getQueryState(queryKeys.requests.actions())?.status).toBe('error')
    );

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Situation du dossier');
    expect(banner).not.toHaveTextContent('Aucune action requise de votre part');
    expect(banner).toHaveTextContent('Facture disponible');
    expect(within(banner).queryByRole('link')).not.toBeInTheDocument();
    expect(
      document.getElementById('paiement-M5')?.querySelector('input[type=file]')
    ).not.toBeNull();
  });
});

describe('banner while GET /applicant/actions loads (no false « Aucune action requise »)', () => {
  const payable = bundles({
    M4: m4('closed'),
    M5: m5('open', { payment: payment('awaiting_proof') }),
  });

  function renderUnresolved() {
    let settle!: { resolve: (v: unknown) => void; reject: (e: unknown) => void };
    vi.spyOn(api, 'get').mockImplementation((url: string) =>
      url === '/applicant/actions'
        ? new Promise((resolve, reject) => {
            settle = { resolve, reject };
          })
        : Promise.reject(new Error(`unexpected GET ${url}`))
    );
    const { queryClient } = renderDossier(payable);
    // Back to a first load: no cached list, request in flight.
    void queryClient.resetQueries({ queryKey: queryKeys.requests.actions() });
    return { settle: () => settle, queryClient };
  }

  it('actions unresolved -> no banner at all, sections still render', async () => {
    const { queryClient } = renderUnresolved();
    await waitFor(() =>
      expect(queryClient.getQueryState(queryKeys.requests.actions())?.status).toBe('pending')
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('Aucune action requise de votre part')).not.toBeInTheDocument();
    expect(
      document.getElementById('paiement-M5')?.querySelector('input[type=file]')
    ).not.toBeNull();
  });

  it('actions rejected -> passive banner « Situation du dossier » (no « Aucune action » claim)', async () => {
    const { settle } = renderUnresolved();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    settle().reject(new Error('boom'));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Situation du dossier')
    );
    expect(within(screen.getByRole('status')).queryByRole('link')).not.toBeInTheDocument();
  });

  it('actions resolved -> action banner', async () => {
    const { settle } = renderUnresolved();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    settle().resolve({ data: [action('payment_proof', 'M5', 'paiement-M5')] });
    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('Action requise');
    expect(within(banner).getByRole('link', { name: 'Déposer la quittance' })).toHaveAttribute(
      'href',
      '#paiement-M5'
    );
  });
});

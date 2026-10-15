/** SESSION1-MEET-2 - where the applicant learns that a compte rendu waits for
 *  their signed copy: the M3 / M4 phase summary, the dossier banner and the
 *  dashboard. Everything is driven by the API's canSubmitSignedReport. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../../lib/axios';
import { notify } from '../../lib/notify';
import { queryKeys } from '../../lib/react-query/queryKeys';
import type { ApplicantMeeting, MeetingReportBlock } from '../../lib/api/meetings.api';
import type { FormalBundle, PreliminaryBundle } from '../../lib/api/requests.types';
import { renderWithProviders } from '../../test/render';
import { buildPreliminaryPresentation } from '../../pages/requests/components/PreliminaryPhaseSection';
import { buildFormalPresentation } from '../../pages/requests/components/FormalPhaseSection';
import {
  SIGNED_REPORT_DESCRIPTION,
  SIGNED_REPORT_TITLE,
  buildBanner,
  buildProgressItems,
  type PhaseSnapshot,
} from '../../pages/requests/progress';
import { ActionBanner } from '../request/ActionBanner';
import { ReportsToSignBanner } from './ReportsToSignBanner';
import { MeetingReportPanel } from './MeetingReportPanel';

const DAY = '2026-10-10T08:00:00.000Z';
const CONFIRMED = {
  confirmationStatus: 'confirmed' as const,
  confirmedAt: DAY,
  alternate: null,
  lastRefusal: null,
  actions: [] as [],
  ticketAvailable: false,
};
const report = (over: Partial<MeetingReportBlock> = {}): MeetingReportBlock => ({
  crDocumentUrl: '/api/files/101',
  crUploadedAt: DAY,
  signedCrDocumentUrl: null,
  signedCrUploadedAt: null,
  canSubmitSignedReport: true,
  ...over,
});

function preliminary(over: { phase?: string; report?: Partial<MeetingReportBlock>; declaration?: 'none' | 'pending' | 'done' } = {}) {
  const declaration = over.declaration ?? 'done';
  return {
    phase: { id: 3, status: over.phase ?? 'open' },
    meeting: { id: 9, scheduledAt: DAY, location: null, status: 'held', ...CONFIRMED, ...report(over.report) },
    evaluation:
      declaration === 'none'
        ? null
        : {
            templateFileUrl: '/api/files/5',
            madeAvailableAt: DAY,
            returnDeadline: DAY,
            submittedFileUrl: declaration === 'done' ? '/api/files/6' : null,
            submittedAt: declaration === 'done' ? DAY : null,
          },
  } satisfies PreliminaryBundle;
}

function formal(over: { phase?: string; report?: Partial<MeetingReportBlock>; completionRate?: number } = {}) {
  return {
    phase: { id: 4, status: over.phase ?? 'open' },
    letterCircuit: { id: 1, status: 'pending_review', fileUrl: '/api/files/7' },
    documents: [],
    meeting: { id: 12, scheduledAt: DAY, location: null, status: 'held', ...CONFIRMED, ...report(over.report) },
    completionRate: over.completionRate ?? 11,
  } satisfies FormalBundle;
}

describe('M3 phase summary (buildPreliminaryPresentation)', () => {
  it('a compte rendu to sign is the next action, with a link to the report panel', () => {
    const presentation = buildPreliminaryPresentation(preliminary());
    expect(presentation.title).toBe('Action requise — Compte rendu à signer');
    expect(presentation.description).toBe(
      'Le compte rendu de votre réunion est disponible. Consultez-le, signez-le puis déposez la version signée.',
    );
    expect(presentation.tone).toBe('warning');
    expect(presentation.action).toEqual({ label: 'Accéder au compte rendu', href: '#compte-rendu-9' });
  });

  it('outranks the passive wording, even once the phase is closed', () => {
    expect(buildPreliminaryPresentation(preliminary({ declaration: 'none' })).title).toBe(SIGNED_REPORT_TITLE);
    expect(buildPreliminaryPresentation(preliminary({ phase: 'closed' })).title).toBe(SIGNED_REPORT_TITLE);
  });

  it('the declaration to return (it blocks the closure) keeps precedence', () => {
    const presentation = buildPreliminaryPresentation(preliminary({ declaration: 'pending' }));
    expect(presentation.title).toBe('Action requise');
    expect(presentation.action).toBeUndefined();
  });

  it('after the upload (API flag false): back to the usual wording, no action', () => {
    const presentation = buildPreliminaryPresentation(
      preliminary({ report: { canSubmitSignedReport: false, signedCrDocumentUrl: '/api/files/102', signedCrUploadedAt: DAY } }),
    );
    expect(presentation.title).toBe('Formulaire transmis');
    expect(presentation.action).toBeUndefined();
  });
});

describe('M4 phase summary (buildFormalPresentation)', () => {
  it('a compte rendu to sign is the next action, with a link to the report panel', () => {
    const presentation = buildFormalPresentation(formal());
    expect(presentation.title).toBe(SIGNED_REPORT_TITLE);
    expect(presentation.description).toBe(SIGNED_REPORT_DESCRIPTION);
    expect(presentation.action).toEqual({ label: 'Accéder au compte rendu', href: '#compte-rendu-12' });
    expect(buildFormalPresentation(formal({ phase: 'closed' })).title).toBe(SIGNED_REPORT_TITLE);
  });

  it('missing pieces (an applicant action the DN waits for) keep precedence', () => {
    expect(buildFormalPresentation(formal({ completionRate: 9 })).title).toBe('Pièces à compléter');
  });

  it('after the upload: back to the usual wording', () => {
    const presentation = buildFormalPresentation(formal({ report: { canSubmitSignedReport: false } }));
    expect(presentation.title).toBe('Conditions remplies');
    expect(presentation.action).toBeUndefined();
  });
});

describe('dossier banner (buildBanner)', () => {
  const inProgress = { status: 'in_progress', circuitStatus: 'pending_review', rejectionReason: null };
  const snap = (over: Partial<PhaseSnapshot>): PhaseSnapshot => ({
    enabled: true,
    isLoading: false,
    loadFailed: false,
    phaseStatus: null,
    presentation: null,
    summary: null,
    ...over,
  });
  const m3Closed = snap({ phaseStatus: 'closed', presentation: buildPreliminaryPresentation(preliminary({ phase: 'closed' })), summary: 'r' });

  it('a closed M3 still waiting for its signed compte rendu outranks the open phase passive wording', () => {
    const items = buildProgressItems({
      M3: m3Closed,
      M4: snap({ phaseStatus: 'open', presentation: { title: 'Courrier en traitement', description: 'd', tone: 'info' } }),
      M5: snap({}),
      M6: snap({}),
      M7: snap({}),
    });
    const banner = buildBanner(inProgress, items)!;
    expect(banner.kind).toBe('action');
    expect(banner.title).toBe(SIGNED_REPORT_TITLE);
    expect(banner.action).toEqual({ label: 'Accéder au compte rendu', href: '#compte-rendu-9' });

    renderWithProviders(<ActionBanner banner={banner} />);
    expect(screen.getByRole('link', { name: 'Accéder au compte rendu' })).toHaveAttribute('href', '#compte-rendu-9');
  });

  it("the open phase's own action keeps precedence", () => {
    const items = buildProgressItems({
      M3: m3Closed,
      M4: snap({ phaseStatus: 'open', presentation: { title: 'Pièces à compléter', description: 'd', tone: 'warning' } }),
      M5: snap({}),
      M6: snap({}),
      M7: snap({}),
    });
    expect(buildBanner(inProgress, items)!.title).toBe('Pièces à compléter');
  });
});

describe('<ReportsToSignBanner> (dashboard)', () => {
  const mine = (over: Partial<ApplicantMeeting>): ApplicantMeeting => ({
    id: 9,
    meetingType: 'preliminary',
    status: 'held',
    scheduledAt: DAY,
    location: null,
    phaseCode: 'M3',
    requestId: 4,
    requestReference: 'DEM-2026-10-14-OMA-01',
    requestType: 'issuance',
    ...CONFIRMED,
    ...report(),
    ...over,
  });

  afterEach(() => vi.restoreAllMocks());

  it('nothing to sign: no banner', () => {
    renderWithProviders(<ReportsToSignBanner />, {
      seed: [[queryKeys.meetings.mine(), [mine({ canSubmitSignedReport: false })]]],
    });
    expect(screen.queryByRole('region', { name: 'Compte rendu à signer' })).not.toBeInTheDocument();
  });

  it('one compte rendu to sign: wording and a link to its report panel in the dossier', () => {
    renderWithProviders(<ReportsToSignBanner />, { seed: [[queryKeys.meetings.mine(), [mine({})]]] });
    const banner = screen.getByRole('region', { name: 'Compte rendu à signer' });
    expect(banner).toHaveTextContent('Un compte rendu de réunion est disponible et doit être retourné signé');
    expect(within(banner).getByRole('link', { name: 'Voir le dossier' })).toHaveAttribute('href', '/dossiers/4#compte-rendu-9');
  });

  it('several: a count and one link per meeting', () => {
    renderWithProviders(<ReportsToSignBanner />, {
      seed: [
        [
          queryKeys.meetings.mine(),
          [mine({}), mine({ id: 12, meetingType: 'formal', phaseCode: 'M4' }), mine({ id: 15, canSubmitSignedReport: false })],
        ],
      ],
    });
    const banner = screen.getByRole('region', { name: /Compte rendu à signer/ });
    expect(banner).toHaveTextContent('Compte rendu à signer (2)');
    expect(within(banner).getAllByRole('link', { name: 'Voir le dossier' }).map((a) => a.getAttribute('href'))).toEqual([
      '/dossiers/4#compte-rendu-9',
      '/dossiers/4#compte-rendu-12',
    ]);
  });

  it('after the signed upload, the refreshed list makes the banner disappear', async () => {
    vi.spyOn(notify, 'success').mockImplementation(() => undefined as never);
    vi.spyOn(notify, 'error').mockImplementation(() => undefined as never);
    const sent = mine({ canSubmitSignedReport: false, signedCrDocumentUrl: '/api/files/102', signedCrUploadedAt: DAY });
    vi.spyOn(api, 'post').mockImplementation((url: string) =>
      Promise.resolve({ data: url === '/uploads' ? { uploadAssetId: 55 } : {} }),
    );
    vi.spyOn(api, 'get').mockImplementation((url: string) =>
      url === '/meetings/mine' ? Promise.resolve({ data: [sent] }) : Promise.reject(new Error(`unexpected GET ${url}`)),
    );
    const pending = mine({});
    renderWithProviders(
      <>
        <ReportsToSignBanner />
        <MeetingReportPanel meeting={pending} />
      </>,
      { seed: [[queryKeys.meetings.mine(), [pending]]] },
    );
    expect(screen.getByRole('region', { name: 'Compte rendu à signer' })).toBeInTheDocument();
    await userEvent.upload(
      screen.getByLabelText('Fichier du compte rendu signé'),
      new File(['%PDF'], 'cr-signe.pdf', { type: 'application/pdf' }),
    );
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Compte rendu à signer' })).not.toBeInTheDocument());
  });
});

beforeEach(() => {
  window.location.hash = '';
});

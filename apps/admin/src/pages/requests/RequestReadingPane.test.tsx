import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { RequestCockpitItem } from '../../lib/api/requests.types';
import { renderWithProviders } from '../../test/render';
import { RequestReadingPane } from './RequestReadingPane';

const auth = vi.hoisted(() => ({ roles: ['dn_agent'] as string[] }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { roles: auth.roles } }) }));

const DN = { kind: 'staff', label: 'DN', roles: ['dn_agent', 'dn_supervisor', 'SU'] } as const;

const item = (over: Partial<RequestCockpitItem>): RequestCockpitItem =>
  ({
    id: 1,
    reference: 'DEM-RP-01',
    requestType: 'issuance',
    requestTypeLabel: 'Delivrance',
    status: 'in_progress',
    statusLabel: 'En cours',
    circuitStatus: 'completed',
    circuitStatusLabel: 'Circuit termine',
    dnAnnotationStatus: null,
    dnAnnotationDocumentUrl: null,
    createdAt: '2026-10-05T09:00:00.000Z',
    updatedAt: '2026-10-05T09:00:00.000Z',
    lastActivityAt: '2026-10-05T09:00:00.000Z',
    unread: false,
    organisationName: 'OMA Un',
    organisationEmail: null,
    organisationPhone: null,
    applicantName: 'Jean Test',
    applicantEmail: 'jean@test.ga',
    applicantPhone: null,
    currentPhaseCode: 'M4',
    currentPhaseLabel: 'Demande formelle',
    phases: [],
    documentSummary: { completed: 0, missing: 0, pending: 0, total: 0 },
    activity: [],
    nextActionLabel: 'Traiter Demande formelle',
    nextActionDescription: 'Desc',
    nextActionHref: '/demandes/1/phase-formelle',
    nextActionTone: 'info',
    nextActionState: 'action_required',
    nextActionOwner: DN,
    canStartPreliminary: false,
    ...over,
  }) as RequestCockpitItem;

function renderPane(it: RequestCockpitItem) {
  const ref = createRef<HTMLButtonElement>();
  renderWithProviders(<RequestReadingPane item={it} startButtonRef={ref} onActionError={() => undefined} />);
  return ref;
}

afterEach(() => {
  auth.roles = ['dn_agent'];
});

describe('RequestReadingPane callout', () => {
  it('intake waiting on Réception: DN sees whose turn it is, no Traiter, no grey chip', () => {
    renderPane(
      item({
        status: 'submitted',
        circuitStatus: 'submitted',
        nextActionLabel: 'Impression et mise en circuit DG',
        nextActionHref: null,
        nextActionOwner: { kind: 'staff', label: 'Réception', roles: ['assistant_dg', 'reception', 'SU'] },
      })
    );
    expect(screen.getByText('En attente de : Réception')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Traiter/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Consulter la phase' })).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('applicant-owned phase: no Traiter, a Consulter la phase link to the href', () => {
    renderPane(
      item({
        nextActionLabel: 'En attente du postulant',
        nextActionState: 'waiting',
        nextActionHref: '/demandes/1/evaluation',
        nextActionOwner: { kind: 'applicant', label: 'Postulant' },
      })
    );
    expect(screen.queryByRole('link', { name: /Traiter/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Consulter la phase' })).toHaveAttribute('href', '/demandes/1/evaluation');
  });

  it('DN-owned work: Traiter link inside the callout, no Consulter la phase', () => {
    renderPane(item({}));
    const callout = screen.getByRole('status');
    expect(within(callout).getByRole('link', { name: /Traiter/ })).toHaveAttribute('href', '/demandes/1/phase-formelle');
    expect(screen.queryByRole('link', { name: 'Consulter la phase' })).toBeNull();
  });

  it('canStartPreliminary: start button inside the callout, ref attached', () => {
    const ref = renderPane(
      item({
        status: 'pending_review',
        canStartPreliminary: true,
        nextActionLabel: 'Ouvrir la phase préliminaire',
        nextActionHref: '/demandes/1/phase-preliminaire',
      })
    );
    const btn = within(screen.getByRole('status')).getByRole('button', { name: /Ouvrir la phase préliminaire/ });
    expect(ref.current).toBe(btn);
  });

  it('canStartPreliminary without the owner roles: no start button, Consulter la phase link', () => {
    auth.roles = ['reception'];
    renderPane(
      item({
        status: 'pending_review',
        canStartPreliminary: true,
        nextActionLabel: 'Ouvrir la phase préliminaire',
        nextActionHref: '/demandes/1/phase-preliminaire',
      })
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('link', { name: 'Consulter la phase' })).toHaveAttribute(
      'href',
      '/demandes/1/phase-preliminaire'
    );
  });
});

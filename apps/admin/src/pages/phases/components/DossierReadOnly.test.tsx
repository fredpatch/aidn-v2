import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { api } from '../../../lib/axios';
import type { DossierState } from '../../../lib/api/phases.types';
import { queryClient as appQueryClient } from '../../../lib/react-query/queryClient';
import { queryKeys } from '../../../lib/react-query/queryKeys';
import { renderWithProviders } from '../../../test/render';
import { ClosedDossierBanner, DossierStateValue } from './DossierReadOnly';
import WorkflowCockpit from './WorkflowCockpit';
import CertificateFieldsCard from '../certificates/components/CertificateFieldsCard';
import LifecycleCard from '../certificates/components/LifecycleCard';
import type { CertificateView } from '../certificates/types';
import DocumentEvaluationsCard from '../deep-evaluation/components/DocumentEvaluationsCard';
import FormalMeetingCard from '../formal/components/FormalMeetingCard';
import DeclarationCard from '../preliminary/components/DeclarationCard';
import MeetingCard from '../preliminary/components/MeetingCard';
import PaymentCard from '../site-inspection/components/PaymentCard';
import SiteVisitCard from '../site-inspection/components/SiteVisitCard';
import VerdictCard from '../site-inspection/components/VerdictCard';

const AT = '2026-10-02T08:00:00.000Z';
const REASON = 'Paiement rejeté - dossier annulé : preuve non conforme.';
const rejected: DossierState = { status: 'rejected', closed: true, closedAt: AT, rejectionReason: REASON };
const open: DossierState = { status: 'in_progress', closed: false, closedAt: null, rejectionReason: null };

beforeEach(() => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: [] });
});
afterEach(() => vi.restoreAllMocks());

function renderIn(state: DossierState | null, ui: ReactElement) {
  return renderWithProviders(<DossierStateValue state={state}>{ui}</DossierStateValue>);
}

const noop = () => undefined;

describe('<ClosedDossierBanner> (K7b)', () => {
  it('rejected: date, reason, and documents still available', () => {
    renderIn(rejected, <ClosedDossierBanner />);
    const banner = screen.getByRole('status');
    expect(within(banner).getByText('Dossier rejeté le 02/10/2026 - consultation uniquement')).toBeInTheDocument();
    expect(within(banner).getByText(`Motif : ${REASON}`)).toBeInTheDocument();
    expect(within(banner).getByText(/restent consultables et téléchargeables/)).toBeInTheDocument();
  });

  it('cancelled: no reason line (a cancellation stores none)', () => {
    renderIn({ ...rejected, status: 'cancelled', rejectionReason: null }, <ClosedDossierBanner />);
    expect(screen.getByText('Dossier annulé le 02/10/2026 - consultation uniquement')).toBeInTheDocument();
    expect(screen.queryByText(/Motif/)).not.toBeInTheDocument();
  });

  it('completed: says the certificate was delivered', () => {
    renderIn({ ...rejected, status: 'completed', rejectionReason: null }, <ClosedDossierBanner />);
    expect(screen.getByText('Dossier terminé le 02/10/2026 - consultation uniquement')).toBeInTheDocument();
    expect(screen.getByText(/Le certificat a été délivré/)).toBeInTheDocument();
  });

  it('open dossier or unknown state: nothing', () => {
    renderIn(open, <ClosedDossierBanner />);
    renderIn(null, <ClosedDossierBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('<WorkflowCockpit> on a closed dossier (K7b)', () => {
  function renderCockpit(state: DossierState) {
    const start = vi.fn();
    renderWithProviders(
      <WorkflowCockpit
        requestId="9"
        currentCode="M6"
        title="Phase - Demonstration / Inspection"
        subtitle="Demande #9"
        phaseStatus="open"
        onBack={noop}
        checklistTitle="Checklist"
        checklist={[
          { label: 'Facture envoyee', done: true },
          { label: 'Paiement valide', done: false },
        ]}
        action={{
          title: 'Valider le paiement',
          description: 'S5 doit valider la preuve.',
          owner: 'S5',
          tone: 'warning',
          primaryAction: { label: 'Demarrer la phase', onClick: start },
        }}
        keyInfo={[
          { label: 'Responsable', value: 'S5' },
          { label: 'Paiement', value: 'En attente' },
        ]}
      >
        <p>contenu</p>
      </WorkflowCockpit>,
      {
        seed: [
          [queryKeys.phases.dossierState('9'), state],
          [
            queryKeys.phases.summary('9'),
            [
              { phaseCode: 'M3', status: 'closed', openedAt: AT, closedAt: AT },
              { phaseCode: 'M4', status: 'closed', openedAt: AT, closedAt: AT },
              { phaseCode: 'M5', status: 'closed', openedAt: AT, closedAt: AT },
              { phaseCode: 'M6', status: 'open', openedAt: AT, closedAt: null },
              { phaseCode: 'M7', status: 'not_started', openedAt: null, closedAt: null },
            ],
          ],
        ],
      }
    );
    return start;
  }

  it('banner, phase shown as interrupted, rail without any action', () => {
    renderCockpit(rejected);
    expect(screen.getByText('Dossier rejeté le 02/10/2026 - consultation uniquement')).toBeInTheDocument();
    const roadmap = screen.getByRole('list', { name: 'Progression du dossier' });
    expect(within(roadmap).getByText('Interrompue')).toBeInTheDocument();
    expect(within(roadmap).getByText('Non démarrée')).toBeInTheDocument();
    expect(within(roadmap).getAllByText('Terminée')).toHaveLength(3);
    expect(screen.getAllByText('Interrompue')).toHaveLength(2); // roadmap + header badge
    expect(screen.getByText('Dossier clos')).toBeInTheDocument();
    expect(screen.queryByText('Valider le paiement')).not.toBeInTheDocument();
    expect(screen.queryByText('Responsable: S5')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Demarrer la phase' })).not.toBeInTheDocument();
    expect(screen.getByText('contenu')).toBeInTheDocument();
    // no next-step highlight, no next-action owner
    expect(screen.getByText('Paiement valide').className).not.toContain('text-anac-blue');
    expect(screen.queryByText('Responsable')).not.toBeInTheDocument();
    expect(screen.getByText('En attente')).toBeInTheDocument();
  });

  it('open dossier: unchanged (next action and its button)', () => {
    renderCockpit(open);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Valider le paiement')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Demarrer la phase' })).toBeInTheDocument();
    expect(screen.getAllByText('En cours').length).toBeGreaterThan(0);
    expect(screen.getByText('Paiement valide').className).toContain('text-anac-blue');
    expect(screen.getByText('Responsable')).toBeInTheDocument();
  });
});

describe('phase cards on a closed dossier: documents stay, actions go (K7b)', () => {
  const payment = {
    id: 1,
    status: 'pending_validation',
    invoiceFileUrl: '/files/invoice.pdf',
    invoiceUploadedAt: AT,
    proofFileUrl: '/files/proof.pdf',
    proofUploadedAt: AT,
    validatedAt: null,
    rejectionReason: null,
    rejectionAction: null,
  };

  it('M6 payment awaiting a decision: no Valider / Rejeter, both documents viewable', () => {
    const card = (
      <PaymentCard requestId="9" phaseId={4} payment={payment} canManagePayment setActionError={noop} />
    );
    renderIn(rejected, card);
    expect(screen.queryByRole('button', { name: 'Valider le paiement' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rejeter' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'voir le fichier' })).toHaveLength(2);
    expect(screen.getByText('Preuve non traitée - dossier clos.')).toBeInTheDocument();
  });

  it('M6 payment, open dossier: S5 keeps its decision buttons', () => {
    renderIn(
      open,
      <PaymentCard requestId="9" phaseId={4} payment={payment} canManagePayment setActionError={noop} />
    );
    expect(screen.getByRole('button', { name: 'Valider le paiement' })).toBeInTheDocument();
  });

  it('M6 payment without invoice: no upload for S5', () => {
    renderIn(
      rejected,
      <PaymentCard
        requestId="9"
        phaseId={4}
        payment={{ ...payment, status: 'awaiting_invoice', invoiceFileUrl: null, proofFileUrl: null }}
        canManagePayment
        setActionError={noop}
      />
    );
    expect(screen.queryByRole('button', { name: 'Envoyer la facture' })).not.toBeInTheDocument();
    expect(screen.getByText('Aucune facture envoyée - dossier clos.')).toBeInTheDocument();
  });

  it('M6 site visit and R3 opinion: no scheduling, no "tenue", no opinion form', () => {
    renderIn(
      rejected,
      <>
        <SiteVisitCard
          phaseId={4}
          siteVisit={{ id: 3, r3AgentId: 5, scheduledAt: AT, location: 'Hangar', status: 'scheduled' }}
          requestId="9"
          invoiceSent
          canScheduleVisit
          canMarkHeld
          setActionError={noop}
        />
        <VerdictCard
          phaseId={4}
          siteVisit={{ id: 3, r3AgentId: 5, scheduledAt: AT, location: 'Hangar', status: 'held' }}
          inspection={null}
          paymentValidated
          requestId="9"
          setActionError={noop}
        />
      </>
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Aucun avis - dossier clos.')).toBeInTheDocument();
  });

  it('M6 site visit not planned yet: no "Planifier la visite"', () => {
    renderIn(
      rejected,
      <SiteVisitCard
        phaseId={4}
        siteVisit={null}
        requestId="9"
        invoiceSent
        canScheduleVisit
        canMarkHeld={false}
        setActionError={noop}
      />
    );
    expect(screen.queryByRole('button', { name: 'Planifier la visite' })).not.toBeInTheDocument();
    expect(screen.getByText('Aucune visite planifiée - dossier clos.')).toBeInTheDocument();
  });

  it('M3 / M4 meetings: status and report link only', () => {
    const meeting = {
      id: 7,
      scheduledAt: AT,
      location: 'Salle DN',
      status: 'held',
      crDocumentUrl: '/files/cr.pdf',
      crUploadedAt: AT,
    };
    renderIn(
      rejected,
      <>
        <MeetingCard phaseId={2} meeting={meeting} dnAgentId={1} requestId="9" setActionError={noop} />
        <FormalMeetingCard
          phaseId={3}
          meeting={{ ...meeting, id: 8, status: 'scheduled', crDocumentUrl: null, crUploadedAt: null }}
          dnAgentId={1}
          requestId="9"
          letterReturned
          canManage
          setActionError={noop}
        />
      </>
    );
    for (const name of ['Tenue', 'Absence', 'Reprogrammer', 'Annuler le dossier', 'remplacer']) {
      expect(screen.queryByRole('button', { name: new RegExp(name) })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: 'Voir le ticket' })).not.toBeInTheDocument();
    // the report link survives (DocumentPreviewLink renders a button)
    expect(screen.getAllByRole('button', { name: 'voir le fichier' })).toHaveLength(1);
    expect(screen.getAllByText('Aucune action - dossier clos.')).toHaveLength(2);
  });

  it('M4 meeting not planned: no "Planifier"', () => {
    renderIn(
      rejected,
      <FormalMeetingCard
        phaseId={3}
        meeting={null}
        dnAgentId={1}
        requestId="9"
        letterReturned
        canManage
        setActionError={noop}
      />
    );
    expect(screen.queryByRole('button', { name: /Planifier/ })).not.toBeInTheDocument();
    expect(screen.getByText('Aucune réunion planifiée - dossier clos.')).toBeInTheDocument();
  });

  it('M3 declaration not made available: no action', () => {
    renderIn(
      rejected,
      <DeclarationCard
        phaseId={2}
        evaluation={null}
        circuit={null}
        meetingHeld
        requestId="9"
        setActionError={noop}
      />
    );
    expect(screen.queryByRole('button', { name: 'Rendre disponible au postulant' })).not.toBeInTheDocument();
  });

  it('M5 document evaluation: preview stays, "Evaluer" goes', () => {
    renderIn(
      rejected,
      <DocumentEvaluationsCard
        requestId="9"
        evaluations={[
          {
            id: 11,
            formalRequestDocumentId: 1,
            slot: 'mme',
            label: 'Manuel MME',
            currentFileUrl: '/files/mme.pdf',
            verdict: null,
            evaluatedAt: null,
            correctionDeadline: null,
            resubmittedFileUrl: null,
            resubmittedAt: null,
          },
        ]}
        completionRate={{ total: 1, validated: 0, pending: 1, needsAction: 0 }}
        canEvaluateDocuments
        setActionError={noop}
      />
    );
    expect(screen.getByRole('button', { name: /Previsualiser le document/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Evaluer' })).not.toBeInTheDocument();
  });

  const certificate: CertificateView = {
    id: 5,
    reference: 'CERT-2026-001',
    certificateType: 'agreement',
    typeOverriddenBy: null,
    status: 'signed',
    createdAt: AT,
    printedAt: AT,
    signedAt: AT,
    signedFileUrl: '/files/signed.pdf',
    currentDocumentUrl: '/files/cert.pdf',
    archivedAt: null,
    notifiedAt: null,
    collectedAt: null,
    approvalReferenceNumber: 'GA.5.3-01',
    expiresAt: null,
    initialIssueDate: null,
    currentIssueDate: null,
    dgFullNameOverride: null,
    scopeDetails: null,
    daysToDeliver: null,
    daysToCollect: null,
  };

  it('M7 lifecycle: signed copy viewable, no archiving', () => {
    renderIn(
      rejected,
      <LifecycleCard requestId="9" certificate={certificate} paymentValidated setActionError={noop} />
    );
    expect(screen.getByRole('button', { name: 'Consulter le certificat signé retourné' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marquer comme archive' })).not.toBeInTheDocument();
    expect(screen.getByText('Aucune action - dossier clos.')).toBeInTheDocument();
  });

  it('M7 certificate in preparation: fields locked, no save', () => {
    renderIn(
      rejected,
      <CertificateFieldsCard
        requestId="9"
        certificate={{ ...certificate, status: 'in_preparation' }}
        setActionError={noop}
      />
    );
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument();
    for (const input of screen.getAllByRole('textbox')) expect(input).toBeDisabled();
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByText('Ces champs ne sont plus modifiables - dossier clos.')).toBeInTheDocument();
  });
});

describe('queryClient: an action refused with DOSSIER_CLOSED reloads the dossier state (K7b)', () => {
  function apiError(code: string, status: number) {
    return new AxiosError('refused', 'ERR_BAD_REQUEST', undefined, undefined, {
      status,
      statusText: '',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: { message: 'refused', code },
    });
  }

  async function runFailingMutation(error: unknown) {
    const mutation = appQueryClient.getMutationCache().build(appQueryClient, {
      mutationFn: () => Promise.reject(error),
    });
    await mutation.execute(undefined).catch(() => undefined);
  }

  it('DOSSIER_CLOSED: invalidates every dossier-state query', async () => {
    const invalidate = vi.spyOn(appQueryClient, 'invalidateQueries').mockResolvedValue();
    await runFailingMutation(apiError('DOSSIER_CLOSED', 409));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['phases', 'dossier-state'] });
  });

  it('any other error: nothing', async () => {
    const invalidate = vi.spyOn(appQueryClient, 'invalidateQueries').mockResolvedValue();
    await runFailingMutation(apiError('PAYMENT_NOT_PENDING', 409));
    await runFailingMutation(new Error('network'));
    expect(invalidate).not.toHaveBeenCalled();
  });
});

import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../../lib/axios';
import { renderWithProviders } from '../../test/render';
import DeepEvaluationPaymentCard from '../../pages/phases/deep-evaluation/components/PaymentCard';
import SiteInspectionPaymentCard from '../../pages/phases/site-inspection/components/PaymentCard';
import CertificatesPaymentCard from '../../pages/phases/certificates/components/PaymentCard';

// K3 - the three phase payment cards share PaymentRejectionForm: each must ask
// for a second confirmation before a payment rejection cancels the dossier.

const PHASE_ID = 40;
const AT = '2026-10-07T08:00:00.000Z';
const REASON = "Quittance falsifiée : la référence bancaire n'existe pas.";
const pending = {
  id: 7,
  status: 'pending_validation',
  invoiceFileUrl: '/files/invoice.pdf',
  invoiceUploadedAt: AT,
  proofFileUrl: '/files/proof.pdf',
  proofUploadedAt: AT,
  validatedAt: null,
  rejectionReason: null,
  rejectionAction: null,
};

type CardProps = {
  requestId: string | undefined;
  phaseId: number | undefined;
  payment: typeof pending | null;
  canManagePayment: boolean;
  setActionError: (message: string | null) => void;
};

const CARDS: Array<[string, ComponentType<CardProps>, string, string]> = [
  ['M5', DeepEvaluationPaymentCard, "Paiement - Frais d'etude de dossier", '/deep-evaluation'],
  ['M6', SiteInspectionPaymentCard, 'Paiement - Frais de démonstration/inspection', '/site-inspection'],
  ['M7', CertificatesPaymentCard, 'Paiement - Frais de délivrance', '/certificates'],
];

describe.each(CARDS)('%s payment card - final rejection of the dossier', (_code, Card, label, prefix) => {
  const rejectUrl = `${prefix}/phases/${PHASE_ID}/payment/reject`;

  function setup() {
    const setActionError = vi.fn();
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    renderWithProviders(
      <Card requestId="9" phaseId={PHASE_ID} payment={pending} canManagePayment setActionError={setActionError} />,
    );
    return { user: userEvent.setup(), post, setActionError };
  }

  async function openConfirmation(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Rejeter' }));
    await user.selectOptions(screen.getByLabelText('Action'), 'reject_dossier');
    await user.type(screen.getByLabelText('Motif'), REASON);
    await user.click(screen.getByRole('button', { name: 'Rejeter le dossier…' }));
    return screen.getByRole('dialog', { name: 'Rejeter définitivement le dossier ?' });
  }

  it('asks first, sends nothing, and starts on Retour', async () => {
    const { user, post } = setup();
    const dialog = await openConfirmation(user);
    expect(post).not.toHaveBeenCalled();
    expect(within(dialog).getByText(label)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Retour' })).toHaveFocus();
  });

  it('shows the exact reason the applicant will read', async () => {
    const { user } = setup();
    const dialog = await openConfirmation(user);
    expect(within(dialog).getByText(`Paiement rejeté - dossier annulé : ${REASON}`)).toBeInTheDocument();
    expect(within(dialog).getByText(/ne peut pas être annulée/)).toBeInTheDocument();
  });

  it('rejects the dossier only on the second confirmation, in one call', async () => {
    const { user, post } = setup();
    const dialog = await openConfirmation(user);
    await user.click(within(dialog).getByRole('button', { name: 'Rejeter le dossier' }));

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(rejectUrl, { rejectionAction: 'reject_dossier', rejectionReason: REASON });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Motif')).not.toBeInTheDocument();
  });

  it.each([
    ['Retour', (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) =>
      user.click(within(dialog).getByRole('button', { name: 'Retour' }))],
    ['Escape', (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
  ])('%s cancels: nothing sent, the form keeps its choice and reason', async (_how, cancel) => {
    const { user, post } = setup();
    const dialog = await openConfirmation(user);
    await cancel(user, dialog);

    expect(post).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Action')).toHaveValue('reject_dossier');
    expect(screen.getByLabelText('Motif')).toHaveValue(REASON);
    expect(screen.getByRole('button', { name: 'Rejeter le dossier…' })).toHaveFocus();
  });

  it('on an API refusal, closes the confirmation and keeps the form for another try', async () => {
    const { user, post, setActionError } = setup();
    post.mockRejectedValueOnce(new Error('network'));
    const dialog = await openConfirmation(user);
    await user.click(within(dialog).getByRole('button', { name: 'Rejeter le dossier' }));

    expect(setActionError).toHaveBeenLastCalledWith('Impossible de rejeter le paiement.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Motif')).toHaveValue(REASON);
  });

  it('while the rejection is being sent: no second click, Escape does not close', async () => {
    const { user, post } = setup();
    let release!: () => void;
    post.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({ data: {} }); }));
    const dialog = await openConfirmation(user);
    await user.click(within(dialog).getByRole('button', { name: 'Rejeter le dossier' }));

    expect(within(dialog).getByRole('button', { name: 'Rejet...' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Retour' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('a blank reason is refused before any confirmation', async () => {
    const { user, setActionError } = setup();
    await user.click(screen.getByRole('button', { name: 'Rejeter' }));
    await user.selectOptions(screen.getByLabelText('Action'), 'reject_dossier');
    await user.click(screen.getByRole('button', { name: 'Rejeter le dossier…' }));
    expect(setActionError).toHaveBeenCalledWith('Un motif de rejet est requis.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asking for a new proof stays a single Confirmer click', async () => {
    const { user, post } = setup();
    await user.click(screen.getByRole('button', { name: 'Rejeter' }));
    await user.type(screen.getByLabelText('Motif'), 'Illisible');
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledWith(rejectUrl, { rejectionAction: 'request_new_proof', rejectionReason: 'Illisible' });
  });
});

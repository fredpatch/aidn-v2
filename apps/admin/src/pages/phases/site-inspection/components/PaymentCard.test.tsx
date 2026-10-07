import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../../../../lib/axios';
import { renderWithProviders } from '../../../../test/render';
import type { PaymentView } from '../types';
import PaymentCard from './PaymentCard';

const PHASE_ID = 40;
const AT = '2026-10-07T08:00:00.000Z';
const payment = (over: Partial<PaymentView> = {}): PaymentView => ({
  id: 7,
  status: 'pending_validation',
  invoiceFileUrl: '/files/invoice.pdf',
  invoiceUploadedAt: AT,
  proofFileUrl: '/files/proof.pdf',
  proofUploadedAt: AT,
  validatedAt: null,
  rejectionReason: null,
  rejectionAction: null,
  ...over,
});

function setup({ value = payment(), canManagePayment = true }: { value?: PaymentView | null; canManagePayment?: boolean } = {}) {
  const setActionError = vi.fn();
  const post = vi.spyOn(api, 'post').mockImplementation(async (url: string) =>
    url === '/uploads' ? { data: { uploadAssetId: 77 } } : { data: {} },
  );
  renderWithProviders(
    <PaymentCard
      requestId="9"
      phaseId={PHASE_ID}
      payment={value}
      canManagePayment={canManagePayment}
      setActionError={setActionError}
    />,
  );
  return { user: userEvent.setup(), post, setActionError };
}

const button = (name: string) => screen.getByRole('button', { name });
const REJECT_URL = `/site-inspection/phases/${PHASE_ID}/payment/reject`;

describe('<PaymentCard> M6 - validation', () => {
  it('validates the proof in one call', async () => {
    const { user, post } = setup();
    await user.click(button('Valider le paiement'));
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(`/site-inspection/phases/${PHASE_ID}/payment/validate`);
  });

  it('offers no decision without the payment role', () => {
    setup({ canManagePayment: false });
    expect(screen.queryByRole('button', { name: 'Valider le paiement' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rejeter' })).not.toBeInTheDocument();
  });

  it.each(['awaiting_proof', 'validated'])('offers no decision when the payment is %s', (status) => {
    setup({ value: payment({ status }) });
    expect(screen.queryByRole('button', { name: 'Valider le paiement' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rejeter' })).not.toBeInTheDocument();
  });
});

describe('<PaymentCard> M6 - rejection', () => {
  it('requires a reason and sends nothing without it', async () => {
    const { user, post, setActionError } = setup();
    await user.click(button('Rejeter'));
    await user.type(screen.getByRole('textbox'), '   ');
    await user.click(button('Confirmer'));
    expect(setActionError).toHaveBeenCalledWith('Un motif de rejet est requis.');
    expect(post).not.toHaveBeenCalled();
  });

  it('defaults to asking for a new proof', async () => {
    const { user, post } = setup();
    await user.click(button('Rejeter'));
    expect(screen.getByRole('combobox')).toHaveValue('request_new_proof');
    await user.type(screen.getByRole('textbox'), 'Quittance illisible');
    await user.click(button('Confirmer'));

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(REJECT_URL, {
      rejectionAction: 'request_new_proof',
      rejectionReason: 'Quittance illisible',
    });
    // Back to the decision buttons once done.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('final rejection of the dossier goes through a second confirmation (K3)', async () => {
    const { user, post } = setup();
    await user.click(button('Rejeter'));
    await user.selectOptions(screen.getByRole('combobox'), 'reject_dossier');
    await user.type(screen.getByRole('textbox'), 'Paiement frauduleux');
    await user.click(button('Rejeter le dossier…'));
    expect(post).not.toHaveBeenCalled();

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Rejeter le dossier' }));
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(REJECT_URL, {
      rejectionAction: 'reject_dossier',
      rejectionReason: 'Paiement frauduleux',
    });
  });

  it('Annuler leaves the payment untouched', async () => {
    const { user, post } = setup();
    await user.click(button('Rejeter'));
    await user.type(screen.getByRole('textbox'), 'Brouillon');
    await user.click(button('Annuler'));
    expect(post).not.toHaveBeenCalled();
    expect(button('Valider le paiement')).toBeInTheDocument();
    // The reason typed before cancelling is not kept.
    await user.click(button('Rejeter'));
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('shows the previous rejection reason while waiting for a new proof', () => {
    setup({ value: payment({ status: 'awaiting_proof', rejectionReason: 'Montant incorrect' }) });
    expect(screen.getByText('Preuve rejetée : Montant incorrect')).toBeInTheDocument();
  });
});

describe('<PaymentCard> M6 - invoice', () => {
  it('uploads the file then attaches it to the phase', async () => {
    const { user, post } = setup({ value: null });
    const file = new File(['%PDF'], 'facture.pdf', { type: 'application/pdf' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(button('Envoyer la facture')).toBeDisabled();
    await user.upload(input, file);
    await user.click(button('Envoyer la facture'));

    expect(post).toHaveBeenNthCalledWith(1, '/uploads', expect.any(FormData), expect.anything());
    expect(post).toHaveBeenNthCalledWith(2, `/site-inspection/phases/${PHASE_ID}/invoice`, { uploadAssetId: 77 });
  });

  it('only the payment role can send the invoice', () => {
    setup({ value: null, canManagePayment: false });
    expect(screen.queryByRole('button', { name: 'Envoyer la facture' })).not.toBeInTheDocument();
    expect(screen.getByText("En attente de l'envoi par le service S5.")).toBeInTheDocument();
  });
});

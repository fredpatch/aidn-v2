import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentBlock } from './PaymentBlock';
import type { PaymentInfo } from '../../lib/api/requests.types';

const payment = (id: number): PaymentInfo => ({
  id, status: 'awaiting_proof', invoiceFileUrl: 'u/invoice', proofFileUrl: null, rejectionReason: null,
});
const pdf = () => new File(['%PDF'], 'quittance.pdf', { type: 'application/pdf' });

function block(p: PaymentInfo) {
  return <PaymentBlock payment={p} waitingInvoiceText="Facture en préparation." onSubmitProof={vi.fn()} />;
}

describe('<PaymentBlock>', () => {
  it('a file picked for one payment is dropped when a new payment replaces it', async () => {
    const { rerender } = render(block(payment(1)));
    await userEvent.upload(document.querySelector('input[type=file]') as HTMLInputElement, pdf());
    expect(screen.getByText('quittance.pdf')).toBeInTheDocument();

    rerender(block(payment(1)));
    expect(screen.getByText('quittance.pdf')).toBeInTheDocument(); // same payment: kept

    rerender(block(payment(2)));
    expect(screen.queryByText('quittance.pdf')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Soumettre ma quittance' })).toBeDisabled();
  });
});

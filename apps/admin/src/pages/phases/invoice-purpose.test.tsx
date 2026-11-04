/** FINANCE-LABELS-1 - the M5 / M6 / M7 payment cards (also the Finance
 *  compact pages) name the invoice from the dossier identity, with the
 *  shared catalog's wording; the payment actions are unchanged. */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import type { DossierState } from '../../lib/api/phases.types';
import { queryKeys } from '../../lib/react-query/queryKeys';
import { renderWithProviders } from '../../test/render';
import DeepEvaluationPaymentCard from './deep-evaluation/components/PaymentCard';
import SiteInspectionPaymentCard from './site-inspection/components/PaymentCard';
import CertificatesPaymentCard from './certificates/components/PaymentCard';

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { roles: ['s5_agent'] } }) }));

const dossier = (requestType: string): DossierState => ({
  status: 'in_progress',
  closed: false,
  closedAt: null,
  rejectionReason: null,
  identity: { reference: 'DEM-1', organisationName: 'OMA 1', applicantName: 'Jean', statusLabel: 'En cours', requestType },
});

const awaitingInvoice = {
  id: 1,
  status: 'awaiting_invoice',
  invoiceFileUrl: null,
  invoiceUploadedAt: null,
  proofFileUrl: null,
  proofUploadedAt: null,
  validatedAt: null,
  rejectionReason: null,
  rejectionAction: null,
};

// The three cards share these props; their payment views are structurally alike.
type CardProps = {
  requestId: string;
  phaseId: number;
  payment: typeof awaitingInvoice;
  canManagePayment: boolean;
  setActionError: () => void;
};
const CARDS: Record<'M5' | 'M6' | 'M7', ComponentType<CardProps>> = {
  M5: DeepEvaluationPaymentCard as unknown as ComponentType<CardProps>,
  M6: SiteInspectionPaymentCard as unknown as ComponentType<CardProps>,
  M7: CertificatesPaymentCard as unknown as ComponentType<CardProps>,
};

function renderCard(code: 'M5' | 'M6' | 'M7', state: DossierState) {
  const Card = CARDS[code];
  return renderWithProviders(
    <Card requestId="42" phaseId={7} payment={awaitingInvoice} canManagePayment setActionError={() => undefined} />,
    { seed: [[queryKeys.phases.dossierState('42'), state]] }
  );
}

describe('payment cards: « Objet de la facture »', () => {
  const cases: Array<['M5' | 'M6' | 'M7', string, string]> = [
    ['M5', 'recognition', 'Frais d’étude de Reconnaissance d’agrément'],
    ['M5', 'issuance', 'Frais d’étude de Certification d’un OMA'],
    ['M5', 'modification', 'Frais d’étude de Modification d’un agrément OMA'],
    ['M5', 'renewal', 'Frais d’étude de Renouvellement d’un agrément OMA'],
    ['M6', 'issuance', 'Frais d’audit - Certification d’un OMA'],
    ['M7', 'recognition', 'Frais de délivrance - Reconnaissance d’agrément'],
  ];
  for (const [code, requestType, label] of cases) {
    it(`${code} / ${requestType}: ${label}, invoice upload still offered`, () => {
      const { unmount } = renderCard(code, dossier(requestType));
      expect(screen.getByText('Objet de la facture')).toBeInTheDocument();
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Envoyer la facture/ })).toBeInTheDocument();
      expect(document.body.textContent).not.toContain(requestType);
      unmount();
    });
  }

  it('unknown historical request type: the neutral label, never the raw value', () => {
    renderCard('M5', dossier('legacy_type'));
    expect(screen.getByText('Frais liés au dossier OMA')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('legacy_type');
  });

  it('no dossier identity (not loaded): no purpose block, the card still renders', () => {
    renderCard('M6', { ...dossier('issuance'), identity: null });
    expect(screen.queryByText('Objet de la facture')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Envoyer la facture/ })).toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { api } from '../../../../lib/axios';
import { renderWithProviders } from '../../../../test/render';
import type { InspectionView, SiteVisitView } from '../types';
import VerdictCard from './VerdictCard';

const PHASE_ID = 40;
const AT = '2026-10-07T08:00:00.000Z';
const heldVisit: SiteVisitView = { id: 3, r3AgentId: 5, scheduledAt: AT, location: 'Hangar', status: 'held' };

function setup(over: {
  siteVisit?: SiteVisitView | null;
  inspection?: InspectionView | null;
  paymentValidated?: boolean;
} = {}) {
  const setActionError = vi.fn();
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
  renderWithProviders(
    <VerdictCard
      phaseId={PHASE_ID}
      siteVisit={over.siteVisit === undefined ? heldVisit : over.siteVisit}
      inspection={over.inspection ?? null}
      paymentValidated={over.paymentValidated ?? true}
      requestId="9"
      setActionError={setActionError}
    />,
  );
  return { user: userEvent.setup(), post, setActionError };
}

const submitButton = () => screen.getByRole('button', { name: "Soumettre l'avis et clôturer la phase" });

describe('<VerdictCard> M6 - preconditions', () => {
  it.each([
    ['payment not validated', { paymentValidated: false }, 'Le paiement doit être validé avant de soumettre un avis.'],
    ['no site visit', { siteVisit: null }, "La visite sur site doit d'abord être planifiée."],
    [
      'visit not held yet',
      { siteVisit: { ...heldVisit, status: 'scheduled' } },
      "La visite sur site doit être marquée 'tenue' avant de soumettre un avis.",
    ],
  ])('%s: explains why and shows no form', (_label, over, reason) => {
    setup(over);
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('the payment check comes first', () => {
    setup({ paymentValidated: false, siteVisit: null });
    expect(screen.getByText('Le paiement doit être validé avant de soumettre un avis.')).toBeInTheDocument();
  });
});

describe('<VerdictCard> M6 - submission', () => {
  it('sends verdict and trimmed note in one call, then clears the form', async () => {
    const { user, post, setActionError } = setup();
    await user.selectOptions(screen.getByRole('combobox'), 'compliant_with_reserves');
    await user.type(screen.getByRole('textbox'), '  Réserves mineures sur le hangar  ');
    await user.click(submitButton());

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(`/site-inspection/phases/${PHASE_ID}/verdict`, {
      verdict: 'compliant_with_reserves',
      note: 'Réserves mineures sur le hangar',
    });
    expect(setActionError).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('offers exactly the three verdicts', () => {
    setup();
    const values = Array.from(screen.getByRole('combobox').querySelectorAll('option')).map((o) => o.value);
    expect(values).toEqual(['', 'compliant', 'compliant_with_reserves', 'non_compliant']);
  });

  it('sends nothing without a verdict', async () => {
    const { user, post } = setup();
    await user.type(screen.getByRole('textbox'), 'Note sans verdict');
    await user.click(submitButton());
    expect(post).not.toHaveBeenCalled();
  });

  it('refuses a note made only of spaces', async () => {
    const { user, post, setActionError } = setup();
    await user.selectOptions(screen.getByRole('combobox'), 'non_compliant');
    await user.type(screen.getByRole('textbox'), '   ');
    await user.click(submitButton());

    expect(post).not.toHaveBeenCalled();
    expect(setActionError).toHaveBeenCalledWith(
      'La note est requise - elle fait partie de la même soumission que le verdict.',
    );
  });

  it('shows the server message and keeps the input when the API refuses', async () => {
    const { user, post, setActionError } = setup();
    post.mockRejectedValueOnce(
      new AxiosError('409', 'ERR', undefined, undefined, {
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { message: 'Un avis a déjà été soumis.' },
      }),
    );
    await user.selectOptions(screen.getByRole('combobox'), 'compliant');
    await user.type(screen.getByRole('textbox'), 'RAS');
    await user.click(submitButton());

    expect(setActionError).toHaveBeenLastCalledWith('Un avis a déjà été soumis.');
    expect(screen.getByRole('combobox')).toHaveValue('compliant');
    expect(screen.getByRole('textbox')).toHaveValue('RAS');
  });
});

describe('<VerdictCard> M6 - verdict already given', () => {
  it('is read-only and states the phase closed itself', () => {
    setup({
      inspection: { id: 1, r3AgentId: 5, verdict: 'non_compliant', note: 'Atelier non conforme.', submittedAt: AT },
    });
    expect(screen.getByText('Atelier non conforme.')).toBeInTheDocument();
    expect(screen.getByText('Phase clôturée automatiquement à la soumission de cet avis.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

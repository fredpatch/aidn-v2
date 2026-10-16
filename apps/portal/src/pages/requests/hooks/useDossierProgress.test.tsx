/** SESSION1-UX-1 final review (minor 3) - after an actions load error the
 *  passive banner never claims « Aucune action requise de votre part ». */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { api } from '../../../lib/axios';
import type { RequestView } from '../../../lib/api/requests.types';
import { queryKeys } from '../../../lib/react-query/queryKeys';
import { renderWithProviders } from '../../../test/render';
import { useDossierProgress } from './useDossierProgress';

// Intake: no phase query is enabled, only the actions query runs.
const request = { id: 42, status: 'submitted', circuitStatus: 'submitted', rejectionReason: null } as unknown as RequestView;

function Probe() {
  const { banner } = useDossierProgress(request);
  return <p data-testid="eyebrow">{banner?.eyebrow ?? 'none'}</p>;
}

afterEach(() => vi.restoreAllMocks());

describe('useDossierProgress banner eyebrow', () => {
  it('actions loaded and empty -> « Aucune action requise de votre part »', () => {
    renderWithProviders(<Probe />);
    expect(screen.getByTestId('eyebrow')).toHaveTextContent('Aucune action requise de votre part');
  });

  it('actions rejected -> « Situation du dossier », never a "no action" claim', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('boom'));
    const { queryClient } = renderWithProviders(<Probe />);
    await queryClient.resetQueries({ queryKey: queryKeys.requests.actions() });
    expect(await screen.findByText('Situation du dossier')).toBeInTheDocument();
    expect(screen.queryByText('Aucune action requise de votre part')).toBeNull();
  });
});

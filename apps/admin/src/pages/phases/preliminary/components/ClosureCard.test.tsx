import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../../../../lib/axios';
import { renderWithProviders } from '../../../../test/render';
import ClosureCard from './ClosureCard';

// M3 closure, through the shared PhaseClosureForm (also used by M4 and M5).
const PHASE_ID = 12;

function setup() {
  const setActionError = vi.fn();
  const post = vi.spyOn(api, 'post').mockImplementation(async (url: string) =>
    url === '/uploads' ? { data: { uploadAssetId: 77 } } : { data: {} },
  );
  renderWithProviders(<ClosureCard phaseId={PHASE_ID} requestId="9" setActionError={setActionError} />);
  return { user: userEvent.setup(), post, setActionError };
}

const closeButton = () => screen.getByRole('button', { name: 'Clôturer la phase' });

describe('<ClosureCard> M3 - phase closure', () => {
  it('closes directly: note and document are both optional', async () => {
    const { user, post } = setup();
    await user.click(closeButton());
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(`/phases/${PHASE_ID}/close`, {
      closureDocumentUploadAssetId: undefined,
      closureNote: undefined,
    });
  });

  it('uploads the document first, then closes with its id and the note, then clears the form', async () => {
    const { user, post } = setup();
    await user.type(screen.getByRole('textbox'), 'Réunion tenue, dossier complet');
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(['%PDF'], 'pv.pdf', { type: 'application/pdf' }),
    );
    await user.click(closeButton());

    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenNthCalledWith(1, '/uploads', expect.any(FormData), expect.anything());
    expect(post).toHaveBeenNthCalledWith(2, `/phases/${PHASE_ID}/close`, {
      closureDocumentUploadAssetId: 77,
      closureNote: 'Réunion tenue, dossier complet',
    });
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('does not close when the document upload fails, and keeps the note', async () => {
    const { user, post, setActionError } = setup();
    post.mockRejectedValueOnce(new Error('network'));
    await user.type(screen.getByRole('textbox'), 'Note à garder');
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(['%PDF'], 'pv.pdf', { type: 'application/pdf' }),
    );
    await user.click(closeButton());

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalledWith(`/phases/${PHASE_ID}/close`, expect.anything());
    expect(setActionError).toHaveBeenLastCalledWith('Impossible de clôturer la phase.');
    expect(screen.getByRole('textbox')).toHaveValue('Note à garder');
  });

  it('cannot be submitted twice while the closure is in flight', async () => {
    const { user, post } = setup();
    let release!: () => void;
    post.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({ data: {} }); }));
    await user.click(closeButton());

    const busy = screen.getByRole('button', { name: 'Clôture...' });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(post).toHaveBeenCalledTimes(1);
    release();
    expect(await screen.findByRole('button', { name: 'Clôturer la phase' })).toBeEnabled();
  });
});

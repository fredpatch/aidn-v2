import { useState, type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RejectModal } from './S5PaymentsPage';

// K3 - Paiements S5: a final rejection of the dossier takes a second step
// inside the same modal.

type Props = ComponentProps<typeof RejectModal>;
const REFERENCE = 'DEM-2026-09-14-OMAX-01';
const REASON = 'Quittance falsifiée';

/** The row button that opens the modal, like the S5 table. */
function Harness({ onSubmit, onClose }: { onSubmit: Props['onSubmit']; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  // Like the page: busy from the moment the rejection is sent.
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Rejeter la preuve
      </button>
      {open ? (
        <RejectModal
          item={{ requestReference: REFERENCE } as Props['item']}
          busy={busy}
          onSubmit={(params) => {
            onSubmit(params);
            setBusy(true);
          }}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

async function setup() {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<Harness onSubmit={onSubmit} onClose={onClose} />);
  await user.click(screen.getByRole('button', { name: 'Rejeter la preuve' }));
  return { user, onSubmit, onClose };
}

async function fillFinalRejection(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText('Action apres rejet'), 'reject_dossier');
  await user.type(screen.getByLabelText('Motif'), REASON);
}

describe('<RejectModal> S5 - final rejection of the dossier', () => {
  it('Continuer… opens the confirmation step without sending anything', async () => {
    const { user, onSubmit } = await setup();
    await fillFinalRejection(user);
    await user.click(screen.getByRole('button', { name: 'Continuer…' }));

    const dialog = screen.getByRole('dialog', { name: 'Rejeter définitivement le dossier ?' });
    expect(within(dialog).getByText(REFERENCE)).toBeInTheDocument();
    expect(within(dialog).getByText(`Paiement rejeté - dossier annulé : ${REASON}`)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Retour' })).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('the second confirmation submits the final rejection once', async () => {
    const { user, onSubmit } = await setup();
    await fillFinalRejection(user);
    await user.click(screen.getByRole('button', { name: 'Continuer…' }));
    await user.click(screen.getByRole('button', { name: 'Rejeter le dossier' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ action: 'reject_dossier', reason: REASON });
  });

  it.each([
    ['Retour', (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Retour' }))],
    ['Escape', (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
  ])('%s goes back to the form, values and focus kept, modal still open', async (_how, back) => {
    const { user, onSubmit, onClose } = await setup();
    await fillFinalRejection(user);
    await user.click(screen.getByRole('button', { name: 'Continuer…' }));
    await back(user);

    expect(screen.getByRole('dialog', { name: 'Rejeter la preuve de paiement' })).toBeInTheDocument();
    expect(screen.getByLabelText('Action apres rejet')).toHaveValue('reject_dossier');
    expect(screen.getByLabelText('Motif')).toHaveValue(REASON);
    expect(screen.getByRole('button', { name: 'Continuer…' })).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closing after a Retour still returns focus to the row button', async () => {
    const { user, onClose } = await setup();
    await fillFinalRejection(user);
    await user.click(screen.getByRole('button', { name: 'Continuer…' }));
    await user.click(screen.getByRole('button', { name: 'Retour' }));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Rejeter la preuve' })).toHaveFocus();
  });

  it('while the rejection is being sent: no second click, no way back', async () => {
    const { user, onSubmit } = await setup();
    await fillFinalRejection(user);
    await user.click(screen.getByRole('button', { name: 'Continuer…' }));
    await user.click(screen.getByRole('button', { name: 'Rejeter le dossier' }));

    expect(screen.getByRole('button', { name: 'Rejet...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Retour' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Rejeter définitivement le dossier ?' })).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('<RejectModal> S5 - asking for a new proof', () => {
  it('stays a single click on Confirmer le rejet', async () => {
    const { user, onSubmit } = await setup();
    await user.type(screen.getByLabelText('Motif'), 'Illisible');
    await user.click(screen.getByRole('button', { name: 'Confirmer le rejet' }));
    expect(onSubmit).toHaveBeenCalledWith({ action: 'request_new_proof', reason: 'Illisible' });
    expect(screen.queryByRole('dialog', { name: 'Rejeter définitivement le dossier ?' })).not.toBeInTheDocument();
  });
});

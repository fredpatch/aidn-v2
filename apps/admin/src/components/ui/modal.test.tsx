import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './modal';

/** An opener button + the modal, the way pages use it. */
function Harness({
  onClose,
  withAutoFocus = false,
  withInitialFocus = false,
  disabledFields = false,
}: {
  onClose?: () => void;
  withAutoFocus?: boolean;
  withInitialFocus?: boolean;
  disabledFields?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const close = () => {
    onClose?.();
    setOpen(false);
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Ouvrir
      </button>
      {open && (
        <Modal
          title="Rejeter le paiement"
          subtitle="DEM-2026-10-07-OMA-01"
          onClose={close}
          initialFocusRef={withInitialFocus ? noteRef : undefined}
          footer={
            <button type="button" disabled={disabledFields} onClick={close}>
              Annuler
            </button>
          }
        >
          <input aria-label="Libellé" autoFocus={withAutoFocus} disabled={disabledFields} />
          <textarea aria-label="Motif" ref={noteRef} disabled={disabledFields} />
        </Modal>
      )}
      <button type="button">Plus bas dans la page</button>
    </>
  );
}

async function openModal(props: Parameters<typeof Harness>[0] = {}) {
  const user = userEvent.setup();
  render(<Harness {...props} />);
  await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
  return user;
}

describe('<Modal> - accessibility', () => {
  it('is a modal dialog named by its title', async () => {
    await openModal();
    const dialog = screen.getByRole('dialog', { name: 'Rejeter le paiement' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});

describe('<Modal> - focus on open', () => {
  it('moves focus to the first control of the dialog', async () => {
    await openModal();
    expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus();
  });

  it('keeps focus on a field that used autoFocus', async () => {
    await openModal({ withAutoFocus: true });
    expect(screen.getByLabelText('Libellé')).toHaveFocus();
  });

  it('honours initialFocusRef', async () => {
    await openModal({ withInitialFocus: true });
    expect(screen.getByLabelText('Motif')).toHaveFocus();
  });

});

describe('<Modal> - focus trap', () => {
  it('Tab from the last control wraps to the first', async () => {
    const user = await openModal();
    screen.getByRole('button', { name: 'Annuler' }).focus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus();
  });

  it('Shift+Tab from the first control wraps to the last', async () => {
    const user = await openModal();
    expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus();
  });

  it('Tab brings focus back inside when it fell to the page (disabled control)', async () => {
    const user = await openModal({ disabledFields: true });
    (document.activeElement as HTMLElement).blur();
    expect(document.body).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus();
  });

  it('Shift+Tab brings focus back inside when it fell to the page', async () => {
    const user = await openModal();
    (document.activeElement as HTMLElement).blur();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus();
  });

  it('Tab never reaches the page behind the dialog', async () => {
    const user = await openModal();
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    }
  });
});

describe('<Modal> - closing', () => {
  it('Escape calls onClose and focus returns to the opener', async () => {
    const onClose = vi.fn();
    const user = await openModal({ onClose });
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ouvrir' })).toHaveFocus();
  });

  it('the close button calls onClose and focus returns to the opener', async () => {
    const onClose = vi.fn();
    const user = await openModal({ onClose, withAutoFocus: true });
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Ouvrir' })).toHaveFocus();
  });

  it('a backdrop click closes, a click inside the panel does not', async () => {
    const onClose = vi.fn();
    const user = await openModal({ onClose });
    await user.click(screen.getByLabelText('Motif'));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

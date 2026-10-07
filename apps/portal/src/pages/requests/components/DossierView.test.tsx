import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../../../lib/axios';
import { queryKeys, type PhaseCode } from '../../../lib/react-query/queryKeys';
import type { RequestView } from '../../../lib/api/requests.types';
import { renderWithProviders } from '../../../test/render';
import { DossierView } from './DossierView';

const DAY = '2026-10-06T09:00:00.000Z';
const payment = (status: string, proof: string | null = 'u/proof') => ({
  id: 1, status, invoiceFileUrl: 'u/invoice', proofFileUrl: proof, rejectionReason: null,
});
const closed = (id: number) => ({ id, status: 'closed' });
const BUNDLES: Record<PhaseCode, unknown> = {
  M3: {
    phase: closed(3),
    meeting: { id: 9, scheduledAt: DAY, location: 'Salle', status: 'held', crDocumentUrl: null, crUploadedAt: null },
    evaluation: { templateFileUrl: 'u/t', madeAvailableAt: DAY, returnDeadline: DAY, submittedFileUrl: null, submittedAt: null },
  },
  M4: {
    phase: closed(4),
    letterCircuit: null,
    documents: [{ id: null, slot: 's1', label: 'Manuel MPM', status: 'missing', fileUrl: null, submittedAt: null }],
    meeting: null,
    completionRate: 10,
  },
  M5: {
    phase: { id: 5, status: 'open' },
    payment: payment('awaiting_proof', null),
    evaluations: [{ id: 1, slot: 'a', label: 'Doc A', currentFileUrl: null, verdict: 'needs_correction', correctionDeadline: null }],
    completionRate: { total: 11, validated: 10 },
  },
  M6: { phase: null },
  M7: { phase: null },
};

function request(over: Partial<RequestView> = {}): RequestView {
  return {
    id: 42, reference: 'DEM-2026-10-05-OMAT-02', requestType: 'issuance', message: null, status: 'in_progress',
    rejectionReason: null, circuitStatus: 'pending_review', circuitDocumentUrl: null, circuitDocumentMimeType: null,
    createdAt: DAY, ...over,
  };
}

function renderDossier(req: RequestView, onChanged = vi.fn()) {
  const seed = (Object.keys(BUNDLES) as PhaseCode[]).map(
    (code) => [queryKeys.requests.phase(req.id, code), BUNDLES[code]] as [readonly unknown[], unknown],
  );
  renderWithProviders(<DossierView request={req} onChanged={onChanged} />, { seed });
  return { onChanged };
}

async function expandAllClosedPhases() {
  for (const summary of document.querySelectorAll('details > summary')) await userEvent.click(summary as HTMLElement);
}
const uploadControls = () => document.querySelectorAll('input[type=file]');

describe('<DossierView> - read-only rules', () => {
  it('active dossier: actions only in the open phase, never in closed phase rows', async () => {
    renderDossier(request());
    expect(uploadControls()).toHaveLength(2); // M5 payment proof + correction
    await expandAllClosedPhases();
    expect(uploadControls()).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Joindre' })).not.toBeInTheDocument();
  });

  it('terminal dossier: no upload, submit or cancel control even with every phase expanded', async () => {
    renderDossier(request({ status: 'rejected', rejectionReason: 'Manuel MPM non conforme' }));
    await expandAllClosedPhases();
    expect(uploadControls()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Soumettre|Joindre|Annuler ma demande/ })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Motif : Manuel MPM non conforme');
    expect(screen.getByText('Consulter la facture')).toBeInTheDocument(); // files stay viewable
  });
});

describe('<DossierView> - rejected dossier', () => {
  const rejected = () => request({ status: 'rejected', rejectionReason: 'Manuel MPM non conforme' });

  it('the phase open at rejection reads "Interrompue", never "En cours"', () => {
    renderDossier(rejected());
    const strip = screen.getByRole('list', { name: 'Avancement du dossier' });
    const m5 = within(strip).getByText('Évaluation').closest('li') as HTMLElement;
    expect(m5).toHaveTextContent('Interrompue');
    expect(m5).not.toHaveAttribute('aria-current');
    expect(strip).not.toHaveTextContent('En cours');
  });

  it('the interrupted phase is listed with the closed ones, not as an open card', () => {
    renderDossier(rejected());
    const rows = Array.from(document.querySelectorAll('details > summary')).map((el) => el.textContent);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('Évaluation approfondie');
    expect(rows[0]).toContain('Interrompue');
    expect(rows.slice(1).join(' ')).not.toContain('Interrompue');
  });

  it('an active dossier never shows "Interrompue"', () => {
    renderDossier(request());
    expect(screen.queryByText('Interrompue')).not.toBeInTheDocument();
    const strip = screen.getByRole('list', { name: 'Avancement du dossier' });
    expect(within(strip).getByText('Évaluation').closest('li')).toHaveAttribute('aria-current', 'step');
  });
});

describe('<DossierView> - cancelled dossier', () => {
  // A cancelled dossier keeps circuitStatus 'submitted' (cancel is only allowed
  // at that step), so only the terminal guard stops "Annuler" from reappearing.
  it('offers no cancel button, shows the outcome', () => {
    renderDossier(request({ status: 'cancelled', circuitStatus: 'submitted' }));
    expect(screen.queryByRole('button', { name: 'Annuler ma demande' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Demande annulée');
  });
});

describe('<DossierView> - cancel confirmation', () => {
  const fresh = () => request({ status: 'submitted', circuitStatus: 'submitted' });

  it('opens an accessible dialog with focus on the safe choice, and sends nothing', async () => {
    const post = vi.spyOn(api, 'post');
    renderDossier(fresh());
    await userEvent.click(screen.getByRole('button', { name: 'Annuler ma demande' }));
    const dialog = screen.getByRole('dialog', { name: /Annuler la demande DEM-2026-10-05-OMAT-02/ });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('button', { name: 'Garder ma demande' })).toHaveFocus();
    expect(post).not.toHaveBeenCalled();
  });

  it('Escape closes, returns focus to the opener, sends nothing', async () => {
    const post = vi.spyOn(api, 'post');
    renderDossier(fresh());
    const opener = screen.getByRole('button', { name: 'Annuler ma demande' });
    await userEvent.click(opener);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(post).not.toHaveBeenCalled();
  });

  it('Tab stays inside the dialog', async () => {
    renderDossier(fresh());
    await userEvent.click(screen.getByRole('button', { name: 'Annuler ma demande' }));
    const dialog = screen.getByRole('dialog');
    for (let i = 0; i < 5; i++) {
      await userEvent.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('"Oui, annuler" sends exactly one cancel call, then refreshes', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    const { onChanged } = renderDossier(fresh());
    await userEvent.click(screen.getByRole('button', { name: 'Annuler ma demande' }));
    await userEvent.click(screen.getByRole('button', { name: 'Oui, annuler' }));
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/requests/42/cancel');
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

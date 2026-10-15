import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/render';
import { MeetingReportRows, type MeetingReportFiles } from './MeetingReportRows';

const none: MeetingReportFiles = { crDocumentUrl: null, crUploadedAt: null, signedCrDocumentUrl: null, signedCrUploadedAt: null };
const available: MeetingReportFiles = { ...none, crDocumentUrl: '/api/files/101', crUploadedAt: '2026-10-10T08:00:00.000Z' };
const received: MeetingReportFiles = { ...available, signedCrDocumentUrl: '/api/files/102', signedCrUploadedAt: '2026-10-12T09:30:00.000Z' };
const FROZEN = 'Le compte rendu ne peut plus être remplacé car une version signée a déjà été retournée par le postulant.';

const rows = (report: MeetingReportFiles, extra: Partial<Parameters<typeof MeetingReportRows>[0]> = {}) =>
  renderWithProviders(<MeetingReportRows title="Réunion préliminaire" report={report} canUpload {...extra} />);

describe('<MeetingReportRows>', () => {
  it('no DN CR: « Non déposé », deposit form, no signed row', () => {
    rows(none);
    expect(screen.getByText('Facultatif : la phase peut être clôturée sans compte rendu.')).toBeInTheDocument();
    const dn = screen.getByRole('region', { name: 'Compte rendu DN' });
    expect(dn).toHaveTextContent('Non déposé');
    expect(within(dn).getByRole('button', { name: /Déposer le compte rendu/ })).toBeDisabled();
    expect(screen.queryByRole('region', { name: 'Compte rendu signé par le postulant' })).not.toBeInTheDocument();
  });

  it('DN CR available, signed copy pending: replace allowed, « En attente du postulant », no validation action', () => {
    rows(available);
    const dn = screen.getByRole('region', { name: 'Compte rendu DN' });
    expect(dn).toHaveTextContent('Disponible');
    expect(within(dn).getByRole('button', { name: 'Consulter' })).toBeInTheDocument();
    expect(within(dn).getByRole('button', { name: 'Télécharger' })).toBeInTheDocument();
    expect(within(dn).getByRole('button', { name: /Remplacer le compte rendu/ })).toBeInTheDocument();
    const signed = screen.getByRole('region', { name: 'Compte rendu signé par le postulant' });
    expect(signed).toHaveTextContent('En attente du postulant');
    expect(screen.queryByRole('button', { name: /Valider|Accepter|Refuser|Rejeter/ })).not.toBeInTheDocument();
  });

  it('signed copy received: « Reçu le », consult / download, DN replacement frozen with the exact wording', () => {
    rows(received);
    const signed = screen.getByRole('region', { name: 'Compte rendu signé par le postulant' });
    expect(signed).toHaveTextContent(/Reçu le/);
    expect(within(signed).getByRole('button', { name: 'Consulter' })).toBeInTheDocument();
    expect(within(signed).getByRole('button', { name: 'Télécharger' })).toBeInTheDocument();
    const dn = screen.getByRole('region', { name: 'Compte rendu DN' });
    expect(dn).toHaveTextContent(FROZEN);
    expect(within(dn).queryByRole('button', { name: /Remplacer le compte rendu/ })).not.toBeInTheDocument();
    expect(within(dn).queryByLabelText('Fichier du compte rendu DN')).not.toBeInTheDocument();
  });

  it('read only (closed dossier): files viewable, no form, no frozen note', () => {
    rows(received, { canUpload: false });
    expect(screen.queryByLabelText('Fichier du compte rendu DN')).not.toBeInTheDocument();
    expect(screen.queryByText(FROZEN)).not.toBeInTheDocument();
    expect(screen.queryByText(/Facultatif/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Consulter' })).toHaveLength(2);
  });

  it('sends the chosen file and clears it on success; keeps it when the caller reports a failure', async () => {
    const onUpload = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    rows(available, { onUpload });
    const input = screen.getByLabelText('Fichier du compte rendu DN') as HTMLInputElement;
    const file = new File(['%PDF'], 'cr.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    const submit = screen.getByRole('button', { name: /Remplacer le compte rendu/ });
    fireEvent.click(submit);
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(file));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(submit).toBeDisabled());
  });
});

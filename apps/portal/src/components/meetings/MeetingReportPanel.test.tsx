import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../../lib/axios';
import { notify } from '../../lib/notify';
import { renderWithProviders } from '../../test/render';
import { MeetingReportPanel, meetingReportAnchor, showsReportPanel, type ReportableMeeting } from './MeetingReportPanel';

const base: ReportableMeeting = {
  id: 21,
  status: 'held',
  meetingType: 'preliminary',
  crDocumentUrl: '/api/files/101',
  crUploadedAt: '2026-10-10T08:00:00.000Z',
  signedCrDocumentUrl: null,
  signedCrUploadedAt: null,
  canSubmitSignedReport: true,
};
const pdf = () => new File(['%PDF'], 'cr-signe.pdf', { type: 'application/pdf' });

let post: ReturnType<typeof vi.fn>;
beforeEach(() => {
  post = vi.fn((url: string) => Promise.resolve({ data: url === '/uploads' ? { uploadAssetId: 55 } : {} }));
  vi.spyOn(api, 'post').mockImplementation(post);
  vi.spyOn(notify, 'success').mockImplementation(() => undefined as never);
  vi.spyOn(notify, 'error').mockImplementation(() => undefined as never);
});
afterEach(() => vi.restoreAllMocks());

describe('<MeetingReportPanel>', () => {
  it('no DN CR yet: says so, no action', () => {
    renderWithProviders(<MeetingReportPanel meeting={{ ...base, crDocumentUrl: null, crUploadedAt: null, canSubmitSignedReport: false }} />);
    const panel = screen.getByRole('region', { name: 'Compte rendu de réunion' });
    expect(panel).toHaveTextContent("Le compte rendu n'est pas encore disponible.");
    expect(within(panel).queryAllByRole('button')).toHaveLength(0);
  });

  it('DN CR available: visible consult / download buttons, then the deposit call to action', () => {
    renderWithProviders(<MeetingReportPanel meeting={base} />);
    expect(screen.getByText('Compte rendu transmis par la DN')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Consulter le compte rendu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Télécharger' })).toBeInTheDocument();
    expect(screen.getByText('Après signature, téléversez le compte rendu signé.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Déposer le compte rendu signé' })).toBeInTheDocument();
  });

  it('uploads the file, then sends only its id to the applicant route', async () => {
    renderWithProviders(<MeetingReportPanel meeting={base} />);
    await userEvent.upload(screen.getByLabelText('Fichier du compte rendu signé'), pdf());
    await waitFor(() => expect(post).toHaveBeenCalledWith('/meetings/21/signed-report', { uploadAssetId: 55 }));
    expect(post.mock.calls[0][0]).toBe('/uploads');
    expect(notify.success).toHaveBeenCalledWith('Compte rendu signé transmis à la DN.');
  });

  it('attach refused after the upload: API message shown, no success, button usable again', async () => {
    post.mockImplementation((url: string) =>
      url === '/uploads'
        ? Promise.resolve({ data: { uploadAssetId: 55 } })
        : Promise.reject({ isAxiosError: true, response: { status: 409, data: { message: 'Dossier clos.' } } })
    );
    renderWithProviders(<MeetingReportPanel meeting={base} />);
    await userEvent.upload(screen.getByLabelText('Fichier du compte rendu signé'), pdf());
    await waitFor(() => expect(notify.error).toHaveBeenCalled());
    expect(notify.success).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Déposer le compte rendu signé' })).toBeEnabled();
  });

  it('while an upload runs, the deposit button is disabled (no double submit)', async () => {
    post.mockImplementation(() => new Promise(() => undefined));
    renderWithProviders(<MeetingReportPanel meeting={base} />);
    await userEvent.upload(screen.getByLabelText('Fichier du compte rendu signé'), pdf());
    expect(screen.getByRole('button', { name: 'Déposer le compte rendu signé' })).toBeDisabled();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('signed copy sent (the API then sends canSubmitSignedReport false): consult / download, no replacement', () => {
    renderWithProviders(
      <MeetingReportPanel
        meeting={{ ...base, signedCrDocumentUrl: '/api/files/102', signedCrUploadedAt: '2026-10-12T09:30:00.000Z', canSubmitSignedReport: false }}
      />
    );
    expect(screen.getByText('Compte rendu signé transmis')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Consulter' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Consulter le compte rendu' })).toBeInTheDocument();
    expect(screen.queryByText('Remplacer le fichier signé')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Déposer le compte rendu signé' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fichier du compte rendu signé')).not.toBeInTheDocument();
    expect(screen.getByText('Pour toute correction, contactez la Direction de la Navigabilité.')).toBeInTheDocument();
  });

  it('even if a stale payload still says canSubmitSignedReport, a sent copy offers no replacement', () => {
    renderWithProviders(
      <MeetingReportPanel meeting={{ ...base, signedCrDocumentUrl: '/api/files/102', signedCrUploadedAt: '2026-10-12T09:30:00.000Z' }} />
    );
    expect(screen.queryByText('Remplacer le fichier signé')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Déposer le compte rendu signé' })).not.toBeInTheDocument();
  });

  it('the panel carries the anchor the dossier / dashboard actions link to', () => {
    renderWithProviders(<MeetingReportPanel meeting={base} />);
    expect(screen.getByRole('region', { name: 'Compte rendu de réunion' })).toHaveAttribute('id', meetingReportAnchor(21));
    expect(meetingReportAnchor(21)).toBe('compte-rendu-21');
  });

  it('closed dossier: documents still readable, no upload or replace', () => {
    renderWithProviders(
      <MeetingReportPanel
        meeting={{ ...base, signedCrDocumentUrl: '/api/files/102', signedCrUploadedAt: '2026-10-12T09:30:00.000Z', canSubmitSignedReport: false }}
      />
    );
    expect(screen.getByRole('button', { name: 'Consulter le compte rendu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remplacer le fichier signé' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fichier du compte rendu signé')).not.toBeInTheDocument();
  });

  it('showsReportPanel: held M3/M4 only', () => {
    expect(showsReportPanel({ status: 'held', meetingType: 'preliminary' })).toBe(true);
    expect(showsReportPanel({ status: 'held', meetingType: 'formal' })).toBe(true);
    expect(showsReportPanel({ status: 'held' })).toBe(true);
    for (const status of ['scheduled', 'no_show', 'rescheduled', 'file_cancelled']) {
      expect(showsReportPanel({ status, meetingType: 'preliminary' })).toBe(false);
    }
    expect(showsReportPanel({ status: 'held', meetingType: 'site_visit' })).toBe(false);
  });
});

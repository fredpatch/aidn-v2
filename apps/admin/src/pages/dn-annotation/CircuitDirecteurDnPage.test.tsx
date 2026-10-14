/** SESSION1-M1-1 - Circuit Directeur DN: tabs, business wording, the two
 *  actions, and a closed dossier offering none. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { api } from '../../lib/axios';
import type { DnAnnotationTask } from '../../lib/api/dn-annotation';
import { renderWithProviders } from '../../test/render';
import CircuitDirecteurDnPage from './CircuitDirecteurDnPage';

const task = (n: number, over: Partial<DnAnnotationTask> = {}): DnAnnotationTask => ({
  id: `dn_director_annotation:${n}`,
  bucket: 'to_send',
  requestId: n,
  requestReference: `DEM-DN-0${n}`,
  requestType: 'issuance',
  organisationName: `OMA ${n}`,
  applicantName: 'Jean Test',
  circuitDocumentId: n,
  statusLabel: 'À transmettre au Directeur DN',
  fileUrl: `/api/files/${n}`,
  mimeType: 'application/pdf',
  createdAt: `2026-10-0${n}T09:00:00.000Z`,
  sentToDirectorAt: null,
  returnedAt: null,
  availableActions: ['send_to_director'],
  dossierStatus: 'submitted',
  dossierClosed: false,
  directorWorkingDays: null,
  predatesProcess: false,
  ...over,
});

const ITEMS = [
  task(1),
  task(2, { bucket: 'with_director', statusLabel: 'En circuit Directeur DN', availableActions: ['upload_annotated_return'], sentToDirectorAt: '2026-10-03T09:00:00.000Z', directorWorkingDays: 2 }),
  task(3, { bucket: 'returned', statusLabel: 'Annotation du Directeur DN reçue', availableActions: [], returnedAt: '2026-10-04T09:00:00.000Z' }),
  task(4, { dossierStatus: 'rejected', dossierClosed: true, availableActions: [] }),
];

beforeEach(() => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { items: ITEMS, counts: {} } });
  vi.spyOn(api, 'post').mockResolvedValue({ data: null });
});
afterEach(() => vi.restoreAllMocks());

describe('<CircuitDirecteurDnPage>', () => {
  it('uses the business tabs and hides a closed dossier from the pending tab', async () => {
    renderWithProviders(<CircuitDirecteurDnPage />);
    expect(await screen.findByRole('heading', { name: 'Circuit Directeur DN' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^À transmettre\s*1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^En attente du retour\s*1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Annotation reçue\s*1/ })).toBeInTheDocument();
    expect(screen.queryByText('DEM-DN-04')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/pending_review|in_signature_circuit|dn_director_annotation/);
  });

  it('marks a dossier as sent to the Directeur DN', async () => {
    renderWithProviders(<CircuitDirecteurDnPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Marquer en circuit Directeur DN' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/dn-annotation-tasks/dn_director_annotation%3A1/send-to-director')
    );
  });

  it('offers the annotated return upload only for a dossier in the Directeur DN circuit', async () => {
    renderWithProviders(<CircuitDirecteurDnPage />);
    fireEvent.click(await screen.findByRole('button', { name: /^En attente du retour\s*1/ }));
    expect(await screen.findByRole('button', { name: 'Téléverser le retour annoté' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marquer en circuit Directeur DN' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Annotation reçue\s*1/ }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Téléverser le retour annoté' })).not.toBeInTheDocument());
    expect(screen.getByText('Aucune action à effectuer.')).toBeInTheDocument();
  });
});

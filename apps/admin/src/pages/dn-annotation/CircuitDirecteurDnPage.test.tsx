/** SESSION1-COCKPIT-1 - Circuit Directeur DN cockpit (Assistante DN home): the
 *  default tab with its CTA, a closed dossier only under « Tous », no CTA for
 *  a role that cannot act, waiting grouping, the annotated-return upload. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { api } from '../../lib/axios';
import { uploadFile } from '../../lib/uploads';
import type { DnAnnotationTask } from '../../lib/api/dn-annotation';
import { renderWithProviders } from '../../test/render';
import { dnInactive, dnReturned, dnTask, dnWithDirector } from '../../test/dnFixtures';
import CircuitDirecteurDnPage from './CircuitDirecteurDnPage';

let roles = ['assistant_dn'];
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { roles } }) }));
vi.mock('../../lib/uploads', () => ({ uploadFile: vi.fn() }));

const id = (n: number) => `dn_director_annotation:${n}`;
const ITEMS: DnAnnotationTask[] = [
  dnTask({ id: id(1), requestId: 1, requestReference: 'DEM-DN-01', organisationName: 'OMA 1' }),
  dnWithDirector({ id: id(2), requestId: 2, requestReference: 'DEM-DN-02', organisationName: 'OMA 2' }),
  dnReturned({ id: id(3), requestId: 3, requestReference: 'DEM-DN-03', organisationName: 'OMA 3' }),
  dnInactive({ id: id(4), requestId: 4, requestReference: 'DEM-DN-04', organisationName: 'OMA 4' }),
];
const COUNTS = { to_send: 1, with_director: 1, returned: 1, inactive: 1 };

const renderPage = (route = '/circuit-directeur-dn') => renderWithProviders(<CircuitDirecteurDnPage />, { route });
const tabBtn = (name: RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  roles = ['assistant_dn'];
  vi.spyOn(api, 'get').mockResolvedValue({ data: { items: ITEMS, counts: COUNTS } });
  vi.spyOn(api, 'post').mockResolvedValue({ data: null });
  vi.mocked(uploadFile).mockResolvedValue({ uploadAssetId: 42 } as Awaited<ReturnType<typeof uploadFile>>);
});
afterEach(() => vi.restoreAllMocks());

describe('<CircuitDirecteurDnPage> cockpit', () => {
  it('lands on « À transmettre » with its CTA for the Assistante DN', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Circuit Directeur DN' })).toBeInTheDocument();
    await screen.findAllByRole('option');
    expect(tabBtn(/^À transmettre/)).toHaveClass('border-anac-blue');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    const article = screen.getByRole('article', { name: /DEM-DN-01/ });
    fireEvent.click(within(article).getByRole('button', { name: 'Marquer transmis au Directeur DN' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/dn-annotation-tasks/dn_director_annotation%3A1/send-to-director'));
  });

  it('the closed pending item appears only under « Tous », with the closed badge and no CTA', async () => {
    renderPage();
    await screen.findAllByRole('option');
    expect(screen.queryByText('DEM-DN-04')).not.toBeInTheDocument();
    expect(tabBtn(/^À transmettre/)).toHaveTextContent('1');
    fireEvent.click(tabBtn(/^Tous/));
    expect(await screen.findAllByRole('option')).toHaveLength(4);
    fireEvent.click(screen.getAllByRole('option').find((o) => o.textContent?.includes('DEM-DN-04'))!);
    const closed = await screen.findByRole('article', { name: /DEM-DN-04/ });
    expect(within(closed).getAllByText('Dossier rejeté').length).toBeGreaterThan(0);
    expect(within(closed).getByText('Dossier clos — consultation uniquement')).toBeInTheDocument();
    expect(within(closed).queryByRole('button', { name: /Marquer transmis|Téléverser/ })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/pending_review|in_signature_circuit|dn_director_annotation/);
  });

  it('Réception gets no CTA but keeps the document', async () => {
    roles = ['reception'];
    renderPage();
    const article = await screen.findByRole('article', { name: /DEM-DN-01/ });
    expect(within(article).queryByRole('button', { name: 'Marquer transmis au Directeur DN' })).not.toBeInTheDocument();
    expect(within(article).getByRole('button', { name: /Voir le document/ })).toBeInTheDocument();
    expect(within(article).queryByRole('link', { name: /Voir le dossier/ })).not.toBeInTheDocument();
  });

  it('« Chez le Directeur DN » groups a normal item under « En attente », never « À traiter »', async () => {
    renderPage('/circuit-directeur-dn?tab=with_director');
    await screen.findAllByRole('option');
    expect(screen.getByText('En attente')).toBeInTheDocument();
    expect(screen.queryByText('À traiter')).not.toBeInTheDocument();
  });

  it('the return modal sends the uploaded asset to return-annotated', async () => {
    renderPage('/circuit-directeur-dn?tab=with_director');
    fireEvent.click(await screen.findByRole('button', { name: 'Téléverser le retour annoté' }));
    expect(screen.getByText('Une fois enregistré, la DN peut ouvrir la phase préliminaire du dossier.')).toBeInTheDocument();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'retour.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le retour' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/dn-annotation-tasks/dn_director_annotation%3A2/return-annotated', { uploadAssetId: 42 })
    );
  });
});

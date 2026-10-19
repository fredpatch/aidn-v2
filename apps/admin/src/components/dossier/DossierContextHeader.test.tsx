/** DOSSIER-CONTEXT-UX-1 - the dossier identity block of treatment screens. */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DossierContextHeader } from './DossierContextHeader';

const context = {
  reference: 'DEM-2026-10-15-PSGE-01',
  organisationName: 'Air Example Gabon',
  applicantName: 'Jean Dupont',
  statusLabel: 'En cours',
};

describe('<DossierContextHeader>', () => {
  it('names the dossier: reference, organisation, applicant and status, as one labelled region', () => {
    render(<DossierContextHeader context={context} requestId="123" />);
    const region = screen.getByRole('region', { name: 'Dossier DEM-2026-10-15-PSGE-01, Air Example Gabon' });
    expect(region).toHaveTextContent('DEM-2026-10-15-PSGE-01');
    expect(region).toHaveTextContent('Air Example Gabon');
    expect(region).toHaveTextContent('Postulant : Jean Dupont');
    expect(region).toHaveTextContent('En cours');
    expect(region).not.toHaveTextContent('#123');
  });

  it('applicant line only when supplied', () => {
    render(<DossierContextHeader context={{ ...context, applicantName: null }} />);
    expect(screen.queryByText(/Postulant/)).toBeNull();
  });

  it('status is the label given by the API (closed dossier included), never inferred', () => {
    render(<DossierContextHeader context={{ ...context, statusLabel: 'Rejeté' }} />);
    expect(screen.getByText('Rejeté')).toBeInTheDocument();
    expect(screen.queryByText('En cours')).toBeNull();
  });

  it('loading: a compact skeleton, never a provisional « #123 »', () => {
    const { container } = render(<DossierContextHeader context={null} requestId="123" loading />);
    expect(screen.getByLabelText('Chargement du dossier')).toHaveAttribute('aria-busy', 'true');
    expect(container.textContent).toBe('');
  });

  it('no context (lookup failed): degraded « Dossier #123 », no crash', () => {
    render(<DossierContextHeader context={null} requestId="123" />);
    expect(screen.getByText('Dossier #123')).toBeInTheDocument();
  });
});

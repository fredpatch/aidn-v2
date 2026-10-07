import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AccountPage from './AccountPage';

const applicant = vi.hoisted(() => ({
  current: {
    id: 1, organisationId: 7, organisationName: 'Air Ogooué Maintenance', fullName: 'Jeanne Mba',
    email: 'j.mba@example.ga', contactOrder: 'primary',
  },
}));
vi.mock('../../hooks/useApplicantAuth', () => ({ useApplicantAuth: () => ({ applicant: applicant.current }) }));

const valueOf = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

describe('<AccountPage>', () => {
  it('shows the organisation first, then the contact', () => {
    render(<AccountPage />);
    expect(screen.getAllByRole('term').map((t) => t.textContent)).toEqual(['Organisme', 'Nom', 'E-mail', 'Rôle']);
    expect(valueOf('Organisme')).toBe('Air Ogooué Maintenance');
    expect(valueOf('Rôle')).toBe('Contact principal');
  });

  it('a missing organisation name never renders an empty value', () => {
    applicant.current = { ...applicant.current, organisationName: '' };
    render(<AccountPage />);
    expect(valueOf('Organisme')).toBe('Non renseigné');
  });
});

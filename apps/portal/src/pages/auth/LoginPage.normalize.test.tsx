/** AUTH-LOGIN-NORMALIZE-1 - the login form sends the email trimmed and
 *  lowercased (UX only, the API normalises too) and the password as typed. */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const post = vi.fn().mockResolvedValue({ data: {} });

vi.mock('../../hooks/useApplicantAuth', () => ({
  useApplicantAuth: () => ({ refreshMe: vi.fn().mockResolvedValue(undefined), applicant: null }),
}));
vi.mock('../../lib/axios', () => ({
  api: { post: (...args: unknown[]) => post(...args) },
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

const { default: LoginPage } = await import('./LoginPage');

describe('portal login email normalisation', () => {
  it('sends « John.Doe@Example.Com » as john.doe@example.com; the password is untouched', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email'), '  John.Doe@Example.Com ');
    await user.type(screen.getByLabelText('Mot de passe'), ' Pa55 Word ');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith('/applicant-auth/login', { email: 'john.doe@example.com', password: ' Pa55 Word ' });
  });
});

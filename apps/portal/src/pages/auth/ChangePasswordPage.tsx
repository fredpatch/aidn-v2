import { FormEvent, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { PRODUCT_NAME } from '@aidn/shared';
import { api, apiErrorMessage } from '../../lib/axios';
import { notify } from '../../lib/notify';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

/** ACCOUNT-V2 - after an ANAC reset the applicant signs in with a temporary
 *  password and lands here, before any other page (the API refuses every
 *  other applicant route meanwhile). The change answers with a fresh session:
 *  `onChanged` reloads the applicant, which opens the portal. */

const MIN_LENGTH = 8;

export default function ChangePasswordPage({
  fullName,
  onChanged,
  onLogout,
}: {
  fullName: string;
  onChanged: () => Promise<void>;
  onLogout: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!currentPassword) return setError('Saisissez votre mot de passe temporaire ou actuel.');
    if (newPassword.length < MIN_LENGTH) {
      return setError(`Le nouveau mot de passe doit contenir au moins ${MIN_LENGTH} caractères.`);
    }
    if (newPassword !== confirmation) return setError('La confirmation ne correspond pas au nouveau mot de passe.');
    if (newPassword === currentPassword) return setError("Le nouveau mot de passe doit être différent de l'actuel.");

    setSubmitting(true);
    try {
      await api.post('/applicant-auth/change-password', { currentPassword, newPassword });
      notify.success('Mot de passe modifié.');
      await onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, 'Modification du mot de passe impossible.'));
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh bg-anac-gray flex items-center justify-center p-4">
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-anac-navy mb-3">
            <KeyRound className="text-white" size={20} aria-hidden="true" />
          </div>
          <h1 className="text-lg font-bold text-anac-navy">{PRODUCT_NAME}</h1>
        </div>
        <form onSubmit={submit} className="bg-white rounded-2xl shadow-sm border border-anac-border p-6 space-y-4" noValidate>
          <div>
            <h2 className="text-base font-semibold text-anac-navy">Nouveau mot de passe</h2>
            <p className="mt-1 text-sm text-anac-muted">
              Votre mot de passe doit être modifié avant de continuer.
            </p>
            <p className="mt-1 text-xs text-anac-muted">Connecté : {fullName}</p>
          </div>
          <div>
            <Label htmlFor="current-password">Mot de passe temporaire / actuel</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="new-password">Nouveau mot de passe</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <p className="mt-1 text-[11px] text-anac-muted">Au moins {MIN_LENGTH} caractères.</p>
          </div>
          <div>
            <Label htmlFor="confirm-password">Confirmer le nouveau mot de passe</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="rounded bg-red-50 px-3 py-2 text-xs text-anac-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Modification...' : 'Modifier le mot de passe'}
          </Button>
          <button
            type="button"
            className="block w-full text-center text-xs text-anac-muted underline hover:text-anac-navy"
            onClick={onLogout}
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  );
}

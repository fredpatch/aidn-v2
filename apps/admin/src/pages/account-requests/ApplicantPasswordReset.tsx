import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { api, apiErrorMessage } from '../../lib/axios';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/modal';
import { notify } from '../../lib/notify';

/** ACCOUNT-V2 - DN supervisor / SU reset of a lost applicant password. The
 *  API generates the temporary password and returns it once: it lives in
 *  this component's state only while the result window is open, is never
 *  refetched, and is dropped on close or when another account is selected. */

export const PASSWORD_RESET_ROLES = ['dn_supervisor', 'SU'];

export function ApplicantPasswordReset({
  accountId,
  active,
  onReset,
}: {
  accountId: number;
  active: boolean;
  /** The account changed (version, change required): reload the list. */
  onReset: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  useEffect(() => {
    setConfirming(false);
    setBusy(false);
    setError(null);
    setTemporaryPassword(null);
  }, [accountId]);

  async function confirmReset() {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<{ temporaryPassword: string }>(
        `/account-requests/applicants/${accountId}/reset-password`
      );
      setConfirming(false);
      setTemporaryPassword(data.temporaryPassword);
      onReset();
    } catch (err) {
      setError(apiErrorMessage(err, 'Réinitialisation du mot de passe impossible.'));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      notify.success('Mot de passe temporaire copié.');
    } catch {
      notify.error('Copie impossible : sélectionnez le mot de passe et copiez-le manuellement.');
    }
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-anac-border px-2 py-2 text-xs font-semibold text-anac-navy hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-anac-muted disabled:hover:bg-transparent"
        disabled={!active}
        title={active ? undefined : 'Réactivez le compte avant de réinitialiser son mot de passe.'}
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
      >
        <KeyRound size={14} aria-hidden="true" />
        Réinitialiser le mot de passe
      </button>

      {confirming ? (
        <Modal
          title="Réinitialiser le mot de passe de ce postulant ?"
          onClose={() => {
            if (!busy) setConfirming(false);
          }}
          footer={
            <>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
                Annuler
              </Button>
              <Button type="button" variant="destructive" disabled={busy} onClick={confirmReset}>
                {busy ? 'Réinitialisation...' : 'Réinitialiser'}
              </Button>
            </>
          }
        >
          <div className="space-y-2 text-sm text-anac-text">
            <p>Toutes ses sessions actives seront invalidées.</p>
            <p>Un mot de passe temporaire sera généré et devra être changé à la prochaine connexion.</p>
          </div>
          {error ? (
            <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-anac-danger">
              {error}
            </p>
          ) : null}
        </Modal>
      ) : null}

      {temporaryPassword ? (
        <Modal
          title="Mot de passe temporaire"
          onClose={() => setTemporaryPassword(null)}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={copy}>
                Copier
              </Button>
              <Button type="button" onClick={() => setTemporaryPassword(null)}>
                Fermer
              </Button>
            </>
          }
        >
          <p
            data-testid="temporary-password"
            className="select-all break-all rounded-md border border-anac-border bg-slate-50 px-3 py-3 text-center font-mono text-lg font-semibold tracking-wider text-anac-navy"
          >
            {temporaryPassword}
          </p>
          <div className="mt-3 space-y-1 text-xs text-anac-muted">
            <p>Copiez ce mot de passe maintenant.</p>
            <p>Il ne sera plus affiché après fermeture de cette fenêtre.</p>
            <p>Transmettez-le au postulant par un canal sûr : il devra le changer à sa prochaine connexion.</p>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

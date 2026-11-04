import { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { OPERATIONAL_OWNERS, type PhaseClosureState } from '@aidn/shared';
import { Button } from '../ui/button';
import FileLink from '../files/FileLink';
import { useCanAct } from '../../lib/next-action-owner';

interface PhaseClosureCardProps {
  /** usePhaseClosure(...).state - null while loading. */
  state: PhaseClosureState | null;
  /** The page's own readiness wording, when it has one (never re-computed here). */
  blocker?: string | null;
  dossierClosed: boolean;
  depositing: boolean;
  onDeposit: (file: File) => Promise<string | null>;
}

function Status({ title, detail, children }: { title: string; detail: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-anac-navy">{title}</p>
      <p className="text-sm text-anac-muted">{detail}</p>
      {children}
    </div>
  );
}

/** WORKFLOW-FOUNDATION-1B - « Courrier de clôture »: the only way an M3/M4/M5
 *  phase closes. The Chef de service DN deposits it once the phase is
 *  business-ready; Réception / Assistant DG run the DG circuit from
 *  /courriers, and the signed return closes the phase. */
export function PhaseClosureCard({ state, blocker, dossierClosed, depositing, onDeposit }: PhaseClosureCardProps) {
  const canDeposit = useCanAct(OPERATIONAL_OWNERS.dnSupervisor);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!state) return null;
  const { closure, readiness } = state;

  async function deposit() {
    if (!file) return;
    setError(null);
    const failure = await onDeposit(file);
    if (failure) setError(failure);
    else setFile(null);
  }

  let body: React.ReactNode;
  if (closure?.status === 'signed_returned') {
    body = (
      <Status title="Courrier signé retourné" detail="Phase clôturée">
        <FileLink address={closure.signedDocumentUrl} className="text-sm text-anac-sky underline">
          Voir le courrier signé
        </FileLink>
      </Status>
    );
  } else if (closure?.status === 'in_signature_circuit') {
    body = (
      <Status title="En circuit DG" detail="Retour signé attendu">
        <FileLink address={closure.draftDocumentUrl} className="text-sm text-anac-sky underline">
          Voir le courrier déposé
        </FileLink>
      </Status>
    );
  } else if (closure?.status === 'submitted') {
    body = (
      <Status title="Courrier déposé" detail="En attente de mise en circuit DG">
        <FileLink address={closure.draftDocumentUrl} className="text-sm text-anac-sky underline">
          Voir le courrier déposé
        </FileLink>
      </Status>
    );
  } else if (state.phaseStatus === 'closed') {
    // Closed before the closure courrier existed: history only.
    body = <Status title="Phase clôturée" detail="Clôturée avant le circuit du courrier de clôture." />;
  } else if (!readiness?.ready) {
    body = <Status title="Clôture non disponible" detail={blocker || readiness?.blockerMessage || 'Les conditions de la phase ne sont pas encore réunies.'} />;
  } else if (dossierClosed) {
    body = <Status title="Dossier clos" detail="Consultation uniquement." />;
  } else if (!canDeposit) {
    body = (
      <Status
        title="Courrier de clôture à déposer"
        detail="Les conditions de la phase sont réunies. Dépôt réservé au Chef de service DN."
      />
    );
  } else {
    body = (
      <div className="space-y-3">
        <Status
          title="Courrier de clôture à déposer"
          detail="Les conditions de la phase sont réunies. Déposez le courrier de clôture : il partira ensuite en circuit DG."
        />
        <label className="label" htmlFor="phase-closure-file">
          Courrier de clôture
        </label>
        <input
          id="phase-closure-file"
          type="file"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        {error && <p className="text-sm text-anac-danger">{error}</p>}
        <Button type="button" onClick={deposit} disabled={!file || depositing}>
          {depositing ? 'Dépôt...' : 'Déposer le courrier de clôture'}
        </Button>
      </div>
    );
  }

  return (
    <section className="card space-y-3" aria-label="Courrier de clôture">
      <div className="flex items-center gap-2 text-sm font-medium text-anac-navy">
        <MailCheck size={16} />
        <span>Courrier de clôture</span>
      </div>
      {body}
    </section>
  );
}

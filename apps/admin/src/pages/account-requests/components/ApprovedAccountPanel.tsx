import { FileClock, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { EmptyState } from '../../../components/common/EmptyState';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { CONTACT_ORDER_LABELS, CONTACT_ORDER_SHORT, STATUS_STYLES } from '../accountRequestLabels';
import type { ApplicantAccountView } from '../types';

export function ApprovedAccountPanel({
  account,
  busy,
  onToggle,
}: {
  account: ApplicantAccountView | null;
  busy: boolean;
  onToggle: (id: number, active: boolean) => void;
}) {
  if (!account) {
    return (
      <aside className="rounded-lg border border-anac-border bg-white p-5 shadow-sm">
        <EmptyState
          title="Aucun compte selectionne"
          description="Selectionnez un compte dans la liste."
          className="min-h-[220px]"
        />
      </aside>
    );
  }

  return (
    <aside className="h-fit rounded-lg border border-anac-border bg-white shadow-sm">
      <div className="border-b border-anac-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-anac-blue/10 text-xs font-bold text-anac-blue">
              {initials(account.organisationName)}
            </div>
            <div>
              <p className="text-xs font-semibold text-anac-muted">Details du compte</p>
              <h2 className="mt-1 text-base font-semibold text-anac-navy">
                {account.organisationName}
              </h2>
              <p className="text-xs text-anac-muted">{account.email}</p>
            </div>
          </div>
          <StatusBadge
            label={account.active ? 'Actif' : 'Suspension'}
            tone={STATUS_STYLES[account.active ? 'active' : 'suspended']}
          />
        </div>
      </div>

      <div className="space-y-3 p-4">
        <section className="rounded-lg border border-anac-border p-3">
          <div className="flex items-start gap-2">
            <UserRound size={14} className="mt-0.5 text-anac-navy" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-anac-navy">{account.fullName}</p>
              <p className="text-xs text-anac-muted">
                {CONTACT_ORDER_LABELS[account.contactOrder] ?? account.contactOrder}
              </p>
              <p className="truncate text-xs text-anac-muted">{account.email}</p>
              {account.phone ? <p className="text-xs text-anac-muted">{account.phone}</p> : null}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-anac-border p-3">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-anac-navy">
            <LockKeyhole size={14} aria-hidden="true" />
            Actions rapides
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="rounded-md border border-anac-border px-2 py-2 text-xs font-semibold text-anac-muted"
              disabled
            >
              Reinitialiser
            </button>
            <button
              className="rounded-md border border-anac-border px-2 py-2 text-xs font-semibold text-anac-muted"
              disabled
            >
              Modifier
            </button>
          </div>
          <Button
            type="button"
            variant={account.active ? 'destructive' : 'secondary'}
            className="mt-2 w-full"
            disabled={busy}
            onClick={() => onToggle(account.id, !account.active)}
          >
            {account.active ? 'Suspendre le compte' : 'Reactiver le compte'}
          </Button>
        </section>

        <section className="rounded-lg border border-anac-border p-3">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-anac-navy">
            <FileClock size={14} aria-hidden="true" />
            Resume
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <CompactInfo
              label="Profil"
              value={CONTACT_ORDER_SHORT[account.contactOrder] ?? account.contactOrder}
            />
            <CompactInfo label="Statut" value={account.active ? 'Actif' : 'Suspension'} />
            <CompactInfo label="Approbation" value={formatShortDate(account.createdAt)} />
            <CompactInfo label="Connexion" value="A venir" />
          </div>
        </section>

        <section className="rounded-lg border border-anac-border p-3">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-anac-navy">
            <ShieldCheck size={14} aria-hidden="true" />A venir
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <FuturePill label="Portee d'acces" />
            <FuturePill label="Dossiers lies" />
            <FuturePill label="Activite" />
            <FuturePill label="Permissions" />
          </div>
        </section>
      </div>
    </aside>
  );
}

function CompactInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-2 py-2">
      <p className="text-[10px] uppercase tracking-wide text-anac-muted">{label}</p>
      <p className="mt-1 truncate font-semibold text-anac-navy">{value}</p>
    </div>
  );
}

function FuturePill({ label }: { label: string }) {
  return (
    <span className="rounded-md bg-slate-50 px-2 py-2 text-center text-[11px] font-semibold text-anac-muted">
      {label}
    </span>
  );
}

function formatShortDate(value: string): string {
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

function initials(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

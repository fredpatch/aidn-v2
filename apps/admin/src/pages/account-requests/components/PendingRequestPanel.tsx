import { FormEvent, useEffect, useState } from 'react';
import { Building2, FileClock, ShieldCheck, UserCheck, UserCog, UserRound } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { EmptyState } from '../../../components/common/EmptyState';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { api, apiErrorMessage } from '../../../lib/axios';
import { cn } from '../../../lib/utils';
import { CONTACT_ORDER_LABELS, STATUS_STYLES } from '../accountRequestLabels';
import { formatDateTime } from '../accountRequestFormatters';
import type { AccountRequestView, OrganisationCandidate } from '../types';

export function PendingRequestPanel({
  request,
  busy,
  onApprove,
  onReject,
}: {
  request: AccountRequestView | null;
  busy: boolean;
  onApprove: (
    requestId: number,
    payload: { organisationId?: number; createOrganisation?: boolean; contactOrder: string }
  ) => void;
  onReject: (requestId: number, rejectionReason: string) => void;
}) {
  const [selectedOrganisationId, setSelectedOrganisationId] = useState<number | null>(null);
  const [contactOrder, setContactOrder] = useState('primary');
  const [rejectionReason, setRejectionReason] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<OrganisationCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedOrganisationId(request?.candidates[0]?.id ?? null);
    setContactOrder('primary');
    setRejectionReason('');
    setSearchTerm(request?.organisationNameInput ?? '');
    setSearchResults([]);
    setSearchError(null);
  }, [request?.id]);

  async function searchOrganisations() {
    const query = searchTerm.trim();
    setSearchError(null);
    if (query.length < 2) {
      setSearchResults([]);
      setSearchError('Saisissez au moins 2 caracteres.');
      return;
    }

    setSearching(true);
    try {
      const { data } = await api.get('/account-requests/organisations/search', {
        params: { q: query },
      });
      setSearchResults(data);
      if (data.length === 0) {
        setSearchError('Aucun organisme trouve pour cette recherche.');
      }
    } catch (err) {
      setSearchError(apiErrorMessage(err, 'Recherche organisme impossible.'));
    } finally {
      setSearching(false);
    }
  }

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    searchOrganisations();
  }

  if (!request) {
    return (
      <aside className="rounded-lg border border-anac-border bg-white p-5 shadow-sm">
        <EmptyState
          title="Aucune demande selectionnee"
          description="Selectionnez une demande dans la liste."
          className="min-h-[220px]"
        />
      </aside>
    );
  }

  const candidatePool = mergeCandidates(request.candidates, searchResults);
  const selectedCandidate = candidatePool.find(
    (candidate) => candidate.id === selectedOrganisationId
  );

  return (
    <aside className="h-fit rounded-lg border border-anac-border bg-white shadow-sm xl:sticky xl:top-6">
      <div className="border-b border-anac-border p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-anac-muted">Details de la demande</p>
            <h2 className="mt-2 text-xl font-semibold text-anac-navy">
              {request.organisationNameInput}
            </h2>
            <p className="mt-1 text-sm text-anac-muted">
              ID: REQ-{String(request.id).padStart(6, '0')}
            </p>
          </div>
          <StatusBadge label="En attente" tone={STATUS_STYLES.pending} />
        </div>
      </div>

      <div className="space-y-4 p-5">
        <PanelBlock title="Informations sur la demande" icon={FileClock}>
          <Info label="Type de demande" value="Creation de compte" />
          <Info label="Soumise le" value={formatDateTime(request.submittedAt)} />
          <Info label="Statut actuel" value="En attente" />
        </PanelBlock>

        <PanelBlock title="Organisation" icon={Building2}>
          <Info label="Raison sociale" value={request.organisationNameInput} />
          <Info label="Email organisme" value={request.requestedEmail} />
          <Info label="Telephone" value={request.phone ?? '-'} />
          <Info label="Agrement" value={request.originalApprovalNumber ?? 'Non renseigne'} />
          <p className="pt-2 text-xs leading-relaxed text-anac-muted">{request.legalAddress}</p>
        </PanelBlock>

        <PanelBlock title="Contact demandeur" icon={UserRound}>
          <Info label="Nom complet" value={request.contactFullName} />
          <Info label="Email" value={request.contactEmail} />
          <Info label="Telephone" value={request.contactPhone ?? '-'} />
        </PanelBlock>

        <PanelBlock title="Correspondance organisme" icon={ShieldCheck}>
          <p className="text-xs text-anac-muted">
            Liez a un organisme existant si le nom soumis est une variante ou un sigle.
          </p>
          <form onSubmit={handleSearchSubmit} className="mt-3 flex gap-2">
            <input
              className="h-9 min-w-0 flex-1 rounded-md border border-anac-border px-3 text-sm outline-none focus:border-anac-blue focus:ring-2 focus:ring-anac-blue/15"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Nom, sigle, email ou agrement"
            />
            <Button type="submit" size="sm" variant="secondary" disabled={searching}>
              {searching ? '...' : 'Chercher'}
            </Button>
          </form>
          {searchError ? <p className="mt-2 text-xs text-anac-muted">{searchError}</p> : null}
          <div className="mt-3 space-y-2">
            {candidatePool.length === 0 ? (
              <div className="rounded-lg border border-dashed border-anac-border p-3 text-xs text-anac-muted">
                Aucun organisme similaire detecte. La creation d'un organisme canonical reste
                possible.
              </div>
            ) : (
              candidatePool.slice(0, 5).map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => setSelectedOrganisationId(candidate.id)}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition',
                    selectedOrganisationId === candidate.id
                      ? 'border-anac-blue bg-anac-blue/5'
                      : 'border-anac-border hover:border-anac-blue/40'
                  )}
                >
                  <span className="block text-sm font-semibold text-anac-navy">
                    {candidate.name}
                  </span>
                  <span className="block text-xs text-anac-blue">{candidate.matchReason}</span>
                  <span className="mt-1 block text-xs text-anac-muted">
                    {candidate.legalAddress}
                  </span>
                </button>
              ))
            )}
          </div>
          {selectedCandidate ? (
            <p className="text-xs text-anac-success">
              Approbation preparee avec liaison a {selectedCandidate.name}.
            </p>
          ) : null}
        </PanelBlock>

        <PanelBlock title="Profil du contact" icon={UserCog}>
          <div className="grid gap-2">
            {Object.entries(CONTACT_ORDER_LABELS).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setContactOrder(value)}
                className={cn(
                  'rounded-md border px-3 py-2 text-left text-xs font-semibold transition',
                  contactOrder === value
                    ? 'border-anac-navy bg-anac-navy text-white'
                    : 'border-anac-border bg-white text-anac-muted hover:text-anac-navy'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </PanelBlock>

        <div className="grid gap-2">
          <Button
            type="button"
            disabled={busy || selectedOrganisationId === null}
            onClick={() =>
              selectedOrganisationId &&
              onApprove(request.id, { organisationId: selectedOrganisationId, contactOrder })
            }
          >
            Approuver et lier au compte organisme
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => onApprove(request.id, { createOrganisation: true, contactOrder })}
          >
            Approuver et creer un nouvel organisme
          </Button>
        </div>

        <div className="rounded-lg border border-anac-border p-4">
          <label className="text-xs font-semibold text-anac-muted" htmlFor="reject-reason">
            Motif de rejet
          </label>
          <textarea
            id="reject-reason"
            className="mt-2 min-h-20 w-full rounded-md border border-anac-border px-3 py-2 text-sm outline-none focus:border-anac-blue focus:ring-2 focus:ring-anac-blue/15"
            value={rejectionReason}
            onChange={(event) => setRejectionReason(event.target.value)}
            placeholder="Motif obligatoire en cas de rejet"
          />
          <Button
            type="button"
            variant="destructive"
            className="mt-2 w-full"
            disabled={busy || rejectionReason.trim().length === 0}
            onClick={() => onReject(request.id, rejectionReason)}
          >
            Rejeter la demande
          </Button>
        </div>
      </div>
    </aside>
  );
}

function PanelBlock({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof UserCheck;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-anac-border p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-anac-navy">
        <Icon size={14} aria-hidden="true" />
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-anac-muted">{label}</span>
      <span className="text-right font-semibold text-anac-navy">{value}</span>
    </div>
  );
}

function mergeCandidates(
  initial: OrganisationCandidate[],
  searchResults: OrganisationCandidate[]
): OrganisationCandidate[] {
  return [
    ...new Map(
      [...initial, ...searchResults].map((candidate) => [candidate.id, candidate])
    ).values(),
  ];
}

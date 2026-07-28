import { useEffect, useState } from 'react';
import { RefreshCw, UserCheck } from 'lucide-react';
import { api, apiErrorMessage } from '../../lib/axios';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';

interface OrganisationCandidate {
  id: number;
  name: string;
  legalAddress: string;
  email: string | null;
  phone: string | null;
  originalApprovalNumber: string | null;
  matchReason: string;
}

interface AccountRequestView {
  id: number;
  organisationNameInput: string;
  legalAddress: string;
  requestedEmail: string;
  phone: string | null;
  originalApprovalNumber: string | null;
  contactFullName: string;
  contactEmail: string;
  contactPhone: string | null;
  status: string;
  rejectionReason: string | null;
  submittedAt: string;
  candidates: OrganisationCandidate[];
}

interface ApplicantAccountView {
  id: number;
  organisationId: number;
  organisationName: string;
  fullName: string;
  email: string;
  phone: string | null;
  contactOrder: string;
  active: boolean;
  createdAt: string;
}

const CONTACT_ORDER_LABELS: Record<string, string> = {
  primary: 'Principal',
  secondary: 'Secondaire',
  tertiary: 'Tertiaire',
};

export default function AccountRequestsPage() {
  const [tab, setTab] = useState<'pending' | 'accounts'>('pending');
  const [requests, setRequests] = useState<AccountRequestView[]>([]);
  const [accounts, setAccounts] = useState<ApplicantAccountView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function loadRequests() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/account-requests?status=pending');
      setRequests(data);
    } catch (err) {
      setError(apiErrorMessage(err, 'Impossible de charger les demandes de compte.'));
    } finally {
      setLoading(false);
    }
  }

  async function loadAccounts() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/account-requests/applicants');
      setAccounts(data);
    } catch (err) {
      setError(apiErrorMessage(err, 'Impossible de charger les comptes postulants.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tab === 'pending') loadRequests();
    else loadAccounts();
  }, [tab]);

  async function handleApprove(
    requestId: number,
    payload: { organisationId?: number; createOrganisation?: boolean; contactOrder: string }
  ) {
    setActionError(null);
    setBusyId(requestId);
    try {
      await api.post(`/account-requests/${requestId}/approve`, payload);
      await loadRequests();
      await loadAccounts();
    } catch (err) {
      setActionError(apiErrorMessage(err, "Impossible d'approuver la demande."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(requestId: number, rejectionReason: string) {
    setActionError(null);
    setBusyId(requestId);
    try {
      await api.post(`/account-requests/${requestId}/reject`, { rejectionReason });
      await loadRequests();
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Impossible de rejeter la demande.'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleAccount(id: number, active: boolean) {
    setActionError(null);
    setBusyId(id);
    try {
      await api.patch(`/account-requests/applicants/${id}/activation`, { active });
      await loadAccounts();
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Modification du compte impossible.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-anac-navy/8 flex items-center justify-center">
            <UserCheck size={18} className="text-anac-navy" />
          </div>
          <div>
            <h1 className="text-anac-navy text-xl font-semibold">Comptes postulants</h1>
            <p className="text-anac-muted text-sm">
              Validation des demandes et gestion des comptes portail
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => (tab === 'pending' ? loadRequests() : loadAccounts())}
          className="inline-flex items-center gap-1 text-xs text-anac-muted hover:text-anac-navy"
        >
          <RefreshCw size={12} />
          Actualiser
        </button>
      </div>

      <div className="flex gap-2 border-b border-anac-border">
        <TabButton active={tab === 'pending'} onClick={() => setTab('pending')}>
          Demandes en attente
        </TabButton>
        <TabButton active={tab === 'accounts'} onClick={() => setTab('accounts')}>
          Comptes approuves
        </TabButton>
      </div>

      {actionError && <p className="text-anac-danger text-sm">{actionError}</p>}

      {loading ? (
        <div className="card text-anac-muted">Chargement...</div>
      ) : error ? (
        <div className="card text-anac-danger">{error}</div>
      ) : tab === 'accounts' ? (
        <ApplicantAccountsTable
          accounts={accounts}
          busyId={busyId}
          onToggle={handleToggleAccount}
        />
      ) : requests.length === 0 ? (
        <div className="card text-anac-muted">Aucune demande de compte en attente.</div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <AccountRequestCard
              key={request.id}
              request={request}
              busy={busyId === request.id}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 ${
        active
          ? 'border-anac-navy text-anac-navy'
          : 'border-transparent text-anac-muted hover:text-anac-navy'
      }`}
    >
      {children}
    </button>
  );
}

function AccountRequestCard({
  request,
  busy,
  onApprove,
  onReject,
}: {
  request: AccountRequestView;
  busy: boolean;
  onApprove: (
    requestId: number,
    payload: { organisationId?: number; createOrganisation?: boolean; contactOrder: string }
  ) => void;
  onReject: (requestId: number, rejectionReason: string) => void;
}) {
  const [selectedOrganisationId, setSelectedOrganisationId] = useState<number | null>(
    request.candidates[0]?.id ?? null
  );
  const [contactOrder, setContactOrder] = useState('primary');
  const [rejectionReason, setRejectionReason] = useState('');
  const [searchTerm, setSearchTerm] = useState(request.organisationNameInput);
  const [searchResults, setSearchResults] = useState<OrganisationCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

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

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-anac-navy font-semibold">{request.organisationNameInput}</h2>
          <p className="text-xs text-anac-muted">
            Envoyee le {new Date(request.submittedAt).toLocaleString('fr-FR')}
          </p>
        </div>
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-anac-warning/10 text-anac-warning">
          En revue
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-4 text-sm">
        <InfoBlock
          title="Organisme soumis"
          lines={[
            request.legalAddress,
            `Email: ${request.requestedEmail}`,
            request.phone ? `Tel: ${request.phone}` : null,
            request.originalApprovalNumber
              ? `Agrement: ${request.originalApprovalNumber}`
              : 'Agrement non renseigne',
          ]}
        />
        <InfoBlock
          title="Contact"
          lines={[
            request.contactFullName,
            request.contactEmail,
            request.contactPhone ? `Tel: ${request.contactPhone}` : null,
          ]}
        />
      </div>

      <div>
        <Label>Correspondances organisme</Label>
        {request.candidates.length === 0 ? (
          <p className="text-sm text-anac-muted mt-1">
            Aucun organisme similaire trouve automatiquement.
          </p>
        ) : (
          <div className="space-y-2 mt-2">
            {request.candidates.map((candidate) => (
              <label
                key={candidate.id}
                className={`block rounded-lg border p-3 cursor-pointer ${
                  selectedOrganisationId === candidate.id
                    ? 'border-anac-navy bg-anac-navy/5'
                    : 'border-anac-border'
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="radio"
                    name={`organisation-${request.id}`}
                    checked={selectedOrganisationId === candidate.id}
                    onChange={() => setSelectedOrganisationId(candidate.id)}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-medium text-anac-navy">{candidate.name}</p>
                    <p className="text-xs text-anac-muted">{candidate.matchReason}</p>
                    <p className="text-xs text-anac-muted mt-1">{candidate.legalAddress}</p>
                    <p className="text-xs text-anac-muted">
                      {[candidate.email, candidate.phone, candidate.originalApprovalNumber]
                        .filter(Boolean)
                        .join(' - ')}
                    </p>
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-anac-border p-3 space-y-2">
        <Label>Rechercher un organisme existant</Label>
        <p className="text-xs text-anac-muted">
          Utilisez cette recherche si le nom soumis est un sigle ou une variante connue, par
          exemple ADL pour Aeroport de Libreville.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            className="input h-9 min-w-64 flex-1"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                searchOrganisations();
              }
            }}
            placeholder="Nom, sigle, email ou numero d'agrement"
          />
          <Button type="button" size="sm" variant="secondary" disabled={searching} onClick={searchOrganisations}>
            {searching ? 'Recherche...' : 'Rechercher'}
          </Button>
        </div>
        {searchError && <p className="text-xs text-anac-muted">{searchError}</p>}
        {searchResults.length > 0 && (
          <div className="space-y-2">
            {searchResults.map((candidate) => (
              <label
                key={candidate.id}
                className={`block rounded-lg border p-3 cursor-pointer ${
                  selectedOrganisationId === candidate.id
                    ? 'border-anac-navy bg-anac-navy/5'
                    : 'border-anac-border'
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="radio"
                    name={`organisation-${request.id}`}
                    checked={selectedOrganisationId === candidate.id}
                    onChange={() => setSelectedOrganisationId(candidate.id)}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-medium text-anac-navy">{candidate.name}</p>
                    <p className="text-xs text-anac-muted">{candidate.matchReason}</p>
                    <p className="text-xs text-anac-muted mt-1">{candidate.legalAddress}</p>
                    <p className="text-xs text-anac-muted">
                      {[candidate.email, candidate.phone, candidate.originalApprovalNumber]
                        .filter(Boolean)
                        .join(' - ')}
                    </p>
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <Label>Ordre du contact</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          {Object.entries(CONTACT_ORDER_LABELS).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setContactOrder(value)}
              className={`px-3 py-1.5 rounded text-xs font-medium border ${
                contactOrder === value
                  ? 'bg-anac-navy text-white border-anac-navy'
                  : 'bg-white text-anac-muted border-anac-border'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || selectedOrganisationId === null}
          onClick={() =>
            selectedOrganisationId &&
            onApprove(request.id, { organisationId: selectedOrganisationId, contactOrder })
          }
        >
          Approuver et lier a l'organisme selectionne
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => onApprove(request.id, { createOrganisation: true, contactOrder })}
        >
          Approuver et creer un nouvel organisme
        </Button>
      </div>

      <div className="border-t border-anac-border pt-3">
        <Label>Motif de rejet</Label>
        <textarea
          className="input min-h-20"
          value={rejectionReason}
          onChange={(event) => setRejectionReason(event.target.value)}
          placeholder="Motif obligatoire en cas de rejet"
        />
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="mt-2"
          disabled={busy || rejectionReason.trim().length === 0}
          onClick={() => onReject(request.id, rejectionReason)}
        >
          Rejeter la demande
        </Button>
      </div>
    </section>
  );
}

function ApplicantAccountsTable({
  accounts,
  busyId,
  onToggle,
}: {
  accounts: ApplicantAccountView[];
  busyId: number | null;
  onToggle: (id: number, active: boolean) => void;
}) {
  if (accounts.length === 0) {
    return <div className="card text-anac-muted">Aucun compte postulant approuve.</div>;
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-anac-muted border-b border-anac-border">
            <th className="pb-2 pr-4">Contact</th>
            <th className="pb-2 pr-4">Organisme</th>
            <th className="pb-2 pr-4">Ordre</th>
            <th className="pb-2 pr-4">Statut</th>
            <th className="pb-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => (
            <tr key={account.id} className="border-b border-anac-border last:border-0">
              <td className="py-2 pr-4">
                <p className="font-medium text-anac-navy">{account.fullName}</p>
                <p className="text-xs text-anac-muted">{account.email}</p>
                {account.phone && <p className="text-xs text-anac-muted">{account.phone}</p>}
              </td>
              <td className="py-2 pr-4">{account.organisationName}</td>
              <td className="py-2 pr-4 text-anac-muted">
                {CONTACT_ORDER_LABELS[account.contactOrder] ?? account.contactOrder}
              </td>
              <td className="py-2 pr-4">
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                    account.active
                      ? 'bg-anac-success/10 text-anac-success'
                      : 'bg-anac-muted/10 text-anac-muted'
                  }`}
                >
                  {account.active ? 'Actif' : 'Inactif'}
                </span>
              </td>
              <td className="py-2">
                <button
                  type="button"
                  disabled={busyId === account.id}
                  onClick={() => onToggle(account.id, !account.active)}
                  className="text-anac-blue underline text-xs disabled:opacity-50"
                >
                  {account.active ? 'Desactiver' : 'Activer'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InfoBlock({ title, lines }: { title: string; lines: (string | null)[] }) {
  return (
    <div className="rounded-lg border border-anac-border p-3">
      <p className="text-xs font-semibold text-anac-navy mb-2">{title}</p>
      <div className="space-y-1">
        {lines.filter(Boolean).map((line) => (
          <p key={line} className="text-xs text-anac-muted">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

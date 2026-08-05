import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileClock,
  History,
  LockKeyhole,
  MoreVertical,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserRound,
  XCircle,
} from 'lucide-react';
import { api, apiErrorMessage } from '../../lib/axios';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/common/EmptyState';
import { SelectableTableRow } from '../../components/common/SelectableTableRow';
import { StatusBadge } from '../../components/common/StatusBadge';
import { TableState } from '../../components/common/TableState';
import { Pagination, paginate } from '../../components/ui/pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { cn } from '../../lib/utils';

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
  primary: 'Responsable principal',
  secondary: 'Utilisateur secondaire',
  tertiary: 'Utilisateur tertiaire',
};

const CONTACT_ORDER_SHORT: Record<string, string> = {
  primary: 'Responsable',
  secondary: 'Utilisateur',
  tertiary: 'Utilisateur',
};

const STATUS_STYLES = {
  pending: 'border-orange-100 bg-orange-50 text-anac-warning',
  active: 'border-green-100 bg-green-50 text-anac-success',
  suspended: 'border-orange-100 bg-orange-50 text-anac-warning',
  rejected: 'border-red-100 bg-red-50 text-anac-danger',
};

type Tab = 'pending' | 'accounts';

const PAGE_SIZE = 8;

export default function AccountRequestsPage() {
  const [tab, setTab] = useState<Tab>('pending');
  const [requests, setRequests] = useState<AccountRequestView[]>([]);
  const [accounts, setAccounts] = useState<ApplicantAccountView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  function updateTab(value: Tab) {
    setTab(value);
    setPage(1);
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  async function loadRequests() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/account-requests?status=pending');
      setRequests(data);
      setSelectedRequestId((current) => current ?? data[0]?.id ?? null);
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
      setSelectedAccountId((current) => current ?? data[0]?.id ?? null);
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
      setSelectedRequestId(null);
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
      setSelectedRequestId(null);
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

  const filteredRequests = useMemo(() => {
    const needle = normalize(search);
    return requests.filter((request) =>
      normalize(
        `${request.organisationNameInput} ${request.contactFullName} ${request.contactEmail} ${request.requestedEmail}`
      ).includes(needle)
    );
  }, [requests, search]);

  const filteredAccounts = useMemo(() => {
    const needle = normalize(search);
    return accounts.filter((account) =>
      normalize(`${account.organisationName} ${account.fullName} ${account.email}`).includes(needle)
    );
  }, [accounts, search]);

  const selectedRequest =
    filteredRequests.find((request) => request.id === selectedRequestId) ??
    filteredRequests[0] ??
    null;
  const selectedAccount =
    filteredAccounts.find((account) => account.id === selectedAccountId) ??
    filteredAccounts[0] ??
    null;

  const pagedRequests = paginate(filteredRequests, page, PAGE_SIZE);
  const pagedAccounts = paginate(filteredAccounts, page, PAGE_SIZE);

  const activeAccounts = accounts.filter((account) => account.active).length;
  const suspendedAccounts = accounts.filter((account) => !account.active).length;
  const newAccountsThisMonth = accounts.filter((account) => isThisMonth(account.createdAt)).length;
  const averageRequestAge = average(
    requests.map((request) => daysBetween(request.submittedAt, new Date().toISOString()))
  );

  const metrics =
    tab === 'pending'
      ? [
          {
            label: 'Demandes en attente',
            value: requests.length,
            helper: 'A valider par DN/SU',
            icon: Clock3,
            tone: 'warning' as const,
          },
          {
            label: 'Correspondances detectees',
            value: requests.filter((request) => request.candidates.length > 0).length,
            helper: 'Organismes similaires proposes',
            icon: Building2,
            tone: 'info' as const,
          },
          {
            label: 'Sans correspondance',
            value: requests.filter((request) => request.candidates.length === 0).length,
            helper: 'Creation organisme probable',
            icon: AlertTriangle,
            tone: 'danger' as const,
          },
          {
            label: 'Age moyen',
            value: averageRequestAge === null ? '-' : `${averageRequestAge} j`,
            helper: 'Depuis soumission portail',
            icon: FileClock,
            tone: 'info' as const,
          },
        ]
      : [
          {
            label: 'Comptes actifs',
            value: activeAccounts,
            helper: 'Acces portail autorise',
            icon: UserCheck,
            tone: 'success' as const,
          },
          {
            label: 'Comptes suspendus',
            value: suspendedAccounts,
            helper: 'Acces portail bloque',
            icon: LockKeyhole,
            tone: suspendedAccounts > 0 ? ('warning' as const) : ('success' as const),
          },
          {
            label: 'Nouveaux ce mois',
            value: newAccountsThisMonth,
            helper: 'Comptes approuves recemment',
            icon: UserCog,
            tone: 'info' as const,
          },
          {
            label: 'Derniere connexion',
            value: '-',
            helper: 'Suivi prevu ulterieurement',
            icon: Activity,
            tone: 'info' as const,
          },
        ];

  return (
    <div className="-m-6 min-h-full bg-[#f8fafc] text-anac-text">
      <main className="mx-auto max-w-[1500px] px-6 py-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-anac-navy/8">
              <UserCheck size={16} className="text-anac-navy" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold leading-tight text-anac-navy">
                Comptes postulants
              </h1>
              <p className="mt-1 text-sm text-anac-muted">
                Validation des demandes et gestion des comptes portail
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => (tab === 'pending' ? loadRequests() : loadAccounts())}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-anac-border bg-white px-3 text-sm font-semibold text-anac-navy transition hover:bg-anac-blue/5"
            >
              <RefreshCw size={14} aria-hidden="true" />
              Actualiser
            </button>
            <label className="relative block">
              <span className="sr-only">Rechercher</span>
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-anac-muted"
                aria-hidden="true"
              />
              <input
                value={search}
                onChange={(event) => updateSearch(event.target.value)}
                className="h-9 w-[300px] rounded-md border border-anac-border bg-white pl-9 pr-3 text-sm outline-none transition focus:border-anac-blue focus:ring-2 focus:ring-anac-blue/15"
                placeholder={
                  tab === 'pending' ? 'Rechercher une demande...' : 'Rechercher un compte...'
                }
              />
            </label>
          </div>
        </header>

        <nav className="mt-6 flex gap-4 border-b border-anac-border">
          <TabButton
            active={tab === 'pending'}
            count={requests.length}
            onClick={() => {
              updateTab('pending');
              setActionError(null);
            }}
          >
            Demandes en attente
          </TabButton>
          <TabButton
            active={tab === 'accounts'}
            count={accounts.length}
            onClick={() => {
              updateTab('accounts');
              setActionError(null);
            }}
          >
            Comptes approuves
          </TabButton>
        </nav>

        {actionError ? (
          <div className="mt-4 rounded-lg border border-anac-danger/20 bg-red-50 px-4 py-3 text-sm text-anac-danger">
            {actionError}
          </div>
        ) : null}

        <section
          className="mt-5 grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}
        >
          {metrics.map((metric) => (
            <MetricCard key={metric.label} metric={metric} />
          ))}
        </section>

        <section
          className="mt-5 grid items-start gap-5"
          style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 360px)' }}
        >
          <div className="min-w-0 overflow-hidden rounded-lg border border-anac-border bg-white shadow-sm">
            {loading ? (
              <TableState
                state="loading"
                title="Chargement"
                description="Recuperation des comptes postulants."
                className="min-h-[220px]"
              />
            ) : error ? (
              <TableState
                state="error"
                title="Chargement impossible"
                description={error}
                className="min-h-[220px]"
              />
            ) : tab === 'pending' ? (
              <>
                <PendingRequestsTable
                  requests={pagedRequests.pageItems}
                  selectedId={selectedRequest?.id ?? null}
                  onSelect={(request) => {
                    setSelectedRequestId(request.id);
                    setActionError(null);
                  }}
                />
                <Pagination
                  label={`${filteredRequests.length} demande(s) en attente`}
                  page={pagedRequests.page}
                  totalPages={pagedRequests.totalPages}
                  onPageChange={setPage}
                />
              </>
            ) : (
              <>
                <ApplicantAccountsTable
                  accounts={pagedAccounts.pageItems}
                  selectedId={selectedAccount?.id ?? null}
                  onSelect={(account) => {
                    setSelectedAccountId(account.id);
                    setActionError(null);
                  }}
                />
                <Pagination
                  label={`${filteredAccounts.length} compte(s) approuve(s)`}
                  page={pagedAccounts.page}
                  totalPages={pagedAccounts.totalPages}
                  onPageChange={setPage}
                />
              </>
            )}
          </div>

          {tab === 'pending' ? (
            <PendingRequestPanel
              request={selectedRequest}
              busy={busyId === selectedRequest?.id}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ) : (
            <ApprovedAccountPanel
              account={selectedAccount}
              busy={busyId === selectedAccount?.id}
              onToggle={handleToggleAccount}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function TabButton({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition',
        active
          ? 'border-anac-blue text-anac-blue'
          : 'border-transparent text-anac-muted hover:text-anac-navy'
      )}
    >
      {children}
      <span className="rounded-full bg-anac-blue/10 px-2 py-0.5 text-[11px] text-anac-blue">
        {count}
      </span>
    </button>
  );
}

function MetricCard({
  metric,
}: {
  metric: {
    label: string;
    value: string | number;
    helper: string;
    icon: typeof UserCheck;
    tone: 'info' | 'warning' | 'success' | 'danger';
  };
}) {
  const Icon = metric.icon;
  return (
    <div className="min-h-[132px] rounded-lg border border-anac-border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold text-anac-muted">{metric.label}</p>
          <p className="mt-2 text-[26px] font-semibold leading-none text-anac-navy">
            {metric.value}
          </p>
        </div>
        <div className={cn('rounded-lg border p-2.5', toneClass(metric.tone))}>
          <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
        </div>
      </div>
      <p className="mt-4 text-[11px] text-anac-muted">{metric.helper}</p>
    </div>
  );
}

function PendingRequestsTable({
  requests,
  selectedId,
  onSelect,
}: {
  requests: AccountRequestView[];
  selectedId: number | null;
  onSelect: (request: AccountRequestView) => void;
}) {
  if (requests.length === 0) {
    return (
      <TableState
        state="empty"
        title="Aucune demande en attente"
        description="Les demandes envoyees depuis le portail apparaitront ici."
        className="min-h-[220px]"
      />
    );
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-anac-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-anac-navy">
            {requests.length} demande(s) en attente
          </h2>
          <p className="text-xs text-anac-muted">
            Selectionnez une demande pour verifier l'organisme.
          </p>
        </div>
      </div>
      <Table className="min-w-[860px]">
        <TableHeader>
          <TableRow>
            <TableHead>Organisation</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Soumise le</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => (
            <SelectableTableRow
              key={request.id}
              selected={selectedId === request.id}
              onSelect={() => onSelect(request)}
              ariaLabel={`Selectionner la demande de compte ${request.organisationNameInput}`}
            >
              <TableCell>
                <p className="font-semibold text-anac-navy">{request.organisationNameInput}</p>
                <p className="text-xs text-anac-muted">
                  {request.originalApprovalNumber ?? 'Agrement non renseigne'}
                </p>
              </TableCell>
              <TableCell>{request.contactFullName}</TableCell>
              <TableCell className="text-anac-muted">{request.contactEmail}</TableCell>
              <TableCell>{formatDateTime(request.submittedAt)}</TableCell>
              <TableCell>
                <StatusBadge label="En attente" tone={STATUS_STYLES.pending} />
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  onClick={() => onSelect(request)}
                  className="rounded-md border border-anac-border p-1.5 text-anac-blue"
                >
                  <Eye size={14} aria-hidden="true" />
                  <span className="sr-only">Voir la demande</span>
                </button>
              </TableCell>
            </SelectableTableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

function ApplicantAccountsTable({
  accounts,
  selectedId,
  onSelect,
}: {
  accounts: ApplicantAccountView[];
  selectedId: number | null;
  onSelect: (account: ApplicantAccountView) => void;
}) {
  if (accounts.length === 0) {
    return (
      <TableState
        state="empty"
        title="Aucun compte approuve"
        description="Les comptes approuves apparaitront ici apres validation."
        className="min-h-[220px]"
      />
    );
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-anac-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-anac-navy">
            {accounts.length} compte(s) approuve(s)
          </h2>
          <p className="text-xs text-anac-muted">
            Selectionnez un compte pour consulter son profil.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-md border border-anac-border px-3 py-1.5 text-xs font-semibold text-anac-navy">
          <Download size={14} aria-hidden="true" />
          Exporter
        </button>
      </div>
      <Table className="min-w-[940px]">
        <TableHeader>
          <TableRow>
            <TableHead>Organisation</TableHead>
            <TableHead>Responsable</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Profil</TableHead>
            <TableHead>Date d&apos;approbation</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <SelectableTableRow
              key={account.id}
              selected={selectedId === account.id}
              onSelect={() => onSelect(account)}
              ariaLabel={`Selectionner le compte postulant ${account.fullName} de ${account.organisationName}`}
            >
              <TableCell>
                <p className="font-semibold text-anac-navy">{account.organisationName}</p>
                <p className="text-xs text-anac-muted">Organisation #{account.organisationId}</p>
              </TableCell>
              <TableCell>
                <p>{account.fullName}</p>
                {account.phone ? <p className="text-xs text-anac-muted">{account.phone}</p> : null}
              </TableCell>
              <TableCell className="text-anac-muted">{account.email}</TableCell>
              <TableCell>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-anac-muted">
                  {CONTACT_ORDER_SHORT[account.contactOrder] ?? account.contactOrder}
                </span>
              </TableCell>
              <TableCell>{formatDateTime(account.createdAt)}</TableCell>
              <TableCell>
                <StatusBadge
                  label={account.active ? 'Actif' : 'Suspension'}
                  tone={STATUS_STYLES[account.active ? 'active' : 'suspended']}
                />
              </TableCell>
              <TableCell>
                <MoreVertical size={14} className="text-anac-muted" aria-hidden="true" />
              </TableCell>
            </SelectableTableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

function PendingRequestPanel({
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

function ApprovedAccountPanel({
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

function FutureLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md bg-slate-50 px-3 py-2 text-sm">
      <span className="text-anac-muted">{label}</span>
      <span className="rounded bg-white px-2 py-0.5 text-[11px] font-semibold text-anac-muted">
        {value}
      </span>
    </div>
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

function toneClass(tone: 'info' | 'warning' | 'success' | 'danger'): string {
  if (tone === 'success') return 'border-green-100 bg-green-50 text-anac-success';
  if (tone === 'warning') return 'border-orange-100 bg-orange-50 text-anac-warning';
  if (tone === 'danger') return 'border-red-100 bg-red-50 text-anac-danger';
  return 'border-blue-100 bg-blue-50 text-anac-blue';
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

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function daysBetween(start: string, end: string): number {
  return Math.max(
    0,
    Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24))
  );
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function isThisMonth(value: string): boolean {
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

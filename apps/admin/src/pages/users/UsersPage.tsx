import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  UserPlus,
  Users,
} from 'lucide-react';
import { api, apiErrorMessage } from '../../lib/axios';
import { listPersonnelAnac, searchPersonnelAnac } from '../../lib/api/personnel-anac.api';
import type { PersonnelAnacResult } from '../../lib/api/personnel-anac.types';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useAuth } from '../../hooks/useAuth';

interface UserView {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string;
  roles: string[];
  active: boolean;
  firstLogin: boolean;
  createdAt: string;
}

interface PrefillUser {
  employeeCode: string;
  fullName: string;
}

const ROLE_LABELS: Record<string, string> = {
  reception: 'Reception',
  assistant_dg: 'Assistant DG',
  dn_agent: 'Agent DN',
  dn_supervisor: 'Superviseur DN',
  r3_agent: 'Agent R3',
  s5_agent: 'Agent S5',
  SU: 'Super Admin',
};

const ALL_ROLES = Object.keys(ROLE_LABELS);
const PERSONNEL_ANAC_PAGE_SIZE = 8;

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [tab, setTab] = useState<'users' | 'personnel'>('users');
  const [users, setUsers] = useState<UserView[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [prefill, setPrefill] = useState<PrefillUser | null>(null);
  const currentUserRoles = currentUser?.roles ?? [];
  const canManageAccounts = currentUserRoles.includes('SU');
  const canEditRoles = currentUserRoles.some((role) => role === 'SU' || role === 'dn_supervisor');

  async function loadUsers() {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const { data } = await api.get('/users');
      setUsers(data.data);
    } catch (err) {
      setUsersError(apiErrorMessage(err, 'Impossible de charger les utilisateurs.'));
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function openManualCreation() {
    if (!canManageAccounts) return;
    setPrefill(null);
    setFormOpen(true);
  }

  function openAnacCreation(personnel: PersonnelAnacResult) {
    if (!canManageAccounts) return;
    setPrefill({ employeeCode: personnel.employeeCode, fullName: personnel.fullName });
    setFormOpen(true);
    setTab('users');
  }

  async function handleToggle(id: number, active: boolean) {
    setActionError(null);
    setBusyId(id);
    try {
      await api.patch(`/users/${id}/activation`, { active });
      await loadUsers();
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Action impossible.'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleResetOtp(id: number) {
    setActionError(null);
    setBusyId(id);
    try {
      const { data } = await api.post(`/users/${id}/reset-otp`);
      if (data.emailSent === false) {
        setActionError("OTP reinitialise, mais l'email n'a pas pu etre envoye.");
      }
      await loadUsers();
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Reinitialisation impossible.'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleUpdateRoles(id: number, roles: string[]) {
    setActionError(null);
    setBusyId(id);
    try {
      await api.patch(`/users/${id}/roles`, { roles });
      await loadUsers();
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Modification des roles impossible.'));
      throw err;
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-anac-navy/8 flex items-center justify-center">
            <Users size={18} className="text-anac-navy" />
          </div>
          <div>
            <h1 className="text-anac-navy text-xl font-semibold">Utilisateurs</h1>
            <p className="text-anac-muted text-sm">
              Comptes internes, activation OTP et annuaire Personnel ANAC
            </p>
          </div>
        </div>
        {tab === 'users' && canManageAccounts && (
          <Button onClick={openManualCreation} className="gap-1.5">
            <UserPlus size={14} />
            Nouvel utilisateur
          </Button>
        )}
      </div>

      <div className="flex gap-2 border-b border-anac-border">
        <TabButton active={tab === 'users'} onClick={() => setTab('users')}>
          Utilisateurs AIDN
        </TabButton>
        {canManageAccounts && (
          <TabButton active={tab === 'personnel'} onClick={() => setTab('personnel')}>
            Personnel ANAC
          </TabButton>
        )}
      </div>

      {formOpen && canManageAccounts && (
        <CreateUserForm
          key={prefill?.employeeCode ?? 'manual'}
          prefill={prefill}
          onCancel={() => {
            setFormOpen(false);
            setPrefill(null);
          }}
          onCreated={async (emailSent) => {
            setFormOpen(false);
            setPrefill(null);
            setTab('users');
            if (!emailSent) setActionError("Compte cree, mais l'email OTP n'a pas pu etre envoye.");
            await loadUsers();
          }}
        />
      )}

      {actionError && <p className="text-anac-danger text-sm">{actionError}</p>}

      {tab === 'users' ? (
        <UsersTable
          users={users}
          loading={usersLoading}
          error={usersError}
          busyId={busyId}
          canManageAccounts={canManageAccounts}
          canEditRoles={canEditRoles}
          currentUserRoles={currentUserRoles}
          onToggle={handleToggle}
          onResetOtp={handleResetOtp}
          onUpdateRoles={handleUpdateRoles}
          onReload={loadUsers}
        />
      ) : (
        <PersonnelAnacTab
          onCreate={openAnacCreation}
          existingCodes={users.map((u) => u.employeeCode)}
        />
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

function UsersTable({
  users,
  loading,
  error,
  busyId,
  onToggle,
  onResetOtp,
  onUpdateRoles,
  onReload,
  canManageAccounts,
  canEditRoles,
  currentUserRoles,
}: {
  users: UserView[];
  loading: boolean;
  error: string | null;
  busyId: number | null;
  canManageAccounts: boolean;
  canEditRoles: boolean;
  currentUserRoles: string[];
  onToggle: (id: number, active: boolean) => void;
  onResetOtp: (id: number) => void;
  onUpdateRoles: (id: number, roles: string[]) => Promise<void>;
  onReload: () => void;
}) {
  const [editingUser, setEditingUser] = useState<UserView | null>(null);

  return (
    <div className="card">
      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={onReload}
          className="inline-flex items-center gap-1 text-xs text-anac-muted hover:text-anac-navy"
        >
          <RefreshCw size={12} />
          Actualiser
        </button>
      </div>

      {loading ? (
        <p className="text-anac-muted">Chargement...</p>
      ) : error ? (
        <p className="text-anac-danger">{error}</p>
      ) : (
        <div className="space-y-4">
          {editingUser && (
            <EditRolesForm
              user={editingUser}
              busy={busyId === editingUser.id}
              currentUserRoles={currentUserRoles}
              onCancel={() => setEditingUser(null)}
              onSaved={async (roles) => {
                await onUpdateRoles(editingUser.id, roles);
                setEditingUser(null);
              }}
            />
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-anac-muted border-b border-anac-border">
                  <th className="pb-2 pr-4">Matricule</th>
                  <th className="pb-2 pr-4">Nom</th>
                  <th className="pb-2 pr-4">Email</th>
                  <th className="pb-2 pr-4">Roles</th>
                  <th className="pb-2 pr-4">Statut</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const supervisorLockedFromSu = !currentUserRoles.includes('SU') && user.roles.includes('SU');
                  return (
                    <tr key={user.id} className="border-b border-anac-border last:border-0">
                      <td className="py-2 pr-4 font-medium">{user.employeeCode}</td>
                      <td className="py-2 pr-4">{user.fullName}</td>
                      <td className="py-2 pr-4 text-anac-muted">{user.email}</td>
                      <td className="py-2 pr-4 text-anac-muted text-xs">
                        {user.roles.map((role) => ROLE_LABELS[role] ?? role).join(', ')}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge active={user.active} firstLogin={user.firstLogin} />
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-2">
                          {canEditRoles && (
                            <button
                              className="text-anac-blue underline text-xs disabled:opacity-50 inline-flex items-center gap-1"
                              disabled={busyId === user.id || supervisorLockedFromSu}
                              onClick={() => setEditingUser(user)}
                              title={
                                supervisorLockedFromSu
                                  ? 'Seul un Super Admin peut modifier ce role.'
                                  : undefined
                              }
                            >
                              <ShieldCheck size={10} />
                              Roles
                            </button>
                          )}
                          {canManageAccounts && (
                            <>
                              <button
                                className="text-anac-blue underline text-xs disabled:opacity-50"
                                disabled={busyId === user.id}
                                onClick={() => onToggle(user.id, !user.active)}
                              >
                                {user.active ? 'Desactiver' : 'Activer'}
                              </button>
                              <button
                                className="text-anac-muted underline text-xs disabled:opacity-50 inline-flex items-center gap-1"
                                disabled={busyId === user.id}
                                onClick={() => onResetOtp(user.id)}
                              >
                                {busyId === user.id ? (
                                  <Loader2 size={10} className="animate-spin" />
                                ) : (
                                  <RotateCcw size={10} />
                                )}
                                Reinitialiser OTP
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function EditRolesForm({
  user,
  busy,
  currentUserRoles,
  onCancel,
  onSaved,
}: {
  user: UserView;
  busy: boolean;
  currentUserRoles: string[];
  onCancel: () => void;
  onSaved: (roles: string[]) => Promise<void>;
}) {
  const [roles, setRoles] = useState<string[]>(user.roles);
  const [error, setError] = useState<string | null>(null);
  const currentUserIsSU = currentUserRoles.includes('SU');

  function toggleRole(role: string) {
    if (role === 'SU' && !currentUserIsSU) return;
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (roles.length === 0) {
      setError('Selectionnez au moins un role.');
      return;
    }

    try {
      await onSaved(roles);
    } catch {
      setError('La modification des roles a echoue.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-anac-border rounded-lg p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-anac-navy">Roles de {user.fullName}</p>
          <p className="text-xs text-anac-muted">{user.employeeCode}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Annuler
        </Button>
      </div>

      {error && <p className="text-anac-danger text-sm">{error}</p>}

      <RoleSelector roles={roles} onToggle={toggleRole} suLocked={!currentUserIsSU} />

      <Button type="submit" size="sm" disabled={busy}>
        {busy ? 'Enregistrement...' : 'Enregistrer les roles'}
      </Button>
    </form>
  );
}

function StatusBadge({ active, firstLogin }: { active: boolean; firstLogin: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span
        className={`px-2 py-0.5 rounded text-xs font-medium ${
          active ? 'bg-anac-success/10 text-anac-success' : 'bg-anac-muted/10 text-anac-muted'
        }`}
      >
        {active ? 'Actif' : 'Inactif'}
      </span>
      {firstLogin && (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-anac-warning/10 text-anac-warning">
          1ere connexion
        </span>
      )}
    </div>
  );
}

function PersonnelAnacTab({
  onCreate,
  existingCodes,
}: {
  onCreate: (personnel: PersonnelAnacResult) => void;
  existingCodes: string[];
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonnelAnacResult[]>([]);
  const [mode, setMode] = useState<'list' | 'search'>('list');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const existing = useMemo(() => new Set(existingCodes), [existingCodes]);
  const totalPages = Math.max(1, Math.ceil(total / PERSONNEL_ANAC_PAGE_SIZE));
  const firstItem = total === 0 ? 0 : (page - 1) * PERSONNEL_ANAC_PAGE_SIZE + 1;
  const lastItem = Math.min(page * PERSONNEL_ANAC_PAGE_SIZE, total);

  async function loadPersonnelPage(nextPage: number) {
    setLoading(true);
    setError(null);
    try {
      const data = await listPersonnelAnac(nextPage, PERSONNEL_ANAC_PAGE_SIZE);
      setResults(data.data);
      setPage(data.page);
      setTotal(data.total);
      setMode('list');
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger l'annuaire Personnel ANAC."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPersonnelPage(1);
  }, []);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (query.trim().length < 2) {
      setError('Saisissez au moins 2 caracteres.');
      return;
    }

    setLoading(true);
    try {
      setResults(await searchPersonnelAnac(query.trim()));
      setMode('search');
      setPage(1);
      setTotal(0);
    } catch (err) {
      setError(apiErrorMessage(err, 'Recherche impossible.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="card flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <Label>Recherche Personnel ANAC</Label>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nom, prenom ou matricule"
          />
        </div>
        <Button type="submit" className="gap-1.5">
          <Search size={14} />
          Rechercher
        </Button>
        <Button type="button" variant="secondary" onClick={() => loadPersonnelPage(1)}>
          Liste
        </Button>
      </form>

      {error && <p className="text-anac-danger text-sm">{error}</p>}

      <div className="card overflow-x-auto">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-anac-muted">
            {mode === 'search'
              ? `${results.length} resultat${results.length > 1 ? 's' : ''} de recherche`
              : total === 0
                ? 'Aucun agent'
                : `${firstItem}-${lastItem} sur ${total} agents`}
          </p>
          {mode === 'list' && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={loading || page <= 1}
                onClick={() => loadPersonnelPage(page - 1)}
                aria-label="Page precedente"
                title="Page precedente"
              >
                <ChevronLeft size={14} />
              </Button>
              <span className="min-w-20 text-center text-xs text-anac-muted">
                Page {page} / {totalPages}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={loading || page >= totalPages}
                onClick={() => loadPersonnelPage(page + 1)}
                aria-label="Page suivante"
                title="Page suivante"
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-anac-muted">Chargement...</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-anac-muted border-b border-anac-border">
                <th className="pb-2 pr-4">Matricule</th>
                <th className="pb-2 pr-4">Nom</th>
                <th className="pb-2 pr-4">Organisation</th>
                <th className="pb-2 pr-4">Compte AIDN</th>
                <th className="pb-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {results.map((personnel) => {
                const hasAccount = personnel.hasAccount || existing.has(personnel.employeeCode);
                return (
                  <tr
                    key={personnel.employeeCode}
                    className="border-b border-anac-border last:border-0"
                  >
                    <td className="py-2 pr-4 font-medium">{personnel.employeeCode}</td>
                    <td className="py-2 pr-4">{personnel.fullName || 'Nom non renseigne'}</td>
                    <td className="py-2 pr-4 text-anac-muted">
                      {personnel.organisationLabel ?? 'Non renseigne'}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          hasAccount
                            ? 'bg-anac-success/10 text-anac-success'
                            : 'bg-anac-muted/10 text-anac-muted'
                        }`}
                      >
                        {hasAccount ? 'Cree' : 'A creer'}
                      </span>
                    </td>
                    <td className="py-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={hasAccount}
                        onClick={() => onCreate(personnel)}
                      >
                        Creer le compte
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function RoleSelector({
  roles,
  onToggle,
  suLocked = false,
}: {
  roles: string[];
  onToggle: (role: string) => void;
  suLocked?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {ALL_ROLES.map((role) => {
        const disabled = role === 'SU' && suLocked;
        return (
          <button
            type="button"
            key={role}
            disabled={disabled}
            onClick={() => onToggle(role)}
            title={disabled ? 'Reserve au Super Admin' : undefined}
            className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              roles.includes(role)
                ? 'bg-anac-navy text-white border-anac-navy'
                : 'bg-white text-anac-muted border-anac-border hover:bg-anac-gray'
            }`}
          >
            {ROLE_LABELS[role]}
          </button>
        );
      })}
    </div>
  );
}

function CreateUserForm({
  prefill,
  onCancel,
  onCreated,
}: {
  prefill: PrefillUser | null;
  onCancel: () => void;
  onCreated: (emailSent: boolean) => void;
}) {
  const [employeeCode, setEmployeeCode] = useState(prefill?.employeeCode ?? '');
  const [fullName, setFullName] = useState(prefill?.fullName ?? '');
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleRole(role: string) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (roles.length === 0) {
      setError('Selectionnez au moins un role.');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post('/users', { employeeCode, fullName, email, roles });
      onCreated(data.emailSent !== false);
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de creer l'utilisateur."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <p className="text-anac-muted text-sm">
        Un code OTP sera envoye par email pour la premiere connexion.
      </p>
      {error && <p className="text-anac-danger text-sm">{error}</p>}

      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <Label>Matricule</Label>
          <Input
            value={employeeCode}
            onChange={(e) => setEmployeeCode(e.target.value)}
            disabled={!!prefill}
            required
          />
        </div>
        <div>
          <Label>Nom complet</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div>
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
      </div>

      <div>
        <Label>Roles</Label>
        <RoleSelector roles={roles} onToggle={toggleRole} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Creation...' : "Creer l'utilisateur"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

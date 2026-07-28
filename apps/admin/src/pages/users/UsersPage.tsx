import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, RotateCcw, Search, UserPlus, Users } from 'lucide-react';
import { api, apiErrorMessage } from '../../lib/axios';
import { listPersonnelAnac, searchPersonnelAnac } from '../../lib/api/personnel-anac.api';
import type { PersonnelAnacResult } from '../../lib/api/personnel-anac.types';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

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

export default function UsersPage() {
  const [tab, setTab] = useState<'users' | 'personnel'>('users');
  const [users, setUsers] = useState<UserView[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [prefill, setPrefill] = useState<PrefillUser | null>(null);

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
    setPrefill(null);
    setFormOpen(true);
  }

  function openAnacCreation(personnel: PersonnelAnacResult) {
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
        {tab === 'users' && (
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
        <TabButton active={tab === 'personnel'} onClick={() => setTab('personnel')}>
          Personnel ANAC
        </TabButton>
      </div>

      {formOpen && (
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
          onToggle={handleToggle}
          onResetOtp={handleResetOtp}
          onReload={loadUsers}
        />
      ) : (
        <PersonnelAnacTab onCreate={openAnacCreation} existingCodes={users.map((u) => u.employeeCode)} />
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
  onReload,
}: {
  users: UserView[];
  loading: boolean;
  error: string | null;
  busyId: number | null;
  onToggle: (id: number, active: boolean) => void;
  onResetOtp: (id: number) => void;
  onReload: () => void;
}) {
  return (
    <div className="card overflow-x-auto">
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
            {users.map((user) => (
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const existing = useMemo(() => new Set(existingCodes), [existingCodes]);

  async function loadInitial() {
    setLoading(true);
    setError(null);
    try {
      const data = await listPersonnelAnac();
      setResults(data.data);
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger l'annuaire Personnel ANAC."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInitial();
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
        <Button type="button" variant="secondary" onClick={loadInitial}>
          Liste
        </Button>
      </form>

      {error && <p className="text-anac-danger text-sm">{error}</p>}

      <div className="card overflow-x-auto">
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
                  <tr key={personnel.employeeCode} className="border-b border-anac-border last:border-0">
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
        <div className="flex flex-wrap gap-2 mt-1">
          {ALL_ROLES.map((role) => (
            <button
              type="button"
              key={role}
              onClick={() => toggleRole(role)}
              className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                roles.includes(role)
                  ? 'bg-anac-navy text-white border-anac-navy'
                  : 'bg-white text-anac-muted border-anac-border hover:bg-anac-gray'
              }`}
            >
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>
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


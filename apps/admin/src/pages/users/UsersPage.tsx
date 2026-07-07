import { useEffect, useState, FormEvent } from 'react';
import { UserPlus, RotateCcw, Loader2 } from 'lucide-react';
import { api, apiErrorMessage } from '../../lib/axios';
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
  const [users, setUsers] = useState<UserView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/users');
      setUsers(data.data);
    } catch (err) {
      setError(apiErrorMessage(err, 'Impossible de charger les utilisateurs.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleToggle(id: number, active: boolean) {
    setActionError(null);
    setBusyId(id);
    try {
      await api.patch(`/users/${id}/activation`, { active });
      await load();
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
      await api.post(`/users/${id}/reset-otp`);
      await load();
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Reinitialisation impossible.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-anac-navy text-xl font-semibold">Utilisateurs</h1>
          <p className="text-anac-muted text-sm">
            Comptes internes ANAC - reception, DN, R3, S5, SU
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} className="gap-1.5">
          <UserPlus size={14} />
          {showForm ? 'Fermer' : 'Nouvel utilisateur'}
        </Button>
      </div>

      {showForm && (
        <CreateUserForm
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {actionError && <p className="text-anac-danger text-sm">{actionError}</p>}

      <div className="card overflow-x-auto">
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
                <th className="pb-2 pr-4">Roles</th>
                <th className="pb-2 pr-4">Statut</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-anac-border last:border-0">
                  <td className="py-2 pr-4 font-medium">{u.employeeCode}</td>
                  <td className="py-2 pr-4">{u.fullName}</td>
                  <td className="py-2 pr-4 text-anac-muted text-xs">
                    {u.roles.map((r) => ROLE_LABELS[r] ?? r).join(', ')}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${u.active ? 'bg-anac-success/10 text-anac-success' : 'bg-anac-muted/10 text-anac-muted'}`}
                    >
                      {u.active ? 'Actif' : 'Inactif'}
                    </span>
                    {u.firstLogin && (
                      <span className="ml-1.5 px-2 py-0.5 rounded text-xs font-medium bg-anac-warning/10 text-anac-warning">
                        1ere connexion
                      </span>
                    )}
                  </td>
                  <td className="py-2 space-x-2">
                    <button
                      className="text-anac-blue underline text-xs disabled:opacity-50"
                      disabled={busyId === u.id}
                      onClick={() => handleToggle(u.id, !u.active)}
                    >
                      {u.active ? 'Desactiver' : 'Activer'}
                    </button>
                    <button
                      className="text-anac-muted underline text-xs disabled:opacity-50 inline-flex items-center gap-1"
                      disabled={busyId === u.id}
                      onClick={() => handleResetOtp(u.id)}
                    >
                      {busyId === u.id ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <RotateCcw size={10} />
                      )}
                      Reinitialiser OTP
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const [employeeCode, setEmployeeCode] = useState('');
  const [fullName, setFullName] = useState('');
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
      await api.post('/users', { employeeCode, fullName, email, roles });
      onCreated();
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

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Matricule</Label>
          <Input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} required />
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
        <Label>Roles (multi-selection)</Label>
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

      <Button type="submit" disabled={submitting}>
        {submitting ? 'Creation...' : "Creer l'utilisateur"}
      </Button>
    </form>
  );
}

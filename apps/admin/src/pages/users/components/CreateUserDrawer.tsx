import { FormEvent, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { SheetBody, SheetHeader } from '../../../components/ui/sheet';
import type { PrefillUser } from '../types';
import { RoleSelector } from './RoleSelector';

export function CreateUserDrawer({
  prefill,
  submitting,
  onClose,
  onCreate,
}: {
  prefill: PrefillUser | null;
  submitting: boolean;
  onClose: () => void;
  onCreate: (params: {
    employeeCode: string;
    fullName: string;
    email: string;
    roles: string[];
  }) => void;
}) {
  const [employeeCode, setEmployeeCode] = useState(prefill?.employeeCode ?? '');
  const [fullName, setFullName] = useState(prefill?.fullName ?? '');
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function toggleRole(role: string) {
    setRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role]
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (roles.length === 0) {
      setError('Selectionnez au moins un role.');
      return;
    }
    onCreate({ employeeCode, fullName, email, roles });
  }

  return (
    <>
      <SheetHeader onClose={onClose}>
        <div>
          <p className="text-lg font-semibold text-anac-navy">
            {prefill ? 'Activation depuis Personnel ANAC' : 'Nouvel utilisateur AIDN'}
          </p>
          <p className="text-sm text-anac-muted">Un OTP sera envoye pour la premiere connexion.</p>
        </div>
      </SheetHeader>
      <SheetBody>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-anac-danger">{error}</p>}
          <div>
            <Label>Matricule</Label>
            <Input
              value={employeeCode}
              onChange={(event) => setEmployeeCode(event.target.value)}
              disabled={!!prefill}
              required
            />
          </div>
          <div>
            <Label>Nom complet</Label>
            <Input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div>
            <Label>Roles</Label>
            <RoleSelector roles={roles} onToggle={toggleRole} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? 'Activation...' : 'Activer le compte'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuler
            </Button>
          </div>
        </form>
      </SheetBody>
    </>
  );
}

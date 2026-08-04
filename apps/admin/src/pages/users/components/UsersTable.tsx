import { Eye } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import type { UserView } from '../../../lib/api/users.types';
import { apiErrorMessage } from '../../../lib/axios';
import { RoleBadgeList, StatusBadge, UserAvatar } from './UserDisplay';

export function UsersTable({
  users,
  loading,
  error,
  selectedId,
  onSelect,
}: {
  users: UserView[];
  loading: boolean;
  error: unknown;
  selectedId: number | null;
  onSelect: (user: UserView) => void;
}) {
  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-anac-muted">Chargement des utilisateurs...</div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-sm text-anac-danger">
        {apiErrorMessage(error, 'Impossible de charger les utilisateurs.')}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="p-10 text-center">
        <p className="font-semibold text-anac-navy">Aucun utilisateur dans cette vue</p>
        <p className="mt-1 text-sm text-anac-muted">
          Modifiez les filtres ou activez un agent depuis Personnel ANAC.
        </p>
      </div>
    );
  }

  return (
    <Table className="min-w-[640px]">
      <TableHeader>
        <TableRow>
          <TableHead>Utilisateur</TableHead>
          <TableHead>Matricule</TableHead>
          <TableHead>Roles</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id} className={selectedId === user.id ? 'bg-anac-blue/5' : undefined}>
            <TableCell>
              <button type="button" onClick={() => onSelect(user)} className="flex items-center gap-3 text-left">
                <UserAvatar user={user} />
                <span>
                  <span className="block max-w-[230px] truncate font-semibold text-anac-navy">
                    {user.fullName}
                  </span>
                  <span className="block max-w-[230px] truncate text-xs text-anac-muted">{user.email}</span>
                </span>
              </button>
            </TableCell>
            <TableCell>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                {user.employeeCode}
              </span>
            </TableCell>
            <TableCell>
              <RoleBadgeList roles={user.roles} limit={2} />
            </TableCell>
            <TableCell>
              <StatusBadge user={user} />
            </TableCell>
            <TableCell className="text-right">
              <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(user)} className="gap-1.5">
                <Eye size={14} />
                Consulter
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

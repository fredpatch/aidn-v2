import { Eye } from 'lucide-react';
import { SelectableTableRow } from '../../../components/common/SelectableTableRow';
import { TableState } from '../../../components/common/TableState';
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
    return <TableState state="loading" title="Chargement des utilisateurs..." />;
  }

  if (error) {
    return (
      <TableState
        state="error"
        title={apiErrorMessage(error, 'Impossible de charger les utilisateurs.')}
      />
    );
  }

  if (users.length === 0) {
    return (
      <TableState
        state="empty"
        title="Aucun utilisateur dans cette vue"
        description="Modifiez les filtres ou activez un agent depuis Personnel ANAC."
      />
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
          <SelectableTableRow
            key={user.id}
            selected={selectedId === user.id}
            onSelect={() => onSelect(user)}
            ariaLabel={`Selectionner l'utilisateur ${user.fullName}`}
          >
            <TableCell>
              <div className="flex items-center gap-3 text-left">
                <UserAvatar user={user} />
                <span>
                  <span className="block max-w-[230px] truncate font-semibold text-anac-navy">
                    {user.fullName}
                  </span>
                  <span className="block max-w-[230px] truncate text-xs text-anac-muted">{user.email}</span>
                </span>
              </div>
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
          </SelectableTableRow>
        ))}
      </TableBody>
    </Table>
  );
}

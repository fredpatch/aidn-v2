import { Eye } from 'lucide-react';
import { Button } from '../../../components/ui/button';
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
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-anac-border bg-anac-gray/50 text-left text-[11px] uppercase text-anac-muted">
            <th className="px-4 py-3 font-medium">Utilisateur</th>
            <th className="px-4 py-3 font-medium">Matricule</th>
            <th className="px-4 py-3 font-medium">Roles</th>
            <th className="px-4 py-3 font-medium">Statut</th>
            <th className="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr
              key={user.id}
              className={`border-b border-anac-border last:border-0 ${
                selectedId === user.id ? 'bg-anac-blue/5' : 'hover:bg-anac-gray/40'
              }`}
            >
              <td className="px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => onSelect(user)}
                  className="flex items-center gap-3 text-left"
                >
                  <UserAvatar user={user} />
                  <span>
                    <span className="block max-w-[230px] truncate font-semibold text-anac-navy">
                      {user.fullName}
                    </span>
                    <span className="block max-w-[230px] truncate text-xs text-anac-muted">
                      {user.email}
                    </span>
                  </span>
                </button>
              </td>
              <td className="px-4 py-2.5">
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                  {user.employeeCode}
                </span>
              </td>
              <td className="px-4 py-2.5">
                <RoleBadgeList roles={user.roles} limit={2} />
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge user={user} />
              </td>
              <td className="px-4 py-2.5 text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelect(user)}
                  className="gap-1.5"
                >
                  <Eye size={14} />
                  Consulter
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

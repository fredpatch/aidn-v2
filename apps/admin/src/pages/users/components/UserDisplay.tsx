import { ROLE_GROUP_LABELS, ROLE_LABELS } from '../constants';
import type { UserView } from '../../../lib/api/users.types';
import { initials } from '../utils';

export function RoleBadgeList({ roles, limit }: { roles: string[]; limit?: number }) {
  const visible = limit ? roles.slice(0, limit) : roles;
  const extra = limit ? Math.max(0, roles.length - limit) : 0;
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((role) => (
        <span
          key={role}
          className="rounded-full bg-anac-blue/10 px-2 py-0.5 text-xs font-semibold text-anac-blue"
        >
          {ROLE_LABELS[role] ?? role}
        </span>
      ))}
      {extra > 0 && (
        <span className="rounded-full bg-anac-gray px-2 py-0.5 text-xs font-semibold text-anac-muted">
          +{extra}
        </span>
      )}
    </div>
  );
}

export function RoleGroupList({ roles }: { roles: string[] }) {
  const groups = Array.from(new Set(roles.map((role) => ROLE_GROUP_LABELS[role] ?? role)));
  return (
    <div className="flex flex-wrap gap-1.5">
      {groups.map((group) => (
        <span
          key={group}
          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
        >
          {group}
        </span>
      ))}
    </div>
  );
}

export function StatusBadge({ user }: { user: UserView }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span
        className={`rounded-full px-2 py-1 text-xs font-semibold ${
          user.active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}
      >
        {user.active ? 'Actif' : 'Suspendu'}
      </span>
      {user.firstLogin && (
        <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
          Premiere connexion
        </span>
      )}
    </div>
  );
}

export function UserAvatar({ user, size = 'md' }: { user: UserView; size?: 'md' | 'lg' }) {
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center rounded-full bg-anac-blue/10 font-semibold text-anac-blue ${
        size === 'lg' ? 'h-12 w-12 text-sm' : 'h-9 w-9 text-xs'
      }`}
    >
      {initials(user.fullName)}
      <span
        className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white ${
          user.active ? 'bg-emerald-500' : 'bg-slate-400'
        }`}
      />
    </span>
  );
}

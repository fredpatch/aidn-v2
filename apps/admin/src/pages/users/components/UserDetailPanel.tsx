import { useEffect, useState } from 'react';
import { Activity, KeyRound, Loader2, Lock, MoreVertical, ShieldCheck } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import type { UserView } from '../../../lib/api/users.types';
import { formatDateTime } from '../utils';
import { CompactStat, DetailSection, TimelineItem } from './DetailPrimitives';
import { RoleSelector } from './RoleSelector';
import { RoleBadgeList, RoleGroupList, StatusBadge, UserAvatar } from './UserDisplay';

export function UserDetailPanel({
  user,
  canManageAccounts,
  canEditRoles,
  currentUserRoles,
  busy,
  onResetOtp,
  onToggleActive,
  onUpdateRoles,
}: {
  user: UserView | null;
  canManageAccounts: boolean;
  canEditRoles: boolean;
  currentUserRoles: string[];
  busy: boolean;
  onResetOtp: (user: UserView) => void;
  onToggleActive: (user: UserView) => void;
  onUpdateRoles: (user: UserView, roles: string[]) => void;
}) {
  const [roles, setRoles] = useState<string[]>([]);
  const actorIsSU = currentUserRoles.includes('SU');
  const suLocked = !actorIsSU;
  const rolesChanged = user
    ? roles.slice().sort().join('|') !== user.roles.slice().sort().join('|')
    : false;

  useEffect(() => {
    setRoles(user?.roles ?? []);
  }, [user?.id, user?.roles]);

  function toggleRole(role: string) {
    if (role === 'SU' && suLocked) return;
    setRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role]
    );
  }

  if (!user) {
    return (
      <aside className="w-full min-w-0 rounded-lg border border-anac-border bg-white p-6 text-center shadow-sm md:sticky md:top-20">
        <p className="font-semibold text-anac-navy">Aucun utilisateur sélectionné</p>
        <p className="mt-1 text-sm text-anac-muted">
          Sélectionnez une ligne pour afficher le détail.
        </p>
      </aside>
    );
  }

  return (
    <aside className="w-full min-w-0 rounded-lg border border-anac-border bg-white shadow-sm md:sticky md:top-20">
      <div className="border-b border-anac-border p-3">
        <div className="flex items-center gap-3">
          <UserAvatar user={user} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-anac-navy">{user.fullName}</p>
            <p className="truncate text-xs text-anac-muted">{user.email}</p>
            <p className="mt-0.5 text-xs text-anac-muted">Matricule {user.employeeCode}</p>
          </div>
          <StatusBadge user={user} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 p-3">
        <DetailSection title="Informations clés">
          <CompactStat label="Création" value={formatDateTime(user.createdAt)} />
          <CompactStat label="Compte" value={user.active ? 'Actif' : 'Suspendu'} strong />
          <CompactStat
            label="Première connexion"
            value={user.firstLogin ? 'En attente' : 'Terminée'}
          />
        </DetailSection>

        <DetailSection title="Rôles attribues">
          <RoleBadgeList roles={user.roles} />
          <div className="mt-3">
            <p className="mb-2 text-xs font-medium text-anac-muted">Groupes / permissions</p>
            <RoleGroupList roles={user.roles} />
          </div>
        </DetailSection>

        {canEditRoles && (
          <DetailSection title="Modifier les rôles">
            <RoleSelector roles={roles} onToggle={toggleRole} suLocked={suLocked} />
            <div className="mt-2 flex justify-end">
              <Button
                type="button"
                size="sm"
                disabled={busy || roles.length === 0 || !rolesChanged}
                onClick={() => onUpdateRoles(user, roles)}
                className="h-7 min-w-22 px-3 text-xs"
              >
                {busy ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </DetailSection>
        )}

        <DetailSection title="Actions rapides">
          <div className="grid gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!canManageAccounts || busy || !user.active}
              onClick={() => onResetOtp(user)}
              className="text-xs min-w-12 h-8"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
              Réinitialiser OTP
            </Button>
            <Button
              type="button"
              variant={user.active ? 'destructive' : 'secondary'}
              disabled={!canManageAccounts || busy || user.roles.includes('SU')}
              onClick={() => onToggleActive(user)}
              className="text-xs min-w-12 h-8"
            >
              <Lock size={14} />
              {user.active ? 'Suspendre le compte' : 'Réactiver le compte'}
            </Button>
            <Button type="button" variant="secondary" disabled className="text-xs min-w-12 h-8">
              <MoreVertical size={14} />
              Voir le journal d&apos;audit
            </Button>
          </div>
          {!canManageAccounts && (
            <p className="mt-2 text-xs text-anac-muted">
              Les actions de cycle de vie restent réservées au Super Admin.
            </p>
          )}
        </DetailSection>

        <DetailSection title="Activité récente">
          <div className="grid grid-cols-2 gap-2">
            <TimelineItem icon={Activity} title="Log connexion" meta="À venir" />
            <TimelineItem icon={ShieldCheck} title="Log rôles" meta="À venir" />
          </div>
        </DetailSection>
      </div>
    </aside>
  );
}

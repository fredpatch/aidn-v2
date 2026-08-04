import type { CSSProperties } from 'react';
import { KeyRound, Lock, RefreshCw, Search, ShieldCheck, UserCheck, UserPlus } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Pagination } from '../../components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Sheet, SheetContent } from '../../components/ui/sheet';
import { ALL_ROLES, ROLE_LABELS, USERS_PAGE_SIZE } from './constants';
import { CreateUserDrawer } from './components/CreateUserDrawer';
import { PersonnelAnacTab } from './components/PersonnelAnacTab';
import { PersonnelDetailPanel } from './components/PersonnelDetailPanel';
import { TabButton } from './components/TabButton';
import { UserDetailPanel } from './components/UserDetailPanel';
import { UserMetricCard } from './components/UserMetricCard';
import { UsersTable } from './components/UsersTable';
import { useUsersCockpit } from './hooks/useUsersCockpit';
import type { UserStatusFilter } from './types';

const usersSplitStyle = {
  '--users-list-column': '7fr',
  '--users-detail-column': '3fr',
} as CSSProperties;

export default function UsersPage() {
  const cockpit = useUsersCockpit();
  const {
    currentUserRoles,
    canManageAccounts,
    canEditRoles,
    tab,
    setTab,
    search,
    setSearch,
    roleFilter,
    setRoleFilter,
    statusFilter,
    setStatusFilter,
    page,
    setPage,
    setSelectedUserId,
    selectedPersonnel,
    setSelectedPersonnel,
    createDrawer,
    setCreateDrawer,
    actionMessage,
    usersQuery,
    summaryQuery,
    users,
    total,
    totalPages,
    selectedUser,
    refreshUsers,
    resetOtpMutation,
    activationMutation,
    rolesMutation,
    createMutation,
  } = cockpit;

  return (
    <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 px-4 py-6 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-anac-muted">Direction de la Navigabilite</p>
          <h1 className="mt-2 text-2xl font-semibold text-anac-navy">Utilisateurs</h1>
          <p className="mt-1 text-sm text-anac-muted">
            Comptes internes AIDN et activation depuis l&apos;annuaire Personnel ANAC.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={refreshUsers} className="gap-1.5">
            <RefreshCw size={14} />
            Actualiser
          </Button>
          {canManageAccounts && (
            <Button
              type="button"
              onClick={() => setCreateDrawer({ prefill: null })}
              className="gap-1.5"
            >
              <UserPlus size={16} />
              Nouvel utilisateur
            </Button>
          )}
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <UserMetricCard
          label="Utilisateurs actifs"
          value={summaryQuery.data?.active ?? 0}
          help={`${summaryQuery.data?.total ?? 0} compte(s) AIDN`}
          icon={UserCheck}
          tone="blue"
        />
        <UserMetricCard
          label="Premiere connexion"
          value={summaryQuery.data?.firstLoginPending ?? 0}
          help="OTP ou mot de passe initial attendu"
          icon={KeyRound}
          tone="amber"
        />
        <UserMetricCard
          label="Roles attribues"
          value={summaryQuery.data?.rolesAssigned ?? 0}
          help="Multi-role supporte"
          icon={ShieldCheck}
          tone="violet"
        />
        <UserMetricCard
          label="Comptes suspendus"
          value={summaryQuery.data?.inactive ?? 0}
          help="Acces AIDN bloque"
          icon={Lock}
          tone="green"
        />
      </section>

      <section className="users-management-split" style={usersSplitStyle}>
        <div className="min-w-0 rounded-lg border border-anac-border bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-anac-border px-4 pt-3">
            <div className="flex flex-wrap gap-1">
              <TabButton
                active={tab === 'users'}
                onClick={() => {
                  setTab('users');
                  setSelectedPersonnel(null);
                }}
                count={summaryQuery.data?.total ?? 0}
              >
                Comptes AIDN
              </TabButton>
              {canManageAccounts && (
                <TabButton
                  active={tab === 'personnel'}
                  onClick={() => {
                    setTab('personnel');
                    setSelectedUserId(null);
                  }}
                >
                  Personnel ANAC
                </TabButton>
              )}
            </div>
            {actionMessage && (
              <p className="pb-3 text-xs font-medium text-anac-blue">{actionMessage}</p>
            )}
          </div>

          {tab === 'users' ? (
            <>
              <div className="flex flex-col gap-3 border-b border-anac-border p-4 md:flex-row md:items-center">
                <div className="relative md:min-w-0 md:flex-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-anac-muted"
                    size={16}
                  />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Rechercher par nom, matricule ou email..."
                    className="pl-9"
                  />
                </div>
                <div className="flex h-11 items-center gap-2 rounded-lg border border-anac-border bg-white px-3 text-sm text-anac-muted md:w-40">
                  <span className="shrink-0 text-xs">Role</span>
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="h-auto border-0 bg-transparent p-0 text-anac-navy shadow-none focus:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les roles</SelectItem>
                      {ALL_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex h-11 items-center gap-2 rounded-lg border border-anac-border bg-white px-3 text-sm text-anac-muted md:w-44">
                  <span className="shrink-0 text-xs">Statut</span>
                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as UserStatusFilter)}>
                    <SelectTrigger className="h-auto border-0 bg-transparent p-0 text-anac-navy shadow-none focus:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les statuts</SelectItem>
                      <SelectItem value="active">Actifs</SelectItem>
                      <SelectItem value="inactive">Suspendus</SelectItem>
                      <SelectItem value="first_login">Premiere connexion</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <UsersTable
                users={users}
                loading={usersQuery.isLoading}
                error={usersQuery.error}
                selectedId={selectedUser?.id ?? null}
                onSelect={(user) => setSelectedUserId(user.id)}
              />

              <Pagination
                label={
                  total === 0
                    ? 'Aucun utilisateur'
                    : `Affichage ${Math.min((page - 1) * USERS_PAGE_SIZE + 1, total)}-${Math.min(
                        page * USERS_PAGE_SIZE,
                        total
                      )} sur ${total} utilisateur(s)`
                }
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </>
          ) : (
            <PersonnelAnacTab
              onCreate={(personnel) => {
                setCreateDrawer({
                  prefill: { employeeCode: personnel.employeeCode, fullName: personnel.fullName },
                });
              }}
              onSelect={(personnel) => setSelectedPersonnel(personnel)}
              selectedEmployeeCode={selectedPersonnel?.employeeCode ?? null}
              existingCodes={users.map((user) => user.employeeCode)}
            />
          )}
        </div>

        {tab === 'users' ? (
          <UserDetailPanel
            user={selectedUser}
            canManageAccounts={canManageAccounts}
            canEditRoles={canEditRoles}
            currentUserRoles={currentUserRoles}
            busy={
              resetOtpMutation.isPending || activationMutation.isPending || rolesMutation.isPending
            }
            onResetOtp={(user) => resetOtpMutation.mutate(user.id)}
            onToggleActive={(user) =>
              activationMutation.mutate({ id: user.id, active: !user.active })
            }
            onUpdateRoles={(user, roles) => rolesMutation.mutate({ id: user.id, roles })}
          />
        ) : (
          <PersonnelDetailPanel
            personnel={selectedPersonnel}
            canManageAccounts={canManageAccounts}
            onActivate={(personnel) =>
              setCreateDrawer({
                prefill: { employeeCode: personnel.employeeCode, fullName: personnel.fullName },
              })
            }
          />
        )}
      </section>

      <Sheet open={createDrawer !== null} onOpenChange={(open) => !open && setCreateDrawer(null)}>
        <SheetContent>
          {createDrawer && (
            <CreateUserDrawer
              prefill={createDrawer.prefill}
              submitting={createMutation.isPending}
              onClose={() => setCreateDrawer(null)}
              onCreate={(params) => createMutation.mutate(params)}
            />
          )}
        </SheetContent>
      </Sheet>
    </main>
  );
}

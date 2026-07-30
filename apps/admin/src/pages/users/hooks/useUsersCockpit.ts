import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PersonnelAnacResult } from '../../../lib/api/personnel-anac.types';
import {
  createUser,
  fetchUsers,
  fetchUsersSummary,
  resetUserOtp,
  toggleUserActivation,
  updateUserRoles,
} from '../../../lib/api/users.api';
import { apiErrorMessage } from '../../../lib/axios';
import { queryKeys } from '../../../lib/react-query/queryKeys';
import { useAuth } from '../../../hooks/useAuth';
import { USERS_PAGE_SIZE } from '../constants';
import type { CreateDrawerState, MainTab, UserStatusFilter } from '../types';

export function useUsersCockpit() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const currentUserRoles = currentUser?.roles ?? [];
  const canManageAccounts = currentUserRoles.includes('SU');
  const canEditRoles = currentUserRoles.some((role) => role === 'SU' || role === 'dn_supervisor');

  const [tab, setTab] = useState<MainTab>('users');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>('all');
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedPersonnel, setSelectedPersonnel] = useState<PersonnelAnacResult | null>(null);
  const [createDrawer, setCreateDrawer] = useState<CreateDrawerState>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const activeFilter =
    statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined;
  const firstLoginFilter = statusFilter === 'first_login' ? true : undefined;

  const usersQuery = useQuery({
    queryKey: queryKeys.users.list(search.trim(), roleFilter, statusFilter, page, USERS_PAGE_SIZE),
    queryFn: () =>
      fetchUsers({
        search: search.trim() || undefined,
        role: roleFilter === 'all' ? undefined : roleFilter,
        active: activeFilter,
        firstLogin: firstLoginFilter,
        page,
        pageSize: USERS_PAGE_SIZE,
      }),
  });

  const summaryQuery = useQuery({
    queryKey: queryKeys.users.summary(),
    queryFn: fetchUsersSummary,
  });

  const users = usersQuery.data?.data ?? [];
  const total = usersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0] ?? null;

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, statusFilter]);

  useEffect(() => {
    if (tab !== 'users') return;
    if (users.length === 0) {
      setSelectedUserId(null);
      return;
    }
    if (!selectedUserId || !users.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(users[0].id);
    }
  }, [tab, users, selectedUserId]);

  function invalidateUsers() {
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
  }

  function refreshUsers() {
    invalidateUsers();
    setActionMessage(null);
  }

  const resetOtpMutation = useMutation({
    mutationFn: (id: number) => resetUserOtp(id),
    onSuccess: (result) => {
      setActionMessage(
        result.emailSent
          ? 'OTP reinitialise et transmis par email.'
          : "OTP reinitialise, mais l'email n'a pas pu etre envoye."
      );
      invalidateUsers();
    },
    onError: (error) => setActionMessage(apiErrorMessage(error, 'Reinitialisation impossible.')),
  });

  const activationMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      toggleUserActivation(id, active),
    onSuccess: (updated) => {
      setActionMessage(updated.active ? 'Compte active.' : 'Compte suspendu.');
      setSelectedUserId(updated.id);
      invalidateUsers();
    },
    onError: (error) => setActionMessage(apiErrorMessage(error, 'Action impossible.')),
  });

  const rolesMutation = useMutation({
    mutationFn: ({ id, roles }: { id: number; roles: string[] }) => updateUserRoles(id, roles),
    onSuccess: (updated) => {
      setActionMessage('Roles mis a jour.');
      setSelectedUserId(updated.id);
      invalidateUsers();
    },
    onError: (error) =>
      setActionMessage(apiErrorMessage(error, 'Modification des roles impossible.')),
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: (result) => {
      setActionMessage(
        result.emailSent
          ? 'Compte cree et OTP transmis par email.'
          : "Compte cree, mais l'email OTP n'a pas pu etre envoye."
      );
      setTab('users');
      setCreateDrawer(null);
      setSelectedUserId(result.user.id);
      invalidateUsers();
    },
    onError: (error) =>
      setActionMessage(apiErrorMessage(error, "Impossible de creer l'utilisateur.")),
  });

  return {
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
    selectedUserId,
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
  };
}

import { createContext, useContext, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAuthMe, fetchBootstrapStatus, logout as logoutRequest } from '../lib/api/auth.api';
import type { UserPublic } from '../lib/api/auth.types';
import { queryKeys } from '../lib/react-query/queryKeys';

interface AuthContextValue {
  user: UserPublic | null;
  loading: boolean;
  bootstrapInitialised: boolean | null;
  refreshMe: () => Promise<void>;
  refreshBootstrapStatus: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const bootstrapStatusQuery = useQuery({
    queryKey: queryKeys.auth.bootstrapStatus(),
    queryFn: fetchBootstrapStatus,
    retry: false,
  });

  const meQuery = useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: fetchAuthMe,
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSettled: async () => {
      queryClient.setQueryData(queryKeys.auth.me(), null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
    },
  });

  const loading = bootstrapStatusQuery.isLoading || meQuery.isLoading;
  const bootstrapInitialised =
    bootstrapStatusQuery.data?.initialised ?? (bootstrapStatusQuery.isLoading ? null : false);
  const user = meQuery.data ?? null;

  async function refreshBootstrapStatus() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.auth.bootstrapStatus() });
    await queryClient.refetchQueries({
      queryKey: queryKeys.auth.bootstrapStatus(),
      type: 'active',
    });
  }

  async function refreshMe() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    await queryClient.refetchQueries({ queryKey: queryKeys.auth.me(), type: 'active' });
  }

  async function logout() {
    await logoutMutation.mutateAsync().catch(() => undefined);
    queryClient.setQueryData(queryKeys.auth.me(), null);
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, bootstrapInitialised, refreshMe, refreshBootstrapStatus, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

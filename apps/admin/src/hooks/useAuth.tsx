import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from '../lib/axios';

interface UserPublic {
  id: number;
  employeeCode: string;
  fullName: string;
  roles: string[];
}

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
  const [user, setUser] = useState<UserPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapInitialised, setBootstrapInitialised] = useState<boolean | null>(null);

  async function refreshBootstrapStatus() {
    const { data } = await api.get('/bootstrap/status');
    setBootstrapInitialised(data.initialised);
  }

  async function refreshMe() {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
    } catch {
      setUser(null);
    }
  }

  async function logout() {
    await api.post('/auth/logout').catch(() => undefined);
    setUser(null);
  }

  useEffect(() => {
    (async () => {
      await refreshBootstrapStatus().catch(() => setBootstrapInitialised(false));
      await refreshMe();
      setLoading(false);
    })();
  }, []);

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

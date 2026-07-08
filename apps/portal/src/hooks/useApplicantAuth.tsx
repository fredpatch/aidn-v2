import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "../lib/axios";

interface ApplicantPublic {
  id: number;
  organisationId: number;
  fullName: string;
  email: string;
  contactOrder: string;
}

interface AuthContextValue {
  applicant: ApplicantPublic | null;
  loading: boolean;
  refreshMe: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function ApplicantAuthProvider({ children }: { children: ReactNode }) {
  const [applicant, setApplicant] = useState<ApplicantPublic | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshMe() {
    try {
      const { data } = await api.get("/applicant-auth/me");
      setApplicant(data);
    } catch {
      setApplicant(null);
    }
  }

  async function logout() {
    await api.post("/applicant-auth/logout").catch(() => undefined);
    setApplicant(null);
  }

  useEffect(() => {
    refreshMe().finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ applicant, loading, refreshMe, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useApplicantAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useApplicantAuth must be used within ApplicantAuthProvider");
  return ctx;
}

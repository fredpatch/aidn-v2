import { Routes, Route, Navigate } from "react-router-dom";
import { Plane, LogOut } from "lucide-react";
import { ApplicantAuthProvider, useApplicantAuth } from "./hooks/useApplicantAuth";
import { Button } from "./components/ui/button";
import LoginPage from "./pages/auth/LoginPage";
import MyRequestPage from "./pages/requests/MyRequestPage";

function Gate() {
  const { applicant, loading, logout } = useApplicantAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-anac-muted">
        Chargement...
      </div>
    );
  }

  if (!applicant) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-anac-gray">
      <header className="bg-anac-navy text-white px-6 h-[57px] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center">
            <Plane size={15} strokeWidth={1.75} />
          </div>
          <div>
            <p className="font-bold text-sm leading-tight">AIDN</p>
            <p className="text-anac-sky text-[10px] leading-tight">Portail Postulant</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm">{applicant.fullName}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout()}
            className="h-8 px-2.5 gap-1.5 text-white/70 hover:text-white hover:bg-white/10"
          >
            <LogOut size={13} />
            <span className="text-[11px]">Deconnexion</span>
          </Button>
        </div>
      </header>
      <main className="p-6">
        <Routes>
          <Route path="/" element={<MyRequestPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ApplicantAuthProvider>
      <Gate />
    </ApplicantAuthProvider>
  );
}

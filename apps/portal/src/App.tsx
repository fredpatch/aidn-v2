import { Routes, Route, Navigate } from "react-router-dom";
import { ApplicantAuthProvider, useApplicantAuth } from "./hooks/useApplicantAuth";
import { AppHeader } from "./components/layout/AppHeader";
import LoginPage from "./pages/auth/LoginPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import NewRequestPage from "./pages/requests/NewRequestPage";
import DossiersPage from "./pages/dossiers/DossiersPage";
import DossierPage from "./pages/dossiers/DossierPage";
import AccountPage from "./pages/account/AccountPage";
import MeetingsPage from "./pages/meetings/MeetingsPage";

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
      <AppHeader fullName={applicant.fullName} onLogout={() => logout()} />
      <main className="p-4 sm:p-6">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/dossiers" element={<DossiersPage />} />
          <Route path="/dossiers/:id" element={<DossierPage />} />
          <Route path="/demande" element={<NewRequestPage />} />
          <Route path="/reunions" element={<MeetingsPage />} />
          <Route path="/compte" element={<AccountPage />} />
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

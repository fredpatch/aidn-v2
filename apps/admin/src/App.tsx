import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import BootstrapPage from './pages/auth/BootstrapPage';
import LoginPage from './pages/auth/LoginPage';
import AppShell from './components/layouts/AppShell';
import RequestsPage from './pages/requests/RequestsPage';
import UsersPage from './pages/users/UsersPage';
import PreliminaryPhasePage from './pages/phases/PreliminaryPhasePage';
import DocumentTemplatesPage from './pages/document-templates/DocumentTemplatesPage';
import SettingsPage from './pages/settings/SettingsPage';
import FormalPhasePage from './pages/phases/formal/FormalPhasePage';
import DeepEvaluationPhasePage from './pages/phases/deep-evaluation/DeepEvaluationPhasePage';

function Gate() {
  const { user, loading, bootstrapInitialised } = useAuth();

  if (loading || bootstrapInitialised === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-anac-muted">
        Chargement...
      </div>
    );
  }

  if (!bootstrapInitialised) {
    return <BootstrapPage />;
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<RequestsPage />} />
        <Route path="demandes/:requestId/phase-preliminaire" element={<PreliminaryPhasePage />} />

        <Route path="demandes/:requestId/phase-formelle" element={<FormalPhasePage />} />

        <Route
          path="demandes/:requestId/evaluation-approfondie"
          element={<DeepEvaluationPhasePage />}
        />

        <Route path="modeles-documents" element={<DocumentTemplatesPage />} />
        <Route path="utilisateurs" element={<UsersPage />} />
        <Route path="parametres" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

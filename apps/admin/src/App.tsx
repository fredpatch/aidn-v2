import { Routes, Route, Navigate } from 'react-router-dom';
import type { ReactElement } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import BootstrapPage from './pages/auth/BootstrapPage';
import LoginPage from './pages/auth/LoginPage';
import AppShell from './components/layouts/AppShell';
import RequestsPage from './pages/requests/RequestsPage';
import UsersPage from './pages/users/UsersPage';
import AccountRequestsPage from './pages/account-requests/AccountRequestsPage';
import PreliminaryPhasePage from './pages/phases/PreliminaryPhasePage';
import DocumentTemplatesPage from './pages/document-templates/DocumentTemplatesPage';
import SettingsPage from './pages/settings/SettingsPage';
import FormalPhasePage from './pages/phases/formal/FormalPhasePage';
import DeepEvaluationPhasePage from './pages/phases/deep-evaluation/DeepEvaluationPhasePage';
import SiteInspectionPhasePage from './pages/phases/site-inspection/SiteInspectionPhasePage';
import CertificatesPhasePage from './pages/phases/certificates/CertificatesPhasePage';
import MyInspectionsPage from './pages/inspections/MyInspectionsPage';
import CourrierTasksPage from './pages/courrier-tasks/CourrierTasksPage';
import S5PaymentsPage from './pages/payments/S5PaymentsPage';

const DN_ROLES = ['dn_agent', 'dn_supervisor', 'SU'];
const DEEP_EVALUATION_ROLES = ['dn_agent', 'dn_supervisor', 's5_agent', 'SU'];
const SITE_INSPECTION_ROLES = ['dn_agent', 'dn_supervisor', 's5_agent', 'r3_agent', 'SU'];

function hasAnyRole(userRoles: string[] | undefined, allowedRoles: string[]): boolean {
  return allowedRoles.some((role) => userRoles?.includes(role));
}

function AccessDenied() {
  return (
    <div className="mx-auto max-w-xl rounded-lg border border-anac-border bg-white p-6">
      <h1 className="text-lg font-semibold text-anac-navy">Acces refuse</h1>
      <p className="mt-2 text-sm text-anac-muted">
        Votre role ne permet pas de consulter cet espace de traitement.
      </p>
    </div>
  );
}

function RoleRoute({
  roles,
  children,
}: {
  roles: string[];
  children: ReactElement;
}) {
  const { user } = useAuth();
  return hasAnyRole(user?.roles, roles) ? children : <AccessDenied />;
}

function HomeRoute() {
  const { user } = useAuth();

  if (hasAnyRole(user?.roles, DN_ROLES)) return <RequestsPage />;
  if (hasAnyRole(user?.roles, ['reception', 'assistant_dg'])) {
    return <Navigate to="/courriers" replace />;
  }
  if (hasAnyRole(user?.roles, ['r3_agent'])) return <Navigate to="/mes-inspections" replace />;
  if (hasAnyRole(user?.roles, ['s5_agent'])) return <Navigate to="/paiements-s5" replace />;
  return <AccessDenied />;
}

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
        <Route index element={<HomeRoute />} />
        <Route
          path="demandes/:requestId/phase-preliminaire"
          element={
            <RoleRoute roles={DN_ROLES}>
              <PreliminaryPhasePage />
            </RoleRoute>
          }
        />

        <Route
          path="demandes/:requestId/phase-formelle"
          element={
            <RoleRoute roles={DN_ROLES}>
              <FormalPhasePage />
            </RoleRoute>
          }
        />

        <Route
          path="demandes/:requestId/evaluation-approfondie"
          element={
            <RoleRoute roles={DEEP_EVALUATION_ROLES}>
              <DeepEvaluationPhasePage />
            </RoleRoute>
          }
        />

        <Route
          path="demandes/:requestId/demonstration-inspection"
          element={
            <RoleRoute roles={SITE_INSPECTION_ROLES}>
              <SiteInspectionPhasePage />
            </RoleRoute>
          }
        />

        <Route
          path="demandes/:requestId/delivrance"
          element={
            <RoleRoute roles={DN_ROLES}>
              <CertificatesPhasePage />
            </RoleRoute>
          }
        />

        <Route path="mes-inspections" element={<MyInspectionsPage />} />
        <Route path="courriers" element={<CourrierTasksPage />} />
        <Route
          path="paiements-s5"
          element={
            <RoleRoute roles={['s5_agent', 'SU']}>
              <S5PaymentsPage />
            </RoleRoute>
          }
        />

        <Route path="modeles-documents" element={<DocumentTemplatesPage />} />
        <Route path="comptes-postulants" element={<AccountRequestsPage />} />
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

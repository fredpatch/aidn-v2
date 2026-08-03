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
import DashboardPage from './pages/dashboard/DashboardPage';
import ReceptionDashboardPage from './pages/dashboard/ReceptionDashboardPage';
import R3DashboardPage from './pages/dashboard/R3DashboardPage';
import S5DashboardPage from './pages/dashboard/S5DashboardPage';
import MeetingsPage from './pages/meetings/MeetingsPage';
import AnalyticsPage from './pages/analytics/AnalyticsPage';

const DN_ROLES = ['dn_agent', 'dn_supervisor', 'SU'];
const DASHBOARD_ROLES = ['dn_agent', 'dn_supervisor', 'reception', 'assistant_dg', 's5_agent', 'r3_agent', 'SU'];
const RECEPTION_ROLES = ['reception', 'assistant_dg', 'SU'];
const DEEP_EVALUATION_ROLES = ['dn_agent', 'dn_supervisor', 's5_agent', 'SU'];
const SITE_INSPECTION_ROLES = ['dn_agent', 'dn_supervisor', 's5_agent', 'r3_agent', 'SU'];
const DELIVERY_ROLES = ['dn_agent', 'dn_supervisor', 's5_agent', 'SU'];
const ANALYTICS_ROLES = ['dn_supervisor', 'SU'];

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

  if (
    hasAnyRole(user?.roles, ['s5_agent']) &&
    !hasAnyRole(user?.roles, ['dn_agent', 'dn_supervisor', 'reception', 'assistant_dg', 'r3_agent'])
  ) {
    return <S5DashboardPage />;
  }
  if (
    hasAnyRole(user?.roles, ['reception', 'assistant_dg']) &&
    !hasAnyRole(user?.roles, ['dn_agent', 'dn_supervisor', 's5_agent', 'r3_agent'])
  ) {
    return <ReceptionDashboardPage />;
  }
  if (
    hasAnyRole(user?.roles, ['r3_agent']) &&
    !hasAnyRole(user?.roles, ['dn_agent', 'dn_supervisor', 'reception', 'assistant_dg', 's5_agent'])
  ) {
    return <R3DashboardPage />;
  }
  if (hasAnyRole(user?.roles, DASHBOARD_ROLES)) return <DashboardPage />;
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
          path="demandes"
          element={
            <RoleRoute roles={DN_ROLES}>
              <RequestsPage />
            </RoleRoute>
          }
        />
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
            <RoleRoute roles={DELIVERY_ROLES}>
              <CertificatesPhasePage />
            </RoleRoute>
          }
        />

        <Route path="mes-inspections" element={<MyInspectionsPage />} />
        <Route
          path="courriers"
          element={
            <RoleRoute roles={RECEPTION_ROLES}>
              <CourrierTasksPage />
            </RoleRoute>
          }
        />
        <Route
          path="paiements-s5"
          element={
            <RoleRoute roles={['s5_agent', 'SU']}>
              <S5PaymentsPage />
            </RoleRoute>
          }
        />
        <Route
          path="reunions"
          element={
            <RoleRoute roles={DN_ROLES}>
              <MeetingsPage />
            </RoleRoute>
          }
        />
        <Route
          path="analytique"
          element={
            <RoleRoute roles={ANALYTICS_ROLES}>
              <AnalyticsPage />
            </RoleRoute>
          }
        />

        <Route path="modeles-documents" element={<DocumentTemplatesPage />} />
        <Route
          path="comptes-postulants"
          element={
            <RoleRoute roles={DN_ROLES}>
              <AccountRequestsPage />
            </RoleRoute>
          }
        />
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

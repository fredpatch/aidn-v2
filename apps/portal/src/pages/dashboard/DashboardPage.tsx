import type { ElementType } from 'react';
import { Link } from 'react-router-dom';
import { FileText, History, UserCircle } from 'lucide-react';
import { useApplicantAuth } from '../../hooks/useApplicantAuth';
import { useMyRequests } from '../requests/hooks/useMyRequests';
import { REQUEST_TYPE_LABELS, TERMINAL_STATUSES } from '../requests/constants';

export default function DashboardPage() {
  const { applicant } = useApplicantAuth();
  const { requests, error } = useMyRequests();
  const activeRequest = requests?.find((request) => !TERMINAL_STATUSES.includes(request.status));
  const latestRequest = requests?.[0];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-anac-navy text-xl font-semibold">
          Bonjour {applicant?.fullName}
        </h1>
        <p className="text-anac-muted text-sm">
          Espace postulant pour le suivi et le depot des demandes OMA
        </p>
      </div>

      {error && <div className="card text-anac-danger text-sm">{error}</div>}

      <div className="grid md:grid-cols-3 gap-4">
        <DashboardAction
          icon={FileText}
          title={activeRequest ? 'Suivre ma demande' : 'Deposer une demande'}
          text={
            activeRequest
              ? `Dossier ${activeRequest.reference} en cours`
              : 'Demarrer une demande de reconnaissance, delivrance, modification ou renouvellement.'
          }
          to="/demande"
          primary
        />
        <DashboardAction
          icon={History}
          title="Historique"
          text={
            latestRequest
              ? `${requests?.length ?? 0} dossier${(requests?.length ?? 0) > 1 ? 's' : ''} enregistre${(requests?.length ?? 0) > 1 ? 's' : ''}`
              : 'Aucun dossier soumis pour le moment.'
          }
          to="/demande"
        />
        <DashboardAction
          icon={UserCircle}
          title="Mon compte"
          text={`Compte ${applicant?.email ?? ''}`}
          to="/demande"
        />
      </div>

      {latestRequest && (
        <div className="card">
          <p className="text-xs font-semibold text-anac-navy mb-2">Dernier dossier</p>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div>
              <p className="font-medium">{latestRequest.reference}</p>
              <p className="text-anac-muted">
                {REQUEST_TYPE_LABELS[latestRequest.requestType] ?? latestRequest.requestType}
              </p>
            </div>
            <Link to="/demande" className="text-anac-blue underline text-xs">
              Ouvrir
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardAction({
  icon: Icon,
  title,
  text,
  to,
  primary = false,
}: {
  icon: ElementType;
  title: string;
  text: string;
  to: string;
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`rounded-lg border p-4 transition-colors ${
        primary
          ? 'border-anac-navy bg-anac-navy text-white hover:bg-anac-blue'
          : 'border-anac-border bg-white hover:bg-anac-gray'
      }`}
    >
      <Icon size={18} className={primary ? 'text-white' : 'text-anac-navy'} />
      <p className={`mt-3 text-sm font-semibold ${primary ? 'text-white' : 'text-anac-navy'}`}>
        {title}
      </p>
      <p className={`mt-1 text-xs ${primary ? 'text-white/75' : 'text-anac-muted'}`}>{text}</p>
    </Link>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { fetchDeepEvaluationPaymentQueue } from '../../lib/api/deep-evaluation.api';
import { fetchSiteInspectionPaymentQueue } from '../../lib/api/site-inspection.api';
import { fetchCertificatesPaymentQueue } from '../../lib/api/certificates.api';
import type { PaymentQueueItem as DeepPaymentQueueItem } from '../../lib/api/deep-evaluation.types';
import type { PaymentQueueItem as SitePaymentQueueItem } from '../../lib/api/site-inspection.types';
import type { PaymentQueueItem as CertificatePaymentQueueItem } from '../../lib/api/certificates.types';
import { queryKeys } from '../../lib/react-query/queryKeys';

type S5PaymentQueueItem = (
  | DeepPaymentQueueItem
  | SitePaymentQueueItem
  | CertificatePaymentQueueItem
) & {
  phaseCode: 'M5' | 'M6' | 'M7';
};

const STATUS_LABELS: Record<string, string> = {
  awaiting_invoice: 'Facture attendue',
  awaiting_proof: 'En attente de quittance',
  pending_validation: 'Quittance a valider',
  validated: 'Paiement valide',
  rejected: 'Paiement rejete',
};

const NEXT_ACTION_LABELS: Record<S5PaymentQueueItem['nextAction'], string> = {
  send_invoice: 'Envoyer la facture',
  waiting_for_proof: 'Attendre la quittance',
  validate_payment: 'Valider ou rejeter le paiement',
  done: 'Paiement termine',
  rejected: 'Dossier a verifier',
};

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'pending_validation'
      ? 'bg-anac-warning/10 text-anac-warning'
      : status === 'awaiting_invoice'
        ? 'bg-anac-info/10 text-anac-info'
        : status === 'validated'
          ? 'bg-anac-success/10 text-anac-success'
          : status === 'rejected'
            ? 'bg-anac-danger/10 text-anac-danger'
            : 'bg-anac-muted/10 text-anac-muted';

  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export default function S5PaymentsPage() {
  const deepQueue = useQuery({
    queryKey: queryKeys.deepEvaluation.paymentQueue(),
    queryFn: fetchDeepEvaluationPaymentQueue,
  });
  const siteQueue = useQuery({
    queryKey: queryKeys.siteInspection.paymentQueue(),
    queryFn: fetchSiteInspectionPaymentQueue,
  });
  const certificateQueue = useQuery({
    queryKey: queryKeys.certificates.paymentQueue(),
    queryFn: fetchCertificatesPaymentQueue,
  });

  const data: S5PaymentQueueItem[] = [
    ...(deepQueue.data ?? []).map((item) => ({ ...item, phaseCode: 'M5' as const })),
    ...(siteQueue.data ?? []).map((item) => ({ ...item, phaseCode: 'M6' as const })),
    ...(certificateQueue.data ?? []).map((item) => ({ ...item, phaseCode: 'M7' as const })),
  ];
  const isLoading = deepQueue.isLoading || siteQueue.isLoading || certificateQueue.isLoading;
  const error = deepQueue.error || siteQueue.error || certificateQueue.error;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CreditCard size={18} className="text-anac-navy" />
        <h1 className="text-anac-navy text-xl font-semibold">Paiements S5</h1>
      </div>
      <p className="text-anac-muted text-sm">
        Dossiers dont la facture ou la quittance attend une action S5.
      </p>

      {isLoading && <p className="text-anac-muted text-sm">Chargement...</p>}
      {error && <p className="text-anac-danger text-sm">Impossible de charger les paiements.</p>}

      {!isLoading && data.length === 0 && (
        <div className="card">
          <p className="text-anac-muted text-sm">Aucun paiement a traiter pour le moment.</p>
        </div>
      )}

      {!isLoading && data.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-anac-gray text-anac-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Reference</th>
                <th className="text-left px-4 py-2">Phase</th>
                <th className="text-left px-4 py-2">Organisme</th>
                <th className="text-left px-4 py-2">Statut</th>
                <th className="text-left px-4 py-2">Prochaine action</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-anac-border">
              {data.map((item) => (
                <tr key={item.phaseId}>
                  <td className="px-4 py-2 font-medium">{item.requestReference}</td>
                  <td className="px-4 py-2 text-anac-muted text-xs">
                    {item.phaseCode === 'M5'
                      ? 'Evaluation approfondie'
                      : item.phaseCode === 'M6'
                        ? 'Demonstration'
                        : 'Delivrance'}
                  </td>
                  <td className="px-4 py-2">{item.organisationName}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={item.payment.status} />
                  </td>
                  <td className="px-4 py-2 text-anac-muted text-xs">
                    {NEXT_ACTION_LABELS[item.nextAction]}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      to={
                        item.phaseCode === 'M5'
                          ? `/demandes/${item.requestId}/evaluation-approfondie`
                          : item.phaseCode === 'M6'
                            ? `/demandes/${item.requestId}/demonstration-inspection`
                            : `/demandes/${item.requestId}/delivrance`
                      }
                      className="text-anac-blue underline text-xs"
                    >
                      Ouvrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

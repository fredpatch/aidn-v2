import { useState } from 'react';
import { Printer, Download } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { API_ORIGIN, CERTIFICATE_STATUS_LABELS, CERTIFICATE_STATUS_TONES } from '../constants';
import { formatDateTime } from '../helpers';
import { useCertificateLifecycle } from '../hooks/useCertificateLifecycle';
import type { CertificateView } from '../types';
import PhaseStatusBadge from '../../preliminary/components/PhaseStatusBadge';

interface LifecycleCardProps {
  requestId: string | undefined;
  certificate: CertificateView;
  paymentValidated: boolean;
  setActionError: (message: string | null) => void;
}

export default function LifecycleCard({
  requestId,
  certificate,
  paymentValidated,
  setActionError,
}: LifecycleCardProps) {
  const { busy, generate, advance } = useCertificateLifecycle(requestId, setActionError);
  const [lastGeneratedUrl, setLastGeneratedUrl] = useState<string | null>(null);

  const hasBeenGenerated = certificate.status !== 'in_preparation' || lastGeneratedUrl !== null;
  const scopeFilled =
    !!certificate.scopeDetails &&
    Object.values(certificate.scopeDetails).every((c) => c.qualification.trim() !== '');

  async function handleGenerate() {
    const result = await generate(certificate.id);
    if (result) setLastGeneratedUrl(result.fileUrl);
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Printer size={16} className="text-anac-navy" />
          <span className="font-medium text-sm">Génération et cycle de délivrance</span>
        </div>
        <PhaseStatusBadge
          status={certificate.status}
          label={CERTIFICATE_STATUS_LABELS[certificate.status] ?? certificate.status}
          toneMap={CERTIFICATE_STATUS_TONES}
        />
      </div>

      {certificate.status === 'in_preparation' && (
        <div className="space-y-2">
          {!paymentValidated ? (
            <p className="text-anac-muted text-xs">Le paiement doit être validé au préalable.</p>
          ) : !scopeFilled || !certificate.approvalReferenceNumber ? (
            <p className="text-anac-muted text-xs">
              Renseignez le N° de référence et les 4 catégories de qualification avant de générer.
            </p>
          ) : (
            <Button size="sm" onClick={handleGenerate} disabled={busy}>
              {busy ? 'Génération...' : 'Générer le certificat'}
            </Button>
          )}
          {lastGeneratedUrl && (
            <p className="text-xs">
              <a
                href={`${API_ORIGIN}${lastGeneratedUrl}`}
                target="_blank"
                rel="noreferrer"
                className="underline text-anac-blue inline-flex items-center gap-1"
              >
                <Download size={12} /> Télécharger le document généré
              </a>
            </p>
          )}
          {hasBeenGenerated && (
            <Button size="sm" variant="secondary" onClick={() => advance(certificate.id, 'printed')} disabled={busy}>
              Marquer comme imprimé
            </Button>
          )}
        </div>
      )}

      {certificate.status === 'printed' && (
        <div className="space-y-1">
          <p className="text-xs text-anac-muted">Imprimé le {formatDateTime(certificate.printedAt)}.</p>
          <Button size="sm" onClick={() => advance(certificate.id, 'signed')} disabled={busy}>
            Marquer comme signé (DG)
          </Button>
        </div>
      )}

      {certificate.status === 'signed' && (
        <div className="space-y-1">
          <p className="text-xs text-anac-muted">Signé le {formatDateTime(certificate.signedAt)}.</p>
          <Button size="sm" onClick={() => advance(certificate.id, 'archived')} disabled={busy}>
            Marquer comme archivé
          </Button>
        </div>
      )}

      {certificate.status === 'archived' && (
        <div className="space-y-1">
          <p className="text-xs text-anac-muted">Archivé le {formatDateTime(certificate.archivedAt)}.</p>
          <Button size="sm" onClick={() => advance(certificate.id, 'notify')} disabled={busy}>
            Notifier le postulant (prêt pour retrait)
          </Button>
        </div>
      )}

      {certificate.status === 'notified' && (
        <div className="space-y-1">
          <p className="text-xs text-anac-muted">
            Postulant notifié le {formatDateTime(certificate.notifiedAt)} — en attente de retrait en personne.
          </p>
          <Button size="sm" onClick={() => advance(certificate.id, 'collected')} disabled={busy}>
            Marquer comme retiré
          </Button>
        </div>
      )}

      {certificate.status === 'collected' && (
        <div className="space-y-1 text-xs">
          <p className="text-anac-success">
            Retiré le {formatDateTime(certificate.collectedAt)} — phase clôturée automatiquement.
          </p>
          {certificate.daysToDeliver !== null && (
            <p className="text-anac-muted">
              Délai de délivrance (paiement → notification) : {certificate.daysToDeliver} jour(s).
            </p>
          )}
          {certificate.daysToCollect !== null && (
            <p className="text-anac-muted">
              Délai de retrait (notification → retrait) : {certificate.daysToCollect} jour(s).
            </p>
          )}
        </div>
      )}
    </div>
  );
}

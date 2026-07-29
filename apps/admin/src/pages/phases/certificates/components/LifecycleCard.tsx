import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
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
  const { busy, generate, advance, registerSignedReturn } = useCertificateLifecycle(
    requestId,
    setActionError
  );
  const [lastGeneratedUrl, setLastGeneratedUrl] = useState<string | null>(null);
  const [signedReturnFile, setSignedReturnFile] = useState<File | null>(null);

  const hasBeenGenerated = certificate.status !== 'in_preparation' || lastGeneratedUrl !== null;
  const scopeFilled =
    !!certificate.scopeDetails &&
    Object.values(certificate.scopeDetails).every((category) => category.qualification.trim() !== '');

  async function handleGenerate() {
    const result = await generate(certificate.id);
    if (result) setLastGeneratedUrl(result.fileUrl);
  }

  async function handleSignedReturn() {
    if (!signedReturnFile) {
      setActionError('Joignez le certificat signe retourne avant de continuer.');
      return;
    }
    const ok = await registerSignedReturn(certificate.id, signedReturnFile);
    if (ok) setSignedReturnFile(null);
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Printer size={16} className="text-anac-navy" />
          <span className="font-medium text-sm">Generation et cycle de delivrance</span>
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
            <p className="text-anac-muted text-xs">Le paiement doit etre valide au prealable.</p>
          ) : !scopeFilled || !certificate.approvalReferenceNumber ? (
            <p className="text-anac-muted text-xs">
              Renseignez la reference et les 4 categories de qualification avant de generer.
            </p>
          ) : (
            <Button size="sm" onClick={handleGenerate} disabled={busy}>
              {busy ? 'Generation...' : 'Generer le certificat'}
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
                <Download size={12} /> Telecharger le document genere
              </a>
            </p>
          )}
          {hasBeenGenerated && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => advance(certificate.id, 'printed')}
              disabled={busy}
            >
              Marquer comme imprime
            </Button>
          )}
        </div>
      )}

      {certificate.status === 'printed' && (
        <div className="space-y-3">
          <p className="text-xs text-anac-muted">Imprime le {formatDateTime(certificate.printedAt)}.</p>
          <p className="text-xs text-anac-muted">
            Le certificat imprime doit revenir signe avant archivage. Scannez le document retourne,
            puis enregistrez le retour.
          </p>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={(event) => setSignedReturnFile(event.target.files?.[0] ?? null)}
          />
          <Button size="sm" onClick={handleSignedReturn} disabled={busy || !signedReturnFile}>
            Enregistrer le certificat signe retourne
          </Button>
        </div>
      )}

      {certificate.status === 'signed' && (
        <div className="space-y-2">
          <p className="text-xs text-anac-muted">Signe le {formatDateTime(certificate.signedAt)}.</p>
          {certificate.signedFileUrl && (
            <p className="text-xs">
              <a
                href={`${API_ORIGIN}${certificate.signedFileUrl}`}
                target="_blank"
                rel="noreferrer"
                className="underline text-anac-blue inline-flex items-center gap-1"
              >
                <Download size={12} /> Consulter le certificat signe retourne
              </a>
            </p>
          )}
          <Button size="sm" onClick={() => advance(certificate.id, 'archived')} disabled={busy}>
            Marquer comme archive
          </Button>
        </div>
      )}

      {certificate.status === 'archived' && (
        <div className="space-y-1">
          <p className="text-xs text-anac-muted">
            Archive le {formatDateTime(certificate.archivedAt)}.
          </p>
          <Button size="sm" onClick={() => advance(certificate.id, 'notify')} disabled={busy}>
            Notifier le postulant (pret pour retrait)
          </Button>
        </div>
      )}

      {certificate.status === 'notified' && (
        <div className="space-y-1">
          <p className="text-xs text-anac-muted">
            Postulant notifie le {formatDateTime(certificate.notifiedAt)} - en attente de retrait en
            personne.
          </p>
          <Button size="sm" onClick={() => advance(certificate.id, 'collected')} disabled={busy}>
            Marquer comme retire
          </Button>
        </div>
      )}

      {certificate.status === 'collected' && (
        <div className="space-y-1 text-xs">
          <p className="text-anac-success">
            Retire le {formatDateTime(certificate.collectedAt)} - phase cloturee automatiquement.
          </p>
          {certificate.daysToDeliver !== null && (
            <p className="text-anac-muted">
              Delai de delivrance (paiement vers notification) : {certificate.daysToDeliver} jour(s).
            </p>
          )}
          {certificate.daysToCollect !== null && (
            <p className="text-anac-muted">
              Delai de retrait (notification vers retrait) : {certificate.daysToCollect} jour(s).
            </p>
          )}
        </div>
      )}
    </div>
  );
}

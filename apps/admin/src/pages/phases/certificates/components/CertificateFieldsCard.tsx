import { useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { toDateInputValue } from '../helpers';
import { useCertificateFields } from '../hooks/useCertificateFields';
import type { CertificateView } from '../types';

interface CertificateFieldsCardProps {
  requestId: string | undefined;
  certificate: CertificateView;
  setActionError: (message: string | null) => void;
}

export default function CertificateFieldsCard({
  requestId,
  certificate,
  setActionError,
}: CertificateFieldsCardProps) {
  const editable = certificate.status === 'in_preparation';
  const { busy, saveFields, setType } = useCertificateFields(requestId, setActionError);

  const [approvalReferenceNumber, setApprovalReferenceNumber] = useState(
    certificate.approvalReferenceNumber ?? ''
  );
  const [expiresAt, setExpiresAt] = useState(toDateInputValue(certificate.expiresAt));
  const [initialIssueDate, setInitialIssueDate] = useState(
    toDateInputValue(certificate.initialIssueDate)
  );
  const [currentIssueDate, setCurrentIssueDate] = useState(
    toDateInputValue(certificate.currentIssueDate)
  );
  const [dgFullNameOverride, setDgFullNameOverride] = useState(certificate.dgFullNameOverride ?? '');

  async function handleSave() {
    await saveFields(certificate.id, {
      approvalReferenceNumber,
      expiresAt: expiresAt || undefined,
      initialIssueDate: initialIssueDate || undefined,
      currentIssueDate: currentIssueDate || undefined,
      dgFullNameOverride: dgFullNameOverride || undefined,
    });
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-anac-navy" />
          <span className="font-medium text-sm">
            Certificat {certificate.reference} — Informations
          </span>
        </div>
      </div>

      <div>
        <label className="label">Type de certificat</label>
        <select
          className="input"
          value={certificate.certificateType}
          disabled={!editable || busy}
          onChange={(e) => setType(certificate.id, e.target.value as 'agreement' | 'recognition')}
        >
          <option value="agreement">Agrément</option>
          <option value="recognition">Reconnaissance</option>
        </select>
        {certificate.typeOverriddenBy && (
          <p className="text-anac-muted text-xs mt-1">
            Type modifié manuellement par un agent DN.
          </p>
        )}
      </div>

      <div>
        <label className="label">N° de référence de l&apos;agrément</label>
        <input
          className="input"
          value={approvalReferenceNumber}
          disabled={!editable}
          onChange={(e) => setApprovalReferenceNumber(e.target.value)}
          placeholder="ex. GA.5.3-.01-2023"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label">Date de délivrance initiale</label>
          <input
            type="date"
            className="input"
            value={initialIssueDate}
            disabled={!editable}
            onChange={(e) => setInitialIssueDate(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Date de délivrance en vigueur</label>
          <input
            type="date"
            className="input"
            value={currentIssueDate}
            disabled={!editable}
            onChange={(e) => setCurrentIssueDate(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Date d&apos;expiration</label>
          <input
            type="date"
            className="input"
            value={expiresAt}
            disabled={!editable}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="label">Directeur Général (laisser vide pour utiliser le nom par défaut)</label>
        <input
          className="input"
          value={dgFullNameOverride}
          disabled={!editable}
          onChange={(e) => setDgFullNameOverride(e.target.value)}
          placeholder="Général de Division ..."
        />
      </div>

      {editable ? (
        <Button size="sm" onClick={handleSave} disabled={busy}>
          Enregistrer
        </Button>
      ) : (
        <p className="text-anac-muted text-xs">
          Ces champs ne sont plus modifiables (certificat déjà {certificate.status}).
        </p>
      )}
    </div>
  );
}

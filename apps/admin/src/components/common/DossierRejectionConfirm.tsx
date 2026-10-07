import { useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';

/**
 * Prefix the API puts in front of the reason when a payment rejection
 * cancels the dossier (`rejectPayment` in deep-evaluation, site-inspection
 * and certificates services). Duplicated here only to show the applicant's
 * wording before confirming - keep both in sync.
 */
export const DOSSIER_REJECTION_PREFIX = 'Paiement rejeté - dossier annulé : ';

export const DOSSIER_REJECTION_TITLE = 'Rejeter définitivement le dossier ?';

/** Solid red: reserved for the irreversible confirmation itself. */
export const FINAL_REJECTION_BUTTON_CLASS = 'bg-anac-danger text-white hover:bg-anac-danger/90';

/** What a final rejection does, including the exact reason the applicant will read. */
export function DossierRejectionSummary({ reason }: { reason: string }) {
  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-lg border border-anac-danger/25 bg-anac-danger/5 px-3 py-2 text-[13px] text-anac-danger">
        <AlertTriangle size={16} className="mt-px flex-shrink-0" aria-hidden="true" />
        <span>Cette action est définitive : elle ne peut pas être annulée depuis l&apos;application.</span>
      </p>
      <ul className="list-disc space-y-1.5 pl-[18px] text-[13px] leading-snug">
        <li>
          Le paiement et le dossier passent au statut <strong>Rejeté</strong> ; aucune phase ne pourra plus
          avancer.
        </li>
        <li>Le postulant verra ce motif sur son dossier :</li>
      </ul>
      <blockquote className="whitespace-pre-wrap rounded-md bg-anac-gray px-3 py-2 text-[13px]">
        {DOSSIER_REJECTION_PREFIX}
        {reason}
      </blockquote>
      <p className="text-[13px] text-anac-muted">L&apos;organisme pourra ensuite déposer une nouvelle demande.</p>
    </div>
  );
}

/** Second confirmation before a payment rejection cancels the dossier. Focus starts on Retour. */
export function DossierRejectionConfirmModal({
  subtitle,
  reason,
  busy,
  onConfirm,
  onCancel,
}: {
  subtitle: string;
  reason: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const backRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      title={DOSSIER_REJECTION_TITLE}
      subtitle={subtitle}
      onClose={() => {
        if (!busy) onCancel();
      }}
      initialFocusRef={backRef}
      footer={
        <>
          <Button ref={backRef} type="button" variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
            Retour
          </Button>
          <Button type="button" size="sm" className={FINAL_REJECTION_BUTTON_CLASS} disabled={busy} onClick={onConfirm}>
            {busy ? 'Rejet...' : 'Rejeter le dossier'}
          </Button>
        </>
      }
    >
      <DossierRejectionSummary reason={reason} />
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { apiErrorMessage } from '../../../lib/axios';
import { notify } from '../../../lib/notify';
import {
  fetchPreliminaryBundle,
  submitPreliminaryDeclaration,
  uploadFile,
} from '../../../lib/api/requests.api';
import type { PreliminaryBundle } from '../../../lib/api/requests.types';
import { API_ORIGIN, MEETING_STATUS_LABELS } from '../constants';

export function PreliminaryPhaseSection({ requestId }: { requestId: number }) {
  const [bundle, setBundle] = useState<PreliminaryBundle | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const data = await fetchPreliminaryBundle(requestId);
      setBundle(data);
    } catch {
      // Silently ignore so section remains hidden until the phase exists.
    }
  }

  useEffect(() => {
    load();
  }, [requestId]);

  if (!bundle?.phase) return null;

  async function handleSubmitDeclaration() {
    if (!file) {
      notify.warning('Merci de joindre votre déclaration remplie.');
      return;
    }
    const phaseId = bundle?.phase?.id;
    if (!phaseId) {
      return;
    }

    setSubmitting(true);
    try {
      const uploaded = await uploadFile(file);
      await submitPreliminaryDeclaration(phaseId, uploaded.fileUrl, uploaded.mimeType);
      notify.success('Déclaration soumise avec succès.');
      await load();
    } catch (err) {
      notify.error(apiErrorMessage(err, 'Impossible de soumettre la déclaration.'));
    } finally {
      setSubmitting(false);
    }
  }

  const phaseClosed = bundle.phase.status === 'closed';

  return (
    <div className="border-t border-anac-border pt-3 mt-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm text-anac-navy">Phase préliminaire</p>
        <span
          className={`text-[10px] px-2 py-0.5 rounded font-medium ${
            phaseClosed
              ? 'bg-anac-muted/10 text-anac-muted'
              : 'bg-anac-success/10 text-anac-success'
          }`}
        >
          {phaseClosed ? 'Clôturée' : 'En cours'}
        </span>
      </div>

      {bundle.meeting && (
        <div className="text-sm space-y-1">
          <p>
            Réunion le {new Date(bundle.meeting.scheduledAt).toLocaleString('fr-FR')}
            {bundle.meeting.location && ` - ${bundle.meeting.location}`}
          </p>
          <p>
            Statut :{' '}
            <span className="font-medium">
              {MEETING_STATUS_LABELS[bundle.meeting.status] ?? bundle.meeting.status}
            </span>
          </p>
          {bundle.meeting.status === 'scheduled' && (
            <a
              href={`${API_ORIGIN}/api/meetings/${bundle.meeting.id}/ticket`}
              target="_blank"
              rel="noreferrer"
              className="text-anac-blue underline text-xs"
            >
              Voir mon invitation
            </a>
          )}
          {bundle.meeting.crDocumentUrl && (
            <a
              href={`${API_ORIGIN}${bundle.meeting.crDocumentUrl}`}
              target="_blank"
              rel="noreferrer"
              className="text-anac-blue underline text-xs block"
            >
              Consulter le compte-rendu de la réunion
            </a>
          )}
        </div>
      )}

      {bundle.evaluation?.madeAvailableAt && (
        <div className="text-sm space-y-2">
          <p className="text-anac-muted text-xs">
            Retour attendu avant le{' '}
            {bundle.evaluation.returnDeadline &&
              new Date(bundle.evaluation.returnDeadline).toLocaleDateString('fr-FR')}
          </p>
          {bundle.evaluation.templateFileUrl && (
            <a
              href={`${API_ORIGIN}${bundle.evaluation.templateFileUrl}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary text-xs inline-block px-2 py-1 rounded"
            >
              Télécharger le formulaire vierge
            </a>
          )}
          {bundle.evaluation.submittedFileUrl ? (
            <p className="text-anac-success text-xs">Déclaration soumise, merci.</p>
          ) : (
            <div className="space-y-2">
              <input
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <button
                className="btn-primary text-xs px-3 py-1.5 rounded"
                onClick={handleSubmitDeclaration}
                disabled={submitting}
              >
                {submitting ? 'Envoi...' : 'Soumettre ma déclaration remplie'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

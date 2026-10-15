import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileCheck2, FileText } from 'lucide-react';
import FileLink from '../files/FileLink';
import { DOCUMENT_ACCEPT } from '../files/FileDropzone';
import { apiErrorMessage } from '../../lib/axios';
import { notify } from '../../lib/notify';
import { uploadFile } from '../../lib/uploads';
import { formatDate, formatDateTime } from '../../lib/format';
import { submitSignedMeetingReport, type MeetingReportBlock } from '../../lib/api/meetings.api';
import { queryKeys } from '../../lib/react-query/queryKeys';

/** SESSION1-MEET-2 - the DN compte-rendu of a held M3/M4 meeting and your
 *  signed return. Visible buttons, never a bare text link. Whether you may
 *  upload is decided by the API (canSubmitSignedReport); the signed copy is
 *  uploaded once - a correction goes through the DN. */

export type ReportableMeeting = MeetingReportBlock & { id: number; status: string; meetingType?: string };

/** Anchor of a meeting's report panel, for the dossier / dashboard actions. */
export function meetingReportAnchor(meetingId: number): string {
  return `compte-rendu-${meetingId}`;
}

/** Held meeting, never a site visit (M6 has no compte-rendu). */
export function showsReportPanel(meeting: { status: string; meetingType?: string }): boolean {
  return meeting.status === 'held' && meeting.meetingType !== 'site_visit';
}

const ACTION = 'btn-secondary rounded px-3 py-1.5 text-xs no-underline';

export function MeetingReportPanel({ meeting }: { meeting: ReportableMeeting }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const signed = meeting.signedCrDocumentUrl;
  const anchor = meetingReportAnchor(meeting.id);

  // Reached from a dashboard / dossier action (#compte-rendu-<id>): the panel
  // may mount after the navigation, so it brings itself into view.
  useEffect(() => {
    if (window.location.hash === `#${anchor}`) {
      document.getElementById(anchor)?.scrollIntoView?.({ block: 'start' });
    }
  }, [anchor]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;
    setBusy(true);
    try {
      const uploaded = await uploadFile(file);
      await submitSignedMeetingReport(meeting.id, uploaded.uploadAssetId);
      notify.success('Compte rendu signé transmis à la DN.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.meetings.all() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.requests.all() }),
      ]);
    } catch (err) {
      notify.error(apiErrorMessage(err, 'Impossible de transmettre le compte rendu signé.'));
    } finally {
      setBusy(false);
    }
  }

  const pick = () => inputRef.current?.click();

  if (!meeting.crDocumentUrl) {
    return (
      <div
        id={anchor}
        className="mt-3 scroll-mt-4 rounded-lg border border-anac-border bg-white p-3"
        role="region"
        aria-label="Compte rendu de réunion"
      >
        <p className="text-sm font-semibold text-anac-navy">Compte rendu de réunion</p>
        <p className="mt-1 text-sm text-anac-muted">Le compte rendu n&apos;est pas encore disponible.</p>
      </div>
    );
  }

  return (
    <div
      id={anchor}
      className="mt-3 scroll-mt-4 space-y-3"
      role="region"
      aria-label="Compte rendu de réunion"
    >
      <div className="rounded-lg border border-anac-border bg-white p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-anac-navy">
          <FileText size={16} className="text-anac-blue" aria-hidden="true" /> Compte rendu transmis par la DN
        </p>
        {meeting.crUploadedAt && <p className="text-xs text-anac-muted">Déposé le {formatDate(meeting.crUploadedAt)}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <FileLink address={meeting.crDocumentUrl} className={ACTION}>
            Consulter le compte rendu
          </FileLink>
          <FileLink address={meeting.crDocumentUrl} download className={ACTION}>
            Télécharger
          </FileLink>
        </div>
      </div>

      {signed ? (
        <div className="rounded-lg border border-anac-success/30 bg-anac-success/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-anac-success">
            <FileCheck2 size={16} aria-hidden="true" /> Compte rendu signé transmis
          </p>
          {meeting.signedCrUploadedAt && (
            <p className="text-xs text-anac-muted">Le {formatDateTime(meeting.signedCrUploadedAt)}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <FileLink address={signed} className={ACTION}>
              Consulter
            </FileLink>
            <FileLink address={signed} download className={ACTION}>
              Télécharger
            </FileLink>
          </div>
          <p className="mt-2 text-xs text-anac-muted">
            Pour toute correction, contactez la Direction de la Navigabilité.
          </p>
        </div>
      ) : meeting.canSubmitSignedReport ? (
        <div className="rounded-lg border border-anac-warning/40 bg-anac-warning/5 p-3">
          <p className="text-sm text-anac-text">Après signature, téléversez le compte rendu signé.</p>
          <button type="button" className="btn-primary mt-2 rounded px-3 py-1.5 text-xs" onClick={pick} disabled={busy}>
            Déposer le compte rendu signé
          </button>
        </div>
      ) : null}

      {meeting.canSubmitSignedReport && !signed && (
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          aria-label="Fichier du compte rendu signé"
          accept={DOCUMENT_ACCEPT}
          onChange={handleFile}
          disabled={busy}
        />
      )}
    </div>
  );
}

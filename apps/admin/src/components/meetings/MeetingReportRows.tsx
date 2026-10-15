import { useRef, useState } from 'react';
import { FileCheck2, FileText, Upload } from 'lucide-react';
import DocumentPreviewLink from '../documents/DocumentPreviewLink';
import FileLink from '../files/FileLink';
import { Button } from '../ui/button';

/** SESSION1-MEET-2 - the two compte-rendu files of a held M3/M4 meeting, in
 *  two separate rows: the DN original (upload / replace until the applicant
 *  returns a signed copy) and the applicant's signed return (read only - no
 *  validation step exists). */

export interface MeetingReportFiles {
  crDocumentUrl: string | null;
  crUploadedAt: string | null;
  signedCrDocumentUrl: string | null;
  signedCrUploadedAt: string | null;
}

interface MeetingReportRowsProps {
  /** Meeting label, used as the document viewer title. */
  title: string;
  report: MeetingReportFiles;
  /** DN may upload now: open dossier, held meeting, managing role. */
  canUpload: boolean;
  busy?: boolean;
  /** Resolves false (or rejects) when the caller already reported an error. */
  onUpload?: (file: File) => Promise<unknown>;
}

const FROZEN =
  'Le compte rendu ne peut plus être remplacé car une version signée a déjà été retournée par le postulant.';
const LINK = 'rounded border border-anac-border px-2 py-1 text-xs font-medium text-anac-blue hover:bg-anac-gray';

function frDate(value: string | null, withTime = false): string {
  if (!value) return '';
  const date = new Date(value);
  return withTime
    ? date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    : date.toLocaleDateString('fr-FR');
}

function Badge({ tone, children }: { tone: 'muted' | 'info' | 'success'; children: string }) {
  const tones = {
    muted: 'bg-slate-100 text-slate-600',
    info: 'bg-anac-info/10 text-anac-info',
    success: 'bg-anac-success/10 text-anac-success',
  };
  return <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function MeetingReportRows({ title, report, canUpload, busy = false, onUpload }: MeetingReportRowsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const { crDocumentUrl, signedCrDocumentUrl } = report;

  async function submit() {
    if (!file || !onUpload) return;
    setSending(true);
    try {
      const result = await onUpload(file);
      if (result !== false) {
        setFile(null);
        if (inputRef.current) inputRef.current.value = '';
      }
    } catch {
      // The caller already shows the API message (setActionError).
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2 pt-1">
      <section aria-label="Compte rendu DN" className="rounded-lg border border-anac-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium text-anac-navy">
            <FileText size={14} aria-hidden="true" /> Compte rendu DN
          </p>
          <Badge tone={crDocumentUrl ? 'info' : 'muted'}>{crDocumentUrl ? 'Disponible' : 'Non déposé'}</Badge>
        </div>
        {crDocumentUrl && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-anac-muted">Déposé le {frDate(report.crUploadedAt)}</span>
            <DocumentPreviewLink title={`Compte rendu - ${title}`} url={crDocumentUrl} label="Consulter" className={LINK} />
            <FileLink address={crDocumentUrl} download className={LINK}>
              Télécharger
            </FileLink>
          </div>
        )}
        {canUpload && signedCrDocumentUrl && <p className="mt-2 text-xs text-anac-muted">{FROZEN}</p>}
        {canUpload && !signedCrDocumentUrl && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              aria-label="Fichier du compte rendu DN"
              className="text-xs"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <Button size="sm" variant="secondary" className="gap-1" onClick={submit} disabled={!file || busy || sending}>
              <Upload size={12} aria-hidden="true" />
              {crDocumentUrl ? 'Remplacer le compte rendu' : 'Déposer le compte rendu'}
            </Button>
          </div>
        )}
        {canUpload && (
          <p className="mt-1 text-[11px] text-anac-muted">Facultatif : la phase peut être clôturée sans compte rendu.</p>
        )}
      </section>

      {crDocumentUrl && (
        <section aria-label="Compte rendu signé par le postulant" className="rounded-lg border border-anac-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-anac-navy">
              <FileCheck2 size={14} aria-hidden="true" /> Compte rendu signé par le postulant
            </p>
            {signedCrDocumentUrl ? (
              <Badge tone="success">{`Reçu le ${frDate(report.signedCrUploadedAt, true)}`}</Badge>
            ) : (
              <Badge tone="muted">En attente du postulant</Badge>
            )}
          </div>
          {signedCrDocumentUrl && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <DocumentPreviewLink title={`Compte rendu signé - ${title}`} url={signedCrDocumentUrl} label="Consulter" className={LINK} />
              <FileLink address={signedCrDocumentUrl} download className={LINK}>
                Télécharger
              </FileLink>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Download, ExternalLink, FileWarning, RefreshCw, X } from 'lucide-react';
import { Button } from '../ui/button';
import FileLink from '../files/FileLink';
import { requestFileGrant } from '../../lib/file-access';
import { fileAccessErrorMessage, previewKindForMime, type FileGrant } from '../../lib/files';

interface DocumentViewerFile {
  title: string;
  /** Stable file address (/api/files/<id>). */
  url: string;
}

interface DocumentViewerProps {
  file: DocumentViewerFile | null;
  onClose: () => void;
  primaryActionLabel?: string;
  primaryActionDisabled?: boolean;
  onPrimaryAction?: () => void;
  actionHint?: string;
  actionBar?: ReactNode;
}

type GrantState =
  | { status: 'loading' }
  | { status: 'ready'; grant: FileGrant }
  | { status: 'error'; message: string };

/** STORAGE-0A: the viewer asks for a 5-minute inline grant when it opens and
 *  picks the preview from the grant's server-side MIME type (never from the
 *  URL). « Réessayer » asks for a fresh grant. */
export default function DocumentViewer({
  file,
  onClose,
  primaryActionLabel,
  primaryActionDisabled = false,
  onPrimaryAction,
  actionHint,
  actionBar,
}: DocumentViewerProps) {
  const [state, setState] = useState<GrantState>({ status: 'loading' });
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const address = file?.url ?? null;

  const loadGrant = useCallback(async () => {
    if (!address) return;
    setState({ status: 'loading' });
    setLoaded(false);
    setFailed(false);
    try {
      setState({ status: 'ready', grant: await requestFileGrant(address, 'inline') });
    } catch (error) {
      setState({ status: 'error', message: fileAccessErrorMessage(error) });
    }
  }, [address]);

  useEffect(() => {
    void loadGrant();
  }, [loadGrant]);

  useEffect(() => {
    if (!file) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [file, onClose]);

  if (!file) return null;

  const grant = state.status === 'ready' ? state.grant : null;
  const kind = grant ? previewKindForMime(grant.mimeType) : 'unsupported';
  const canPreview = kind !== 'unsupported';

  return (
    <div className="fixed inset-0 z-50 bg-anac-navy/40 p-4" role="dialog" aria-modal="true">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-lg border border-anac-border bg-white shadow-xl">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-anac-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-anac-navy">{file.title}</h2>
            <p className="mt-0.5 text-xs text-anac-muted">
              {actionHint ??
                (state.status === 'loading'
                  ? 'Ouverture du document…'
                  : canPreview
                    ? 'Prévisualisation intégrée'
                    : 'Prévisualisation non disponible pour ce type de fichier')}
            </p>
          </div>

          <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
            <FileLink
              address={file.url}
              className="btn-secondary inline-flex h-8 items-center gap-1 rounded px-3 text-[13px]"
            >
              <ExternalLink size={14} aria-hidden="true" />
              Nouvel onglet
            </FileLink>
            <FileLink
              address={file.url}
              download
              className="btn-secondary inline-flex h-8 items-center gap-1 rounded px-3 text-[13px]"
            >
              <Download size={14} aria-hidden="true" />
              Télécharger
            </FileLink>
            {onPrimaryAction && primaryActionLabel && (
              <Button size="sm" onClick={onPrimaryAction} disabled={primaryActionDisabled}>
                {primaryActionLabel}
              </Button>
            )}
            {actionBar}
            <Button size="sm" variant="ghost" onClick={onClose} aria-label="Fermer le visualiseur">
              <X size={16} aria-hidden="true" />
            </Button>
          </div>
        </header>

        <div className="relative min-h-0 flex-1 bg-anac-gray">
          {(state.status === 'loading' || (canPreview && !loaded && !failed)) && state.status !== 'error' && (
            <div className="absolute inset-0 grid place-items-center text-sm text-anac-muted">
              Chargement du document...
            </div>
          )}

          {(state.status === 'error' || failed) && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              <div>
                <FileWarning className="mx-auto mb-3 text-anac-warning" size={28} />
                <p className="text-sm font-medium text-anac-navy">
                  {state.status === 'error' ? state.message : 'Le document ne peut pas être affiché ici.'}
                </p>
                <p className="mt-1 text-xs text-anac-muted">
                  Le lien d’ouverture expire après quelques minutes.
                </p>
                <Button size="sm" variant="secondary" className="mt-3" onClick={() => void loadGrant()}>
                  <RefreshCw size={14} aria-hidden="true" />
                  Réessayer
                </Button>
              </div>
            </div>
          )}

          {grant && kind === 'pdf' && !failed && (
            <iframe
              title={file.title}
              src={grant.url}
              className="h-full w-full bg-white"
              onLoad={() => setLoaded(true)}
            />
          )}

          {grant && kind === 'image' && !failed && (
            <div className="flex h-full items-center justify-center overflow-auto p-4">
              <img
                src={grant.url}
                alt={file.title}
                className="max-h-full max-w-full object-contain"
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
              />
            </div>
          )}

          {grant && kind === 'unsupported' && (
            <div className="grid h-full place-items-center p-6 text-center">
              <div>
                <FileWarning className="mx-auto mb-3 text-anac-muted" size={28} />
                <p className="text-sm font-medium text-anac-navy">
                  Ce format doit être ouvert hors de l’application.
                </p>
                <p className="mt-1 text-xs text-anac-muted">
                  Les fichiers DOC, DOCX et autres formats bureautiques sont conservés en
                  téléchargement pour cette version.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

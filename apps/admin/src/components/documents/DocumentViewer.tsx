import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Download, ExternalLink, FileWarning, X } from 'lucide-react';
import { Button } from '../ui/button';

interface DocumentViewerFile {
  title: string;
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

type PreviewKind = 'pdf' | 'image' | 'unsupported';

function previewKind(url: string): PreviewKind {
  const cleanUrl = url.split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.pdf')) return 'pdf';
  if (
    cleanUrl.endsWith('.png') ||
    cleanUrl.endsWith('.jpg') ||
    cleanUrl.endsWith('.jpeg') ||
    cleanUrl.endsWith('.webp')
  ) {
    return 'image';
  }
  return 'unsupported';
}

function resolveViewerUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'localhost' && parsed.port === '4000') {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // Relative URLs are already the preferred shape for proxied local files.
  }
  return url;
}

export default function DocumentViewer({
  file,
  onClose,
  primaryActionLabel,
  primaryActionDisabled = false,
  onPrimaryAction,
  actionHint,
  actionBar,
}: DocumentViewerProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const viewerUrl = useMemo(() => (file ? resolveViewerUrl(file.url) : ''), [file]);
  const kind = useMemo(() => (viewerUrl ? previewKind(viewerUrl) : 'unsupported'), [viewerUrl]);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [viewerUrl]);

  useEffect(() => {
    if (!file) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [file, onClose]);

  if (!file) return null;

  const canPreview = kind !== 'unsupported';

  return (
    <div className="fixed inset-0 z-50 bg-anac-navy/40 p-4" role="dialog" aria-modal="true">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-lg border border-anac-border bg-white shadow-xl">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-anac-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-anac-navy">{file.title}</h2>
            <p className="mt-0.5 text-xs text-anac-muted">
              {actionHint ??
                (canPreview
                  ? 'Prévisualisation intégrée'
                  : 'Prévisualisation non disponible pour ce type de fichier')}
            </p>
          </div>

          <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
            <a
              href={viewerUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary inline-flex h-8 items-center gap-1 rounded px-3 text-[13px]"
            >
              <ExternalLink size={13} aria-hidden="true" />
              Nouvel onglet
            </a>
            <a
              href={viewerUrl}
              download
              className="btn-secondary inline-flex h-8 items-center gap-1 rounded px-3 text-[13px]"
            >
              <Download size={13} aria-hidden="true" />
              Télécharger
            </a>
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
          {canPreview && !loaded && !failed && (
            <div className="absolute inset-0 grid place-items-center text-sm text-anac-muted">
              Chargement du document...
            </div>
          )}

          {failed && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              <div>
                <FileWarning className="mx-auto mb-3 text-anac-warning" size={28} />
                <p className="text-sm font-medium text-anac-navy">
                  Le document ne peut pas être affiché ici.
                </p>
                <p className="mt-1 text-xs text-anac-muted">
                  Ouvrez-le dans un nouvel onglet ou téléchargez-le.
                </p>
              </div>
            </div>
          )}

          {kind === 'pdf' && !failed && (
            <iframe
              title={file.title}
              src={viewerUrl}
              className="h-full w-full bg-white"
              onLoad={() => setLoaded(true)}
            />
          )}

          {kind === 'image' && !failed && (
            <div className="flex h-full items-center justify-center overflow-auto p-4">
              <img
                src={viewerUrl}
                alt={file.title}
                className="max-h-full max-w-full object-contain"
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
              />
            </div>
          )}

          {kind === 'unsupported' && (
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

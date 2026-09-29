import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, FileText, History, RefreshCw } from "lucide-react";
import { api, apiErrorMessage } from "../../../lib/axios";
import { Button } from "../../../components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetHeader } from "../../../components/ui/sheet";
import { formatDateTime, formatMimeType } from "../format";
import FileLink from '../../../components/files/FileLink';

interface TemplateVersionView {
  id: number;
  fileUrl: string;
  fileExists: boolean;
  mimeType: string;
  uploadedAt: string;
  uploadedByName: string | null;
  isCurrent: boolean;
}

export interface TemplateHistoryTarget {
  templateKey: string;
  title: string;
  subtitle: string;
}

/** Read-only history of the files published for one template key.
 *  No restore action on purpose - only the active file is used in workflows.
 *  Stays mounted so the sheet can animate out after `target` is cleared. */
export function TemplateHistorySheet({
  target,
  onClose,
}: {
  target: TemplateHistoryTarget | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        {target && <HistoryPanel key={target.templateKey} {...target} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function HistoryPanel({
  templateKey,
  title,
  subtitle,
  onClose,
}: TemplateHistoryTarget & { onClose: () => void }) {
  const [versions, setVersions] = useState<TemplateVersionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/document-templates/${templateKey}/versions`);
      setVersions(data);
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger l’historique."));
    } finally {
      setLoading(false);
    }
  }, [templateKey]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
        <SheetHeader onClose={onClose}>
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-anac-muted">
            <History size={13} aria-hidden="true" />
            Historique des versions
          </p>
          <h2 className="mt-1 truncate text-base font-semibold text-anac-navy">{title}</h2>
          <p className="mt-0.5 text-xs text-anac-muted">{subtitle}</p>
        </SheetHeader>

        <SheetBody>
          {error ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertTriangle size={20} className="text-anac-danger" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-anac-text">Impossible de charger l’historique.</p>
                <p className="mt-1 text-xs text-anac-muted">{error}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={load}>
                <RefreshCw size={14} aria-hidden="true" />
                Réessayer
              </Button>
            </div>
          ) : loading ? (
            <ul className="space-y-3" aria-busy="true" aria-label="Chargement de l’historique">
              {[0, 1, 2].map((i) => (
                <li key={i} className="animate-pulse space-y-2 rounded-lg border border-anac-border px-4 py-3">
                  <div className="h-3.5 w-40 rounded bg-anac-gray" />
                  <div className="h-3 w-28 rounded bg-anac-gray" />
                </li>
              ))}
            </ul>
          ) : versions.length === 0 ? (
            <p className="py-10 text-center text-sm text-anac-muted">Aucune version enregistrée.</p>
          ) : (
            <ol className="space-y-3">
              {versions.map((version, index) => (
                <VersionItem key={version.id} version={version} number={versions.length - index} />
              ))}
            </ol>
          )}
        </SheetBody>

        <div className="border-t border-anac-border bg-anac-gray/50 px-5 py-3 text-xs text-anac-muted">
          Les versions précédentes sont conservées pour consultation uniquement ; elles ne peuvent pas être
          restaurées depuis cet écran.
        </div>
    </>
  );
}

function VersionItem({ version, number }: { version: TemplateVersionView; number: number }) {
  const date = formatDateTime(version.uploadedAt) ?? "Date non renseignée";
  const format = formatMimeType(version.mimeType) ?? "Format inconnu";

  return (
    <li
      className={
        version.isCurrent
          ? "rounded-lg border border-anac-success/30 bg-anac-success/5 px-4 py-3"
          : "rounded-lg border border-anac-border px-4 py-3"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-anac-navy">
            Version {number}
            {version.isCurrent && (
              <span className="ml-2 inline-flex items-center rounded-full border border-anac-success/20 bg-anac-success/10 px-2 py-0.5 align-middle text-[11px] font-medium text-anac-success">
                Actif
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-anac-muted">{date}</p>
          <p className="mt-0.5 text-xs text-anac-muted">
            Publié par {version.uploadedByName ?? "Utilisateur inconnu"}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-anac-text">
          <FileText size={13} className="text-anac-muted" aria-hidden="true" />
          {format}
        </span>
      </div>
      <div className="mt-2">
        {version.fileExists ? (
          <FileLink
            address={version.fileUrl}
            title={`Consulter la version ${number} (nouvel onglet)`}
            className="inline-flex items-center gap-1 text-xs font-medium text-anac-blue hover:underline"
          >
            <ExternalLink size={12} aria-hidden="true" />
            Consulter
          </FileLink>
        ) : (
          <p className="inline-flex items-center gap-1 text-xs text-anac-danger">
            <AlertTriangle size={12} aria-hidden="true" />
            Fichier introuvable
          </p>
        )}
      </div>
    </li>
  );
}

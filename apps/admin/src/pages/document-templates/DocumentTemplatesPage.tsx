import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink, FileText, History, Info, RefreshCw, Search, UploadCloud } from "lucide-react";
import { api, apiErrorMessage } from "../../lib/axios";
import { uploadFile } from "../../lib/uploads";
import { cn } from "../../lib/utils";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Modal } from "../../components/ui/modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { TemplateHistorySheet } from "./components/TemplateHistorySheet";
import { formatDate, formatMimeType } from "./format";
import {
  deriveTemplatePageStatus,
  KNOWN_TEMPLATES,
  PHASE_LABELS,
  type KnownTemplate,
  type Phase,
  type TemplatePageStatus,
} from "./known-templates";
import FileLink from "../../components/files/FileLink";

interface TemplateView {
  id: number;
  key: string;
  label: string;
  fileUrl: string | null;
  fileExists: boolean;
  mimeType: string | null;
  uploadedAt: string | null;
  active: boolean;
}

type TemplateStatus = TemplatePageStatus;

const STATUS_META: Record<
  TemplateStatus,
  { label: string; className: string; icon: typeof CheckCircle2; hint?: string }
> = {
  available: {
    label: "Disponible",
    className: "border-anac-success/20 bg-anac-success/10 text-anac-success",
    icon: CheckCircle2,
  },
  missing: {
    label: "Fichier introuvable",
    className: "border-anac-danger/20 bg-anac-danger/10 text-anac-danger",
    icon: AlertTriangle,
    hint: "Le fichier référencé n’est plus disponible sur le serveur.",
  },
  inactive: {
    label: "Inactif",
    className: "border-anac-warning/20 bg-anac-warning/10 text-anac-warning",
    icon: CircleDashed,
    hint: "Le modèle n’est pas proposé dans les workflows.",
  },
  unconfigured: {
    label: "À configurer",
    className: "border-anac-warning/20 bg-anac-warning/10 text-anac-warning",
    icon: CircleDashed,
    hint: "Aucun fichier publié pour ce modèle.",
  },
};

interface TemplateRow {
  known: KnownTemplate;
  existing: TemplateView | undefined;
  status: TemplateStatus;
  label: string;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function DocumentTemplatesPage() {
  const [templates, setTemplates] = useState<TemplateView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<"all" | Phase>("all");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/document-templates");
      setTemplates(data);
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger les modèles de documents."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo<TemplateRow[]>(
    () =>
      KNOWN_TEMPLATES.map((known) => {
        const existing = templates.find((t) => t.key === known.key);
        return { known, existing, status: deriveTemplatePageStatus(existing), label: existing?.label ?? known.defaultLabel };
      }),
    [templates]
  );

  const counts = useMemo(
    () => ({
      available: rows.filter((r) => r.status === "available").length,
      toConfigure: rows.filter((r) => r.status === "unconfigured" || r.status === "inactive").length,
      missing: rows.filter((r) => r.status === "missing").length,
    }),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const query = normalize(search.trim());
    return rows.filter((row) => {
      if (phaseFilter !== "all" && row.known.phase !== phaseFilter) return false;
      if (!query) return true;
      const haystack = [row.label, row.known.defaultLabel, row.known.key, PHASE_LABELS[row.known.phase], row.known.usageDescription]
        .map(normalize)
        .join(" ");
      return haystack.includes(query);
    });
  }, [rows, search, phaseFilter]);

  const editingRow = rows.find((r) => r.known.key === editingKey) ?? null;
  const historyRow = rows.find((r) => r.known.key === historyKey) ?? null;
  const showCounts = !loading && !error;

  return (
    <div className="mx-auto max-w-[1280px] space-y-5">
      <header>
        <h1 className="text-2xl font-semibold leading-tight text-anac-navy">Modèles de documents</h1>
        <p className="mt-1 text-sm text-anac-muted">
          Gérez les formulaires vierges officiels mis à disposition des postulants.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Synthèse des modèles">
        <SummaryTile value={KNOWN_TEMPLATES.length} label="modèles référencés" tone="navy" />
        <SummaryTile value={showCounts ? counts.available : null} label="disponibles" tone="success" />
        <SummaryTile value={showCounts ? counts.toConfigure : null} label="à configurer" tone="warning" />
        <SummaryTile value={showCounts ? counts.missing : null} label="fichier(s) introuvable(s)" tone="danger" />
      </section>

      <section className="overflow-hidden rounded-lg border border-anac-border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-anac-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-anac-navy">Bibliothèque des modèles</h2>
            <p className="mt-0.5 text-xs text-anac-muted">
              Le fichier actif est celui utilisé dans le workflow et proposé au téléchargement.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative block">
              <span className="sr-only">Rechercher un modèle</span>
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-anac-muted"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un modèle..."
                className="h-9 w-[240px] pl-9"
              />
            </label>
            <Select value={phaseFilter} onValueChange={(v) => setPhaseFilter(v as "all" | Phase)}>
              <SelectTrigger className="h-9 w-[180px]" aria-label="Filtrer par phase">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les phases</SelectItem>
                <SelectItem value="preliminary">{PHASE_LABELS.preliminary}</SelectItem>
                <SelectItem value="formal">{PHASE_LABELS.formal}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="secondary" size="sm" className="h-9" onClick={load} disabled={loading}>
              <RefreshCw size={14} aria-hidden="true" className={cn(loading && "animate-spin")} />
              Actualiser
            </Button>
          </div>
        </div>

        {error ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <AlertTriangle size={20} className="text-anac-danger" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-anac-text">Impossible de charger les modèles de documents.</p>
              <p className="mt-1 text-xs text-anac-muted">{error}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={load}>
              <RefreshCw size={14} aria-hidden="true" />
              Réessayer
            </Button>
          </div>
        ) : loading ? (
          <LoadingRows />
        ) : filteredRows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-anac-muted">Aucun modèle ne correspond à la recherche.</p>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Document</TableHead>
                    <TableHead>Phase / usage</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Dernière mise à jour</TableHead>
                    <TableHead>Fichier actif</TableHead>
                    <TableHead className="pr-5 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.known.key} className="align-top">
                      <TableCell className="max-w-[340px] pl-5">
                        <DocumentCell row={row} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <PhaseCell known={row.known} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <UpdatedCell row={row} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <FileCell row={row} />
                      </TableCell>
                      <TableCell className="pr-5">
                        <RowActions
                          row={row}
                          onEdit={() => setEditingKey(row.known.key)}
                          onHistory={() => setHistoryKey(row.known.key)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="divide-y divide-anac-border md:hidden">
              {filteredRows.map((row) => (
                <li key={row.known.key} className="space-y-3 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <DocumentCell row={row} />
                    <StatusBadge status={row.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <PhaseCell known={row.known} />
                    <UpdatedCell row={row} />
                  </div>
                  <FileCell row={row} />
                  <RowActions
                    row={row}
                    onEdit={() => setEditingKey(row.known.key)}
                    onHistory={() => setHistoryKey(row.known.key)}
                    align="start"
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <aside className="flex gap-3 rounded-lg border border-anac-sky/30 bg-anac-sky/5 px-5 py-4">
        <Info size={16} className="mt-0.5 shrink-0 text-anac-blue" aria-hidden="true" />
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-anac-navy">À propos des versions</h2>
          <p className="text-xs text-anac-muted">
            Remplacer un modèle ne supprime pas l’ancien fichier. AIDN conserve les versions précédentes ; seul le
            fichier actif est proposé dans les workflows.
          </p>
          <p className="text-xs text-anac-muted">
            Le bouton « Historique » de chaque modèle permet de consulter les versions publiées.
          </p>
        </div>
      </aside>

      <TemplateHistorySheet
        target={
          historyRow && {
            templateKey: historyRow.known.key,
            title: historyRow.label,
            subtitle: `${PHASE_LABELS[historyRow.known.phase]} · ${historyRow.known.usageDescription}`,
          }
        }
        onClose={() => setHistoryKey(null)}
      />

      {editingRow && (
        <UploadTemplateModal
          row={editingRow}
          onDone={() => {
            setEditingKey(null);
            load();
          }}
          onCancel={() => setEditingKey(null)}
        />
      )}
    </div>
  );
}

const TILE_TONES = {
  navy: "text-anac-navy",
  success: "text-anac-success",
  warning: "text-anac-warning",
  danger: "text-anac-danger",
} as const;

function SummaryTile({ value, label, tone }: { value: number | null; label: string; tone: keyof typeof TILE_TONES }) {
  return (
    <div className="rounded-lg border border-anac-border bg-white px-4 py-3 shadow-sm">
      {value === null ? (
        <div className="h-7 w-8 animate-pulse rounded bg-anac-gray" aria-hidden="true" />
      ) : (
        <p className={cn("text-2xl font-semibold leading-7", value === 0 && tone !== "navy" ? "text-anac-muted" : TILE_TONES[tone])}>
          {value}
        </p>
      )}
      <p className="mt-1 text-xs text-anac-muted">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: TemplateStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        meta.className
      )}
    >
      <Icon size={12} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function DocumentCell({ row }: { row: TemplateRow }) {
  return (
    <div className="min-w-0">
      <p className="font-medium text-anac-navy">{row.label}</p>
      <p className="mt-0.5 text-xs text-anac-muted">{row.known.usageDescription}</p>
      <p className="mt-1 font-mono text-[11px] text-anac-muted/80">{row.known.key}</p>
    </div>
  );
}

function PhaseCell({ known }: { known: KnownTemplate }) {
  return (
    <div>
      <p className="text-sm text-anac-text">{PHASE_LABELS[known.phase]}</p>
      <p className="mt-0.5 text-xs text-anac-muted">Module {known.module}</p>
    </div>
  );
}

function UpdatedCell({ row }: { row: TemplateRow }) {
  if (row.status === "unconfigured") {
    return <p className="text-sm text-anac-muted">Non publié</p>;
  }
  const date = formatDate(row.existing?.uploadedAt ?? null);
  return date ? (
    <p className="text-sm text-anac-text">{date}</p>
  ) : (
    <p className="text-sm text-anac-muted">Date non renseignée</p>
  );
}

function FileCell({ row }: { row: TemplateRow }) {
  const hint = STATUS_META[row.status].hint;
  if (row.status !== "available" || !row.existing?.fileUrl) {
    return <p className="max-w-[220px] whitespace-normal text-xs text-anac-muted">{hint}</p>;
  }
  const format = formatMimeType(row.existing.mimeType);
  return (
    <p className="inline-flex items-center gap-1.5 text-sm text-anac-text">
      <FileText size={14} className="text-anac-muted" aria-hidden="true" />
      {format ?? "Format inconnu"}
    </p>
  );
}

function RowActions({
  row,
  onEdit,
  onHistory,
  align = "end",
}: {
  row: TemplateRow;
  onEdit: () => void;
  onHistory: () => void;
  align?: "start" | "end";
}) {
  const canConsult = row.status === "available" && row.existing?.fileUrl;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", align === "end" ? "justify-end" : "justify-start")}>
      {canConsult && (
        <FileLink
          address={row.existing!.fileUrl}
          title={`Consulter le fichier actif de ${row.label} (nouvel onglet)`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-anac-border bg-white px-3 text-[13px] font-medium text-anac-navy transition-all hover:bg-anac-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky"
        >
          <ExternalLink size={14} aria-hidden="true" />
          Consulter
        </FileLink>
      )}
      {row.status === "unconfigured" ? (
        <Button size="sm" onClick={onEdit} aria-label={`Configurer le modèle ${row.label}`}>
          <UploadCloud size={14} aria-hidden="true" />
          Configurer le modèle
        </Button>
      ) : (
        <Button
          size="sm"
          variant={row.status === "available" ? "secondary" : "default"}
          onClick={onEdit}
          aria-label={`Remplacer le modèle ${row.label}`}
        >
          <UploadCloud size={14} aria-hidden="true" />
          Remplacer
        </Button>
      )}
      {row.existing && (
        <Button size="sm" variant="ghost" onClick={onHistory} aria-label={`Historique des versions de ${row.label}`}>
          <History size={14} aria-hidden="true" />
          Historique
        </Button>
      )}
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="divide-y divide-anac-border" aria-busy="true" aria-label="Chargement des modèles">
      {KNOWN_TEMPLATES.map((known) => (
        <div key={known.key} className="flex animate-pulse items-center gap-6 px-5 py-4">
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-48 rounded bg-anac-gray" />
            <div className="h-3 w-72 max-w-full rounded bg-anac-gray" />
          </div>
          <div className="hidden h-3.5 w-28 rounded bg-anac-gray md:block" />
          <div className="h-5 w-20 rounded-full bg-anac-gray" />
          <div className="hidden h-8 w-24 rounded-lg bg-anac-gray md:block" />
        </div>
      ))}
    </div>
  );
}

function UploadTemplateModal({
  row,
  onDone,
  onCancel,
}: {
  row: TemplateRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const isReplace = row.status !== "unconfigured";
  const [label, setLabel] = useState(row.existing?.label ?? row.known.defaultLabel);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError("Merci de sélectionner un fichier.");
      return;
    }

    setSubmitting(true);
    try {
      const uploaded = await uploadFile(file, "document-templates");

      await api.post("/document-templates", {
        key: row.known.key,
        label,
        uploadAssetId: uploaded.uploadAssetId,
      });

      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible d'enregistrer le modèle."));
    } finally {
      setSubmitting(false);
    }
  }

  const formId = `template-upload-${row.known.key}`;

  return (
    <Modal
      title={isReplace ? "Remplacer le modèle" : "Configurer le modèle"}
      subtitle={`${row.known.defaultLabel} · ${PHASE_LABELS[row.known.phase]}`}
      onClose={() => {
        if (!submitting) onCancel();
      }}
      footer={
        <>
          <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={submitting}>
            Annuler
          </Button>
          <Button type="submit" form={formId} size="sm" disabled={submitting}>
            {submitting ? "Enregistrement..." : isReplace ? "Remplacer le modèle" : "Configurer"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p role="alert" className="rounded-lg border border-anac-danger/20 bg-anac-danger/5 px-3 py-2 text-sm text-anac-danger">
            {error}
          </p>
        )}
        <div>
          <Label htmlFor={`${formId}-label`}>Libellé</Label>
          <Input
            id={`${formId}-label`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            autoFocus
            disabled={submitting}
          />
        </div>
        <div>
          <Label htmlFor={`${formId}-file`}>Fichier</Label>
          <label
            htmlFor={`${formId}-file`}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded border border-dashed border-anac-border bg-anac-gray/50 px-3 py-3 transition-colors hover:border-anac-sky",
              submitting && "pointer-events-none opacity-50"
            )}
          >
            <UploadCloud size={18} className="shrink-0 text-anac-muted" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-anac-text">
                {file ? file.name : "Sélectionner un fichier"}
              </span>
              <span className="block text-xs text-anac-muted">PDF, DOC, DOCX, PNG, JPG ou JPEG</span>
            </span>
          </label>
          <input
            id={`${formId}-file`}
            type="file"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={submitting}
            className="sr-only"
          />
          {isReplace && (
            <p className="mt-2 text-xs text-anac-muted">
              Le fichier actuel sera conservé dans l’historique des versions.
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}

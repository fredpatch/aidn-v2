import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, PlusCircle, RefreshCw, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import type { ServiceStatus, SystemStatus, TemplateHealthStatus } from '../../../lib/api/settings.types';
import { notify } from '../../../lib/notify';
import { cn } from '../../../lib/utils';
import { formatDateTime } from '../../document-templates/format';
import { useSystemHealth } from '../hooks/useSystemHealth';
import {
  formatBytes,
  legacyAddressesLabel,
  parameterLabel,
  runResultMessage,
  summarizeSystemStatus,
  TEMPLATE_HEALTH_META,
  templateUsage,
  type HealthTone,
} from '../system-health-ui';

const TONE_CLASS: Record<HealthTone, string> = {
  success: 'border-anac-success/20 bg-anac-success/10 text-anac-success',
  warning: 'border-anac-warning/20 bg-anac-warning/10 text-anac-warning',
  danger: 'border-anac-danger/20 bg-anac-danger/10 text-anac-danger',
  muted: 'border-anac-border bg-anac-gray text-anac-muted',
};

const TONE_ICON: Record<HealthTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  muted: CircleDashed,
};

function Pill({ tone, label }: { tone: HealthTone; label: string }) {
  const Icon = TONE_ICON[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium',
        TONE_CLASS[tone]
      )}
    >
      <Icon size={12} aria-hidden="true" />
      {label}
    </span>
  );
}

function Card({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-lg border border-anac-border bg-white shadow-sm">
      <header className="border-b border-anac-border px-5 py-3.5">
        <h2 id={id} className="text-sm font-semibold text-anac-navy">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-xs text-anac-muted">{description}</p>}
      </header>
      {children}
    </section>
  );
}

export function SystemHealthSection() {
  const { status, loading, error, refetch, refetching, run, running } = useSystemHealth();

  async function handleRun() {
    const { result, error: runError } = await run();
    if (runError) {
      notify.error(runError);
      return;
    }
    if (result) notify.success(runResultMessage(result));
  }

  if (loading) {
    return (
      <div className="max-w-4xl space-y-4" aria-busy="true" aria-label="Vérification de l’état du système">
        {[1, 3, 3].map((rows, index) => (
          <div key={index} className="rounded-lg border border-anac-border bg-white shadow-sm">
            <div className="space-y-2 border-b border-anac-border px-5 py-4">
              <div className="h-4 w-48 animate-pulse rounded bg-anac-gray" />
              <div className="h-3 w-72 max-w-full animate-pulse rounded bg-anac-gray" />
            </div>
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="flex items-center justify-between gap-6 border-b border-anac-border px-5 py-3.5 last:border-0">
                <div className="h-3.5 w-56 max-w-full animate-pulse rounded bg-anac-gray" />
                <div className="h-5 w-24 animate-pulse rounded-full bg-anac-gray" />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="flex max-w-4xl flex-col items-center gap-3 rounded-lg border border-anac-border bg-white px-5 py-10 text-center shadow-sm">
        <AlertTriangle size={20} className="text-anac-danger" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-anac-text">Impossible de vérifier l’état du système.</p>
          {error && <p className="mt-1 text-xs text-anac-muted">{error}</p>}
        </div>
        <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={refetching}>
          <RefreshCw size={14} className={cn(refetching && 'animate-spin')} aria-hidden="true" />
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-4" aria-busy={refetching || running}>
      <SummaryCard status={status} refetching={refetching} onRefresh={() => refetch()} />
      <ReferenceDataCard status={status} running={running} onRun={handleRun} />
      {status.referenceData && <TemplatesCard items={status.referenceData.documentTemplates.items} />}
      <InfrastructureCard status={status} />
    </div>
  );
}

function SummaryCard({ status, refetching, onRefresh }: { status: SystemStatus; refetching: boolean; onRefresh: () => void }) {
  const { title, detail } = summarizeSystemStatus(status);
  const healthy = status.overallStatus === 'healthy';
  const Icon = healthy ? CheckCircle2 : AlertTriangle;
  return (
    <section
      aria-labelledby="system-status-summary"
      className={cn(
        'flex flex-wrap items-start justify-between gap-4 rounded-lg border bg-white px-5 py-4 shadow-sm',
        healthy ? 'border-anac-border' : 'border-anac-warning/40'
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon
          size={20}
          className={cn('mt-0.5 shrink-0', healthy ? 'text-anac-success' : 'text-anac-warning')}
          aria-hidden="true"
        />
        <div className="min-w-0" role="status">
          <h2 id="system-status-summary" className="text-base font-semibold text-anac-navy">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-anac-muted">{detail}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <p className="text-right text-xs text-anac-muted">
          Dernière vérification
          <br />
          <time dateTime={status.checkedAt} className="font-medium text-anac-text">
            {formatDateTime(status.checkedAt)}
          </time>
        </p>
        <Button variant="secondary" size="sm" onClick={onRefresh} disabled={refetching}>
          <RefreshCw size={14} className={cn(refetching && 'animate-spin')} aria-hidden="true" />
          Actualiser
        </Button>
      </div>
    </section>
  );
}

function sectionPill(status: 'healthy' | 'attention') {
  return status === 'healthy' ? <Pill tone="success" label="Conforme" /> : <Pill tone="warning" label="Attention requise" />;
}

function ReferenceDataCard({ status, running, onRun }: { status: SystemStatus; running: boolean; onRun: () => void }) {
  const reference = status.referenceData;
  const missingParameters = reference?.systemParameters.items.filter((item) => item.status === 'missing') ?? [];
  const canRun = reference !== null && status.missingCount > 0 && !running;

  return (
    <Card
      id="system-status-reference"
      title="Données de référence"
      description="Paramètres système et modèles officiels attendus par l’application."
    >
      {reference ? (
        <dl className="divide-y divide-anac-border">
          <div className="flex items-center justify-between gap-4 px-5 py-3">
            <dt className="text-sm text-anac-text">Paramètres système</dt>
            <dd className="flex items-center gap-3">
              <span className="text-sm font-semibold tabular-nums text-anac-navy">
                {reference.systemParameters.present} / {reference.systemParameters.expected}
              </span>
              {sectionPill(reference.systemParameters.status)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-5 py-3">
            <dt className="text-sm text-anac-text">Modèles officiels</dt>
            <dd className="flex items-center gap-3">
              <span className="text-sm font-semibold tabular-nums text-anac-navy">
                {reference.documentTemplates.healthy} / {reference.documentTemplates.expected}
              </span>
              {sectionPill(reference.documentTemplates.status)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="px-5 py-4 text-sm text-anac-muted">
          Les données de référence n’ont pas pu être vérifiées : la base de données est inaccessible.
        </p>
      )}

      {missingParameters.length > 0 && (
        <div className="border-t border-anac-border bg-anac-gray/60 px-5 py-3">
          <h3 className="text-xs font-semibold text-anac-navy">Paramètres système manquants</h3>
          <ul className="mt-1.5 space-y-1">
            {missingParameters.map((item) => (
              <li key={item.key} className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
                <span className="text-anac-text">{parameterLabel(item.key)}</span>
                <code className="text-xs text-anac-muted">{item.key}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-anac-border px-5 py-3.5">
        <Button size="sm" onClick={onRun} disabled={!canRun} aria-describedby="system-status-run-help">
          {running ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <PlusCircle size={14} aria-hidden="true" />}
          {running ? 'Création en cours…' : 'Créer les éléments manquants'}
        </Button>
        <p id="system-status-run-help" className="text-xs text-anac-muted">
          {reference === null
            ? 'Indisponible tant que la base de données est inaccessible.'
            : status.missingCount === 0
              ? 'Aucun élément manquant.'
              : 'Crée uniquement les éléments absents. Les éléments existants ne sont jamais modifiés.'}
        </p>
      </div>
    </Card>
  );
}

function TemplateAction({ status }: { status: TemplateHealthStatus }) {
  if (status === 'file_missing') {
    return (
      <Link to="/modeles-documents" className="text-sm font-medium text-anac-navy underline-offset-2 hover:underline">
        Remplacer le modèle
      </Link>
    );
  }
  const hint = TEMPLATE_HEALTH_META[status].hint;
  if (!hint) {
    return (
      <span className="text-anac-muted">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Aucune action requise</span>
      </span>
    );
  }
  return <span className="text-xs text-anac-muted">{hint}</span>;
}

function TemplateState({ status }: { status: TemplateHealthStatus }) {
  const meta = TEMPLATE_HEALTH_META[status];
  return <Pill tone={meta.tone} label={meta.label} />;
}

function TemplatesCard({ items }: { items: NonNullable<SystemStatus['referenceData']>['documentTemplates']['items'] }) {
  return (
    <Card
      id="system-status-templates"
      title="Modèles officiels"
      description="Un modèle présent en base n’est utilisable que s’il est actif et que son fichier est disponible."
    >
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Modèle</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>État</TableHead>
              <TableHead className="pr-5">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.key} className="align-top">
                <TableCell className="pl-5 font-medium text-anac-navy">{item.label}</TableCell>
                <TableCell className="max-w-[260px] text-xs text-anac-muted">{templateUsage(item.key) ?? '—'}</TableCell>
                <TableCell>
                  <TemplateState status={item.status} />
                </TableCell>
                <TableCell className="max-w-[220px] pr-5">
                  <TemplateAction status={item.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="divide-y divide-anac-border md:hidden">
        {items.map((item) => (
          <li key={item.key} className="space-y-2 px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-anac-navy">{item.label}</p>
              <TemplateState status={item.status} />
            </div>
            {templateUsage(item.key) && <p className="text-xs text-anac-muted">{templateUsage(item.key)}</p>}
            <TemplateAction status={item.status} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

const SERVICE_LABEL: Record<ServiceStatus, string> = { available: 'Disponible', unavailable: 'Indisponible' };

function ServiceRow({
  label,
  details = [],
  status,
  warning,
}: {
  label: string;
  details?: string[];
  status: ServiceStatus;
  /** Shown instead of « Disponible » when the service is up but needs attention. */
  warning?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <dt className="min-w-0">
        <span className="text-sm text-anac-text">{label}</span>
        {details.map((detail) => (
          <span key={detail} className="block text-xs text-anac-muted">
            {detail}
          </span>
        ))}
      </dt>
      <dd className="shrink-0">
        {status === 'available' && warning ? (
          <Pill tone="warning" label={warning} />
        ) : (
          <Pill tone={status === 'available' ? 'success' : 'danger'} label={SERVICE_LABEL[status]} />
        )}
      </dd>
    </div>
  );
}

function storageDetails(storage: SystemStatus['infrastructure']['storage']): string[] {
  if (storage.status === 'unavailable') return ['Répertoire inaccessible'];
  const details = ['Répertoire accessible'];
  if (storage.freeBytes !== null && storage.totalBytes !== null) {
    const freePercent = Math.floor((storage.freeBytes / storage.totalBytes) * 100);
    details.push(`${formatBytes(storage.freeBytes)} libres sur ${formatBytes(storage.totalBytes)} (${freePercent} %)`);
  }
  return details;
}

function InfrastructureCard({ status }: { status: SystemStatus }) {
  const { database, storage } = status.infrastructure;
  const files = status.files;
  return (
    <Card id="system-status-infrastructure" title="Infrastructure" description="Services vérifiés par l’API au moment du contrôle.">
      <dl className="divide-y divide-anac-border">
        <ServiceRow label="API" status="available" />
        <ServiceRow
          label="Base de données"
          details={database.sizeBytes !== null ? [`Espace utilisé : ${formatBytes(database.sizeBytes)}`] : []}
          status={database.status}
        />
        <ServiceRow
          label="Stockage des fichiers"
          details={storageDetails(storage)}
          status={storage.status}
          warning={storage.lowSpace ? 'Espace faible' : undefined}
        />
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          <dt className="min-w-0">
            <span className="text-sm text-anac-text">Adresses de fichiers héritées</span>
            <span className="block text-xs text-anac-muted">Anciennes adresses /uploads non converties</span>
          </dt>
          <dd className="shrink-0">
            <Pill
              tone={files.legacyAddresses === null ? 'muted' : files.legacyAddresses === 0 ? 'success' : 'warning'}
              label={legacyAddressesLabel(files.legacyAddresses)}
            />
          </dd>
        </div>
      </dl>
    </Card>
  );
}

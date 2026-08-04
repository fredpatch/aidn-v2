import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleDashed,
  Clock3,
  FileArchive,
  HelpCircle,
  History,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { PHASE_ROADMAP } from '../preliminary/constants';
import { fetchPhasesSummary } from '../../../lib/api/phases.api';
import { queryKeys } from '../../../lib/react-query/queryKeys';
import { cn } from '../../../lib/utils';

export interface WorkflowChecklistItem {
  label: string;
  done: boolean;
  optional?: boolean;
}

export interface WorkflowKeyInfoItem {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'muted';
}

export interface WorkflowQuickLink {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

export interface WorkflowActionRailState {
  title: string;
  description: string;
  owner: string;
  tone: 'info' | 'warning' | 'success' | 'muted';
  blockReason?: string | null;
  primaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
}

interface WorkflowCockpitProps {
  requestId?: string;
  currentCode: string;
  title: string;
  dossierReference?: string;
  subtitle: string;
  phaseStatus?: string | null;
  backLabel?: string;
  onBack: () => void;
  checklistTitle: string;
  checklist: WorkflowChecklistItem[];
  action: WorkflowActionRailState;
  keyInfo: readonly WorkflowKeyInfoItem[];
  quickLinks?: readonly WorkflowQuickLink[];
  children: ReactNode;
}

const actionToneStyles = {
  info: {
    icon: Clock3,
    iconClass: 'text-anac-blue',
    badge: 'bg-anac-blue/10 text-anac-blue',
    ring: 'border-anac-blue/20 bg-anac-blue/5',
  },
  warning: {
    icon: Clock3,
    iconClass: 'text-anac-warning',
    badge: 'bg-anac-warning/10 text-anac-warning',
    ring: 'border-anac-warning/25 bg-anac-warning/5',
  },
  success: {
    icon: CheckCircle2,
    iconClass: 'text-anac-success',
    badge: 'bg-anac-success/10 text-anac-success',
    ring: 'border-anac-success/25 bg-anac-success/5',
  },
  muted: {
    icon: LockKeyhole,
    iconClass: 'text-anac-muted',
    badge: 'bg-anac-muted/10 text-anac-muted',
    ring: 'border-anac-border bg-white',
  },
};

function phaseStatusLabel(status: string | undefined, isCurrent: boolean): string {
  if (status === 'closed') return 'Terminee';
  if (status === 'open') return 'En cours';
  if (isCurrent) return 'En cours';
  return 'A venir';
}

function phaseDot(status: string | undefined, isCurrent: boolean, index: number) {
  if (isCurrent) {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-anac-blue text-[11px] font-semibold text-white shadow-sm ring-4 ring-white">
        {index + 1}
      </span>
    );
  }
  if (status === 'closed') {
    return <CheckCircle2 size={20} className="rounded-full bg-white text-anac-success ring-4 ring-white" aria-hidden="true" />;
  }
  if (status === 'open') {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-anac-blue text-[11px] font-semibold text-white shadow-sm ring-4 ring-white">
        {index + 1}
      </span>
    );
  }
  return <CircleDashed size={16} className="text-anac-muted/60" aria-hidden="true" />;
}

function infoToneClass(tone: WorkflowKeyInfoItem['tone']) {
  if (tone === 'success') return 'text-anac-success';
  if (tone === 'warning') return 'text-anac-warning';
  if (tone === 'danger') return 'text-anac-danger';
  if (tone === 'muted') return 'text-anac-muted';
  return 'text-anac-navy';
}

export default function WorkflowCockpit({
  requestId,
  currentCode,
  title,
  dossierReference,
  subtitle,
  phaseStatus,
  backLabel = 'Retour au dossier',
  onBack,
  checklistTitle,
  checklist,
  action,
  keyInfo,
  quickLinks,
  children,
}: WorkflowCockpitProps) {
  const navigate = useNavigate();
  const { data: phaseSummary } = useQuery({
    queryKey: requestId ? queryKeys.phases.summary(requestId) : queryKeys.phases.all,
    queryFn: () => fetchPhasesSummary(requestId!),
    enabled: !!requestId,
  });
  const completedCount = checklist.filter((item) => item.done).length;
  const ActionIcon = actionToneStyles[action.tone].icon;

  return (
    <div className="workflow-cockpit min-h-full -m-6 bg-[#f8fafc] text-anac-text [&_.card]:rounded-lg [&_.card]:border-anac-border [&_.card]:p-4 [&_.card]:shadow-sm">
      <div className="border-b border-anac-border/80 bg-white/90 px-6 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav className="flex items-center gap-2 text-xs text-anac-muted" aria-label="Fil d'Ariane">
            <span>Direction de la Navigabilite</span>
            <ChevronRight size={14} aria-hidden="true" />
            <span>{dossierReference ?? `Demande #${requestId ?? '-'}`}</span>
            <ChevronRight size={14} aria-hidden="true" />
            <span className="font-medium text-anac-navy">{title}</span>
          </nav>
          <div className="flex items-center gap-2 text-anac-muted">
            <button
              type="button"
              className="grid h-8 w-8 place-items-center rounded border border-transparent hover:border-anac-border hover:bg-anac-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky"
              aria-label="Aide"
            >
              <HelpCircle size={16} />
            </button>
            <button
              type="button"
              className="relative grid h-8 w-8 place-items-center rounded border border-transparent hover:border-anac-border hover:bg-anac-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky"
              aria-label="Notifications"
            >
              <Bell size={16} />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-anac-blue" />
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1480px] space-y-5 px-6 py-5">
        <header className="space-y-4">
          <button
            type="button"
            onClick={onBack}
            className="text-xs font-medium text-anac-muted transition-colors hover:text-anac-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky"
          >
            {'<-'} {backLabel}
          </button>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold leading-tight text-anac-navy">{title}</h1>
              <p className="mt-1 text-sm text-anac-muted">{subtitle}</p>
            </div>
            {phaseStatus && (
              <span
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-semibold',
                  phaseStatus === 'closed'
                    ? 'bg-anac-muted/10 text-anac-muted'
                    : 'bg-anac-blue/10 text-anac-blue'
                )}
              >
                {phaseStatus === 'closed' ? 'Cloturee' : 'En cours'}
              </span>
            )}
          </div>

          <section className="rounded-lg border border-anac-border bg-white px-5 py-4 shadow-sm">
            <ol className="grid gap-2 md:grid-cols-5" aria-label="Progression du dossier">
              {PHASE_ROADMAP.map((phase, index) => {
                const status = phaseSummary?.find((item) => item.phaseCode === phase.code)?.status;
                const isCurrent = phase.code === currentCode;
                return (
                  <li key={phase.code} className="relative min-w-0">
                    {index < PHASE_ROADMAP.length - 1 && (
                      <span className="absolute left-1/2 right-[-50%] top-3.5 z-0 hidden h-px bg-anac-border md:block" />
                    )}
                    <button
                      type="button"
                      onClick={() => requestId && navigate(`/demandes/${requestId}/${phase.path}`)}
                      disabled={isCurrent || !requestId}
                      className={cn(
                        'relative z-10 flex w-full items-center gap-3 rounded px-2 py-1.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky md:min-h-[72px] md:flex-col md:items-center md:justify-start md:text-center',
                        isCurrent ? 'bg-anac-blue/5' : 'hover:bg-anac-gray'
                      )}
                    >
                      {phaseDot(status, isCurrent, index)}
                      <span className="min-w-0">
                        <span
                          className={cn(
                            'block text-xs font-semibold',
                            isCurrent ? 'text-anac-blue' : status === 'closed' ? 'text-anac-navy' : 'text-anac-muted'
                          )}
                        >
                          {phase.label}
                        </span>
                        <span
                          className={cn(
                            'mt-0.5 block text-[10px]',
                            status === 'closed'
                              ? 'text-anac-success'
                              : isCurrent || status === 'open'
                                ? 'text-anac-blue'
                                : 'text-anac-muted'
                          )}
                        >
                          {phaseStatusLabel(status, isCurrent)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        </header>

        <div className="grid items-start gap-5 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
          <aside className="space-y-4 xl:sticky xl:top-4">
            <section className="rounded-lg border border-anac-border bg-white p-4 shadow-sm">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-anac-muted">
                Phases du dossier
              </p>
              <div className="space-y-1">
                {PHASE_ROADMAP.map((phase) => {
                  const status = phaseSummary?.find((item) => item.phaseCode === phase.code)?.status;
                  const isCurrent = phase.code === currentCode;
                  return (
                    <button
                      key={phase.code}
                      type="button"
                      onClick={() => requestId && navigate(`/demandes/${requestId}/${phase.path}`)}
                      disabled={isCurrent || !requestId}
                      className={cn(
                        'flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky',
                        isCurrent
                          ? 'bg-anac-blue/10 font-semibold text-anac-blue'
                          : 'text-anac-navy hover:bg-anac-gray'
                      )}
                    >
                      {status === 'closed' ? (
                        <CheckCircle2 size={14} className="text-anac-success" />
                      ) : isCurrent || status === 'open' ? (
                        <Circle size={14} className={cn('text-anac-blue', isCurrent && 'fill-anac-blue')} />
                      ) : (
                        <CircleDashed size={14} className="text-anac-muted/60" />
                      )}
                      <span className="min-w-0 flex-1">{phase.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {checklist.length > 0 && (
              <section className="rounded-lg border border-anac-border bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-anac-muted">
                    {checklistTitle}
                  </p>
                  <span className="rounded bg-anac-success/10 px-2 py-0.5 text-[10px] font-semibold text-anac-success">
                    {completedCount}/{checklist.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {checklist.map((item, index) => {
                    const currentItem = !item.done && checklist.findIndex((entry) => !entry.done) === index;
                    return (
                      <div
                        key={`${item.label}-${index}`}
                        className={cn(
                          'flex items-start gap-2 rounded px-2 py-1.5',
                          currentItem && 'bg-anac-blue/5 text-anac-blue'
                        )}
                      >
                        {item.done ? (
                          <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0 text-anac-success" />
                        ) : item.optional ? (
                          <CircleDashed size={14} className="mt-0.5 flex-shrink-0 text-anac-muted/60" />
                        ) : (
                          <Circle size={14} className="mt-0.5 flex-shrink-0 text-anac-muted/50" />
                        )}
                        <span
                          className={cn(
                            'text-xs leading-snug',
                            item.done
                              ? 'text-anac-navy'
                              : item.optional
                                ? 'text-anac-muted'
                                : currentItem
                                  ? 'font-medium text-anac-blue'
                                  : 'text-anac-navy'
                          )}
                        >
                          {item.label}
                          {item.optional && (
                            <span className="ml-1 text-[9px] uppercase tracking-wide text-anac-muted/60">
                              facultatif
                            </span>
                          )}
                        </span>
                        {currentItem && <ChevronRight size={14} className="ml-auto mt-0.5 text-anac-blue" />}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </aside>

          <section className="min-w-0 space-y-4">{children}</section>

          <aside className="space-y-4 xl:sticky xl:top-4">
            <section className={cn('rounded-lg border p-4 shadow-sm', actionToneStyles[action.tone].ring)}>
              <div className="mb-4 flex items-center gap-2">
                <ActionIcon size={16} className={actionToneStyles[action.tone].iconClass} />
                <h2 className="text-sm font-semibold text-anac-navy">Prochaine action requise</h2>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={14} className={actionToneStyles[action.tone].iconClass} />
                  <div>
                    <p className="text-sm font-medium text-anac-navy">{action.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-anac-muted">{action.description}</p>
                    {action.blockReason && (
                      <p className="mt-2 text-xs font-medium text-anac-warning">{action.blockReason}</p>
                    )}
                  </div>
                </div>
                <span className={cn('inline-flex rounded px-2 py-0.5 text-[10px] font-semibold', actionToneStyles[action.tone].badge)}>
                  Responsable: {action.owner}
                </span>
                {action.primaryAction && (
                  <button
                    type="button"
                    onClick={action.primaryAction.onClick}
                    disabled={action.primaryAction.disabled}
                    className="mt-2 h-9 w-full rounded border border-anac-border bg-white text-xs font-semibold text-anac-navy transition-colors hover:bg-anac-gray disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky"
                  >
                    {action.primaryAction.label}
                  </button>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-anac-border bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <ShieldCheck size={16} className="text-anac-navy" />
                <h2 className="text-sm font-semibold text-anac-navy">Informations cles</h2>
              </div>
              <dl className="space-y-3">
                {keyInfo.map((info) => (
                  <div key={info.label}>
                    <dt className="text-[11px] text-anac-muted">{info.label}</dt>
                    <dd className={cn('mt-0.5 text-sm font-semibold', infoToneClass(info.tone))}>
                      {info.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="rounded-lg border border-anac-border bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <FileArchive size={16} className="text-anac-navy" />
                <h2 className="text-sm font-semibold text-anac-navy">Acces rapide</h2>
              </div>
              <div className="space-y-1">
                {(quickLinks ?? defaultQuickLinks).map((link) => (
                  <button
                    key={link.label}
                    type="button"
                    onClick={link.onClick}
                    disabled={link.disabled}
                    className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs text-anac-muted transition-colors hover:bg-anac-gray hover:text-anac-navy disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky"
                  >
                    {link.icon ?? <Circle size={12} />}
                    <span className="flex-1">{link.label}</span>
                    <ChevronRight size={12} />
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

const defaultQuickLinks: WorkflowQuickLink[] = [
  { label: 'Historique du dossier', icon: <History size={14} /> },
  { label: 'Courriers officiels', icon: <Mail size={14} /> },
  { label: 'Documents lies', icon: <FileArchive size={14} /> },
  { label: "Journal d'audit", icon: <ShieldCheck size={14} /> },
];

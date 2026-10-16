import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClosedDossierBadge } from '../../components/common/ClosedDossierBadge';
import { AgingBadge } from '../../components/cockpit/AgingBadge';
import { CockpitPage } from '../../components/cockpit/CockpitPage';
import { QueueColumn } from '../../components/cockpit/QueueColumn';
import { useAuth } from '../../hooks/useAuth';
import { fetchMyQueue } from '../../lib/api/site-inspection.api';
import type { InspectionQueueItem } from '../../lib/api/site-inspection.types';
import { apiErrorMessage } from '../../lib/axios';
import { queryKeys } from '../../lib/react-query/queryKeys';
import { formatRowDate } from '../../lib/dayGroups';
import { defaultOrderFor, filterQueue, groupQueue, sortQueue, type AgeOrder } from '../../lib/cockpit/queue';
import { useQueueTab } from '../../lib/cockpit/useQueueTab';
import { useUrlSelection } from '../../lib/cockpit/useUrlSelection';
import { cn } from '../../lib/utils';
import { InspectionPane } from './InspectionPane';
import { INSPECTION_TABS, INSPECTION_TAB_MODES, inspectionCallout, inspectionMetrics, type InspectionTab } from './inspectionCopy';

const EMPTY_COUNTS = { to_hold: 0, verdict_due: 0, awaiting_payment: 0, closed: 0, inactive: 0 };

/** SESSION1-COCKPIT-1 - Cellule Inspection cockpit (home of r3_agent): the
 *  M6 missions on the shared shell, with the 7-day strip above. The CTA needs
 *  both the owner role and the assignment (an SU sees the others' missions
 *  without acting on them). Entrée only focuses the action. */
export default function MyInspectionsPage() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const query = useQuery({ queryKey: queryKeys.siteInspection.myQueue(), queryFn: fetchMyQueue });
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const counts = query.data?.counts ?? EMPTY_COUNTS;

  const [tab, setTab] = useQueueTab<InspectionTab>(INSPECTION_TABS.map((t) => t.key), 'to_hold');
  const mode = INSPECTION_TAB_MODES[tab];
  const [order, setOrder] = useState<AgeOrder | null>(null);
  const effectiveOrder = order ?? defaultOrderFor(mode);
  const [search, setSearch] = useState('');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const actionButtonRef = useRef<HTMLButtonElement>(null);

  const days = useMemo(() => buildSevenDayStrip(), []);
  const visible = useMemo(
    () =>
      sortQueue(
        filterQueue(items, tab, search, (item) => [item.requestReference, item.organisationName, item.siteVisit.location ?? ''].join(' ')).filter(
          (item) => !selectedDay || dayKey(item.siteVisit.scheduledAt) === selectedDay
        ),
        mode,
        effectiveOrder
      ),
    [items, tab, search, selectedDay, mode, effectiveOrder]
  );
  const groups = useMemo(() => groupQueue(visible, mode), [visible, mode]);
  const { selected, select } = useUrlSelection(visible, !query.isLoading);

  return (
    <CockpitPage
      title={roles.includes('SU') ? 'Inspections — Cellule Inspection' : 'Mes inspections'}
      metrics={inspectionMetrics(items, counts)}
      search={{ value: search, onChange: setSearch, placeholder: 'Dossier, opérateur, lieu...', label: 'Rechercher une inspection' }}
      errors={[query.error ? apiErrorMessage(query.error, 'Impossible de charger les inspections.') : null, actionError]}
      above={
        <CalendarStrip
          days={days}
          items={items}
          selectedDay={selectedDay}
          onSelect={(day) => setSelectedDay((current) => (current === day ? null : day))}
        />
      }
      list={
        <QueueColumn
          tabs={INSPECTION_TABS.map((t) => ({ key: t.key, label: t.label, count: t.key === 'all' ? items.length : counts[t.key] }))}
          tab={tab}
          onTabChange={(next) => {
            setTab(next);
            setOrder(null);
            setActionError(null);
          }}
          order={effectiveOrder}
          onOrderChange={setOrder}
          groups={groups}
          selectedId={selected?.id ?? null}
          status={query.isLoading ? 'loading' : query.error ? 'error' : 'ready'}
          texts={{ loading: 'Chargement des inspections', error: 'Impossible de charger les inspections.', empty: 'Aucune inspection dans cette vue', listLabel: 'Inspections', noun: ['inspection', 'inspections'] }}
          onSelect={(item) => {
            setActionError(null);
            select(item);
          }}
          onActivate={() => {
            const button = actionButtonRef.current;
            if (button && !button.disabled) button.focus();
          }}
          renderRow={(item) => <InspectionRow item={item} />}
        />
      }
      pane={<InspectionPane key={selected?.id ?? 'none'} item={selected} roles={roles} setActionError={setActionError} actionButtonRef={actionButtonRef} />}
    />
  );
}

/** One list row: organisation and visit date, reference and place, badges,
 *  then the callout title. */
function InspectionRow({ item }: { item: InspectionQueueItem }) {
  return (
    <>
      <span className="truncate text-sm font-medium text-anac-text">{item.organisationName}</span>
      <span className="whitespace-nowrap text-right text-[11px] text-anac-muted">{formatRowDate(item.siteVisit.scheduledAt)}</span>
      <span className="truncate text-xs text-anac-text/80">
        {item.requestReference}
        {item.siteVisit.location ? ` · ${item.siteVisit.location}` : ''}
      </span>
      <span className="flex justify-end gap-1.5">
        {item.dossierClosed ? <ClosedDossierBadge status={item.dossierStatus} /> : null}
        {item.bucket === 'to_hold' ? <AgingBadge urgency={item.urgency} since={item.stepSince} dueAt={item.dueAt} /> : null}
      </span>
      <span className="col-span-2 truncate text-xs">
        <span className={cn('font-semibold', item.state === 'action_required' ? 'text-anac-blue' : item.state === 'waiting' || item.state === 'blocked' ? 'text-anac-warning' : 'text-anac-muted')}>
          {inspectionCallout(item).title}
        </span>
      </span>
    </>
  );
}

function CalendarStrip({
  days,
  items,
  selectedDay,
  onSelect,
}: {
  days: { key: string; weekday: string; day: string; month: string }[];
  items: InspectionQueueItem[];
  selectedDay: string | null;
  onSelect: (day: string) => void;
}) {
  return (
    <section className="rounded-lg border border-anac-border bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-anac-navy">Prochaines inspections</h2>
          <p className="text-xs text-anac-muted">Volume de missions assignées sur les 7 prochains jours.</p>
        </div>
        {selectedDay ? (
          <button className="text-xs font-semibold text-anac-blue" onClick={() => onSelect(selectedDay)}>
            Voir toute la semaine
          </button>
        ) : null}
      </div>
      <div
        className="grid gap-2 overflow-x-auto pb-1"
        style={{ gridTemplateColumns: 'repeat(7, minmax(118px, 1fr))' }}
      >
        {days.map((day) => {
          const count = items.filter((item) => dayKey(item.siteVisit.scheduledAt) === day.key).length;
          const active = selectedDay === day.key;
          return (
            <button
              key={day.key}
              onClick={() => onSelect(day.key)}
              className={cn(
                'rounded-lg border px-3 py-3 text-center transition',
                active
                  ? 'border-anac-blue bg-anac-blue/10 text-anac-blue'
                  : 'border-anac-border bg-white text-anac-muted hover:border-anac-blue/40'
              )}
            >
              <span className="block text-[11px] font-semibold uppercase">{day.weekday}</span>
              <span className="block text-[10px] uppercase">{day.month}</span>
              <span className="mt-2 block text-base font-semibold text-anac-navy">{count}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function buildSevenDayStrip() {
  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return {
      key: dayKey(date.toISOString()) ?? '',
      weekday: date.toLocaleDateString('fr-FR', { weekday: 'short' }),
      day: date.toLocaleDateString('fr-FR', { day: '2-digit' }),
      month: date.toLocaleDateString('fr-FR', { month: 'short' }),
    };
  });
}

function dayKey(value: string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

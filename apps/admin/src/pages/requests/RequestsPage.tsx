import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownAZ, Search } from 'lucide-react';
import { BucketTabs } from '../../components/common/BucketTabs';
import { StatusBadge } from '../../components/common/StatusBadge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { fetchRequestCockpit, markRequestViewed } from '../../lib/api/requests.api';
import type { RequestCockpitItem } from '../../lib/api/requests.types';
import { queryKeys } from '../../lib/react-query/queryKeys';
import { RequestReadingPane } from './RequestReadingPane';
import { RequestsList } from './RequestsList';
import {
  REQUEST_BUCKETS,
  REQUEST_SORT_OPTIONS,
  countBuckets,
  filterRequests,
  groupRequestsByDay,
  nextActionKind,
  type RequestBucket,
  type RequestSortKey,
} from './requestBuckets';

/**
 * D1 - Demandes cockpit, two panes (Outlook-inspired): tabs and a list
 * grouped by submission day on the left, the reading pane on the right.
 * Bucket rules live in requestBuckets.ts. The selected dossier is kept in
 * `?id=` so the view survives a reload or a shared link.
 */
/** D3c - time a dossier stays selected before it is marked read. */
export const VIEW_DELAY_MS = 1000;

export default function RequestsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [bucket, setBucket] = useState<RequestBucket>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<RequestSortKey>('activity');
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const startButtonRef = useRef<HTMLButtonElement>(null);

  const query = useQuery({
    queryKey: queryKeys.requests.cockpit(),
    queryFn: fetchRequestCockpit,
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data?.items]);
  const counts = useMemo(() => countBuckets(items), [items]);
  const filtered = useMemo(
    () => filterRequests(items, { bucket, search, sort }),
    [items, bucket, search, sort]
  );
  const groups = useMemo(() => groupRequestsByDay(filtered, sort), [filtered, sort]);

  const requestedId = Number(searchParams.get('id'));
  // Never show a dossier that is not in the current list: fall back to the
  // first visible row, or to the empty state.
  const selected = filtered.find((item) => item.id === requestedId) ?? filtered[0] ?? null;

  // D3c - a dossier counts as read once it stays in the reading pane for
  // VIEW_DELAY_MS: moving through the list with ↑/↓ does not mark every row.
  // The list is refreshed only when the read state actually changes.
  const selectedId = selected?.id ?? null;
  const selectedUnread = selected?.unread ?? false;
  useEffect(() => {
    if (selectedId === null) return;
    const timer = window.setTimeout(() => {
      markRequestViewed(selectedId)
        .then(() => {
          if (selectedUnread) {
            return queryClient.invalidateQueries({ queryKey: queryKeys.requests.cockpit() });
          }
        })
        .catch(() => undefined); // non-blocking: the dossier just stays « non lu »
    }, VIEW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [selectedId, selectedUnread, queryClient]);

  function select(item: RequestCockpitItem) {
    setActionError(null);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('id', String(item.id));
        return next;
      },
      { replace: true }
    );
  }

  /** Entrée on a row. Opening the preliminary phase changes the dossier
   *  state, so Entrée only focuses that button: a second Entrée confirms. */
  function activate(item: RequestCockpitItem) {
    const kind = nextActionKind(item);
    if (kind === 'start') startButtonRef.current?.focus();
    else if ((kind === 'treat' || kind === 'consult') && item.nextActionHref)
      navigate(item.nextActionHref);
  }

  function handlePageKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
      return;
    event.preventDefault();
    searchRef.current?.focus();
  }

  return (
    <div className="-m-6 min-h-full bg-[#f8fafc] text-anac-text" onKeyDown={handlePageKeyDown}>
      <main className="mx-auto max-w-[1600px] space-y-4 px-5 py-4">
        <header className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="mr-auto">
            <p className="text-xs font-medium text-anac-muted">Direction de la Navigabilité</p>
            <h1 className="mt-1 text-xl font-semibold leading-tight text-anac-navy">Demandes</h1>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Synthèse">
            <StatusBadge
              label={`${counts.todo} à traiter`}
              tone="border-blue-100 bg-blue-50 text-anac-blue"
            />
            <StatusBadge
              label={`${counts.waiting_dg} en attente DG`}
              tone="border-orange-100 bg-orange-50 text-anac-warning"
            />
            <StatusBadge
              label={`${counts.todo + counts.waiting_dg} dossier(s) ouvert(s)`}
              tone="border-slate-200 bg-slate-50 text-anac-text/80"
            />
          </div>
          <label className="relative block w-full sm:w-[340px]">
            <span className="sr-only">Rechercher une demande</span>
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-anac-muted"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 w-full rounded-lg border border-anac-border bg-white pl-9 pr-3 text-sm outline-none transition focus:border-anac-blue focus:ring-2 focus:ring-anac-blue/15"
              placeholder="Référence, organisation, demandeur..."
            />
          </label>
        </header>

        {actionError ? (
          <div
            role="alert"
            className="rounded-lg border border-anac-danger/20 bg-red-50 px-4 py-3 text-sm text-anac-danger"
          >
            {actionError}
          </div>
        ) : null}

        <section className="grid items-start gap-4 lg:grid-cols-[minmax(340px,400px)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-anac-border bg-white shadow-[0_8px_22px_rgba(17,34,83,0.04)] lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)]">
            <BucketTabs
              size="compact"
              value={bucket}
              items={REQUEST_BUCKETS.map((b) => ({
                key: b.key,
                label: b.label,
                count: counts[b.key],
              }))}
              onChange={setBucket}
            />
            <div className="flex items-center justify-between gap-3 border-b border-anac-border px-4 py-2">
              <Select value={sort} onValueChange={(value) => setSort(value as RequestSortKey)}>
                <SelectTrigger
                  aria-label="Trier les demandes"
                  className="h-8 w-[220px] gap-2 text-xs font-semibold text-anac-navy"
                >
                  <ArrowDownAZ size={14} className="shrink-0 text-anac-muted" aria-hidden="true" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REQUEST_SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sort !== 'reference' ? (
                <span className="text-[11px] text-anac-muted">Regroupé par jour</span>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <RequestsList
                groups={groups}
                sort={sort}
                selectedId={selected?.id ?? null}
                loading={query.isLoading}
                error={!!query.error}
                onSelect={select}
                onActivate={activate}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-anac-border bg-anac-gray/50 px-4 py-2 text-[11px] text-anac-muted">
              <span>
                <span className="font-semibold text-anac-navy">{filtered.length}</span> demande
                {filtered.length > 1 ? 's' : ''}
              </span>
              <span className="ml-auto hidden md:inline">
                <Kbd>↑</Kbd> <Kbd>↓</Kbd> naviguer · <Kbd>Entrée</Kbd> traiter · <Kbd>/</Kbd>{' '}
                rechercher
              </span>
            </div>
          </div>

          <RequestReadingPane
            item={selected}
            startButtonRef={startButtonRef}
            onActionError={setActionError}
          />
        </section>
      </main>
    </div>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-b-2 border-anac-border bg-white px-1 font-mono text-[10px] text-anac-text/80">
      {children}
    </kbd>
  );
}

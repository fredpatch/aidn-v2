import type { ReactNode } from 'react';
import { ArrowDownAZ } from 'lucide-react';
import { BucketTabs } from '../common/BucketTabs';
import { EmptyState } from '../common/EmptyState';
import { MessageList } from '../common/MessageList';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { DayGroup } from '../../lib/dayGroups';
import type { AgeOrder } from '../../lib/cockpit/queue';

export interface QueueTab<K extends string> {
  key: K;
  label: string;
  count: number;
}

/** List column of a role cockpit: tabs, order, list (MessageList keyboard),
 *  three distinct loading / error / empty states, footer. */
export function QueueColumn<T extends { id: string }, K extends string>({
  tabs, tab, onTabChange, order, onOrderChange, groups, selectedId, status, texts, onSelect, onActivate, renderRow,
}: {
  tabs: QueueTab<K>[];
  tab: K;
  onTabChange: (tab: K) => void;
  order: AgeOrder;
  onOrderChange: (order: AgeOrder) => void;
  groups: DayGroup<T>[];
  selectedId: string | null;
  status: 'loading' | 'error' | 'ready';
  texts: { loading: string; error: string; empty: string; listLabel: string; noun: [string, string] };
  onSelect: (item: T) => void;
  onActivate: (item: T) => void;
  renderRow: (item: T) => ReactNode;
}) {
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-anac-border bg-white shadow-[0_8px_22px_rgba(17,34,83,0.04)] lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)]">
      <BucketTabs size="compact" value={tab} items={tabs} onChange={onTabChange} />
      <div className="flex items-center justify-between gap-3 border-b border-anac-border px-4 py-2">
        <Select value={order} onValueChange={(value) => onOrderChange(value as AgeOrder)}>
          <SelectTrigger aria-label="Trier" className="h-8 w-[200px] gap-2 text-xs font-semibold text-anac-navy">
            <ArrowDownAZ size={14} className="shrink-0 text-anac-muted" aria-hidden="true" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="oldest">Plus ancien d&apos;abord</SelectItem>
            <SelectItem value="newest">Plus récent d&apos;abord</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {status === 'loading' ? (
          <EmptyState title={texts.loading} />
        ) : status === 'error' ? (
          <EmptyState title={texts.error} danger />
        ) : total === 0 ? (
          <EmptyState title={texts.empty} description="Modifiez la recherche ou l'onglet." />
        ) : (
          <MessageList
            groups={groups}
            getId={(item) => item.id}
            selectedId={selectedId}
            ariaLabel={texts.listLabel}
            onSelect={onSelect}
            onActivate={onActivate}
            renderRow={renderRow}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-anac-border bg-anac-gray/50 px-4 py-2 text-[11px] text-anac-muted">
        <span>
          <span className="font-semibold text-anac-navy">{total}</span> {total > 1 ? texts.noun[1] : texts.noun[0]}
        </span>
        <span className="ml-auto hidden md:inline">↑ ↓ naviguer · Entrée action · / rechercher</span>
      </div>
    </div>
  );
}

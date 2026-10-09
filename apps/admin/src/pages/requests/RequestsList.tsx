import { ClosedDossierBadge } from '../../components/common/ClosedDossierBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { MessageList } from '../../components/common/MessageList';
import type { RequestCockpitItem } from '../../lib/api/requests.types';
import { cn } from '../../lib/utils';
import { Flag } from 'lucide-react';
import {
  formatRowDate,
  isClosedRequest,
  isUnreadRequest,
  requestFlags,
  rowDateOf,
  type RequestDayGroup,
  type RequestSortKey,
} from './requestBuckets';

const NEXT_ACTION_TEXT: Record<RequestCockpitItem['nextActionTone'], string> = {
  info: 'text-anac-blue',
  warning: 'text-anac-warning',
  success: 'text-anac-success',
  danger: 'text-anac-danger',
};

/**
 * D1 - Demandes column: rows grouped by submission day. Selection, roving
 * focus and keyboard live in the shared MessageList (C2a); this file keeps
 * the Demandes states and the row content.
 */
export function RequestsList({
  groups,
  sort,
  selectedId,
  loading,
  error,
  onSelect,
  onActivate,
}: {
  groups: RequestDayGroup[];
  /** D3c - the row date follows the sort (last activity or submission). */
  sort: RequestSortKey;
  selectedId: number | null;
  loading: boolean;
  error: boolean;
  onSelect: (item: RequestCockpitItem) => void;
  onActivate: (item: RequestCockpitItem) => void;
}) {
  const empty = groups.every((group) => group.items.length === 0);

  if (loading) {
    return (
      <EmptyState title="Chargement des demandes" description="Récupération du cockpit dossiers." />
    );
  }
  if (error) {
    return (
      <EmptyState
        title="Chargement impossible"
        description="Impossible de charger les demandes."
        danger
      />
    );
  }
  if (empty) {
    return (
      <EmptyState
        title="Aucune demande dans cette vue"
        description="Modifiez la recherche ou l'onglet."
      />
    );
  }

  return (
    <MessageList
      groups={groups}
      getId={(item) => item.id}
      selectedId={selectedId}
      ariaLabel="Demandes"
      onSelect={onSelect}
      onActivate={onActivate}
      renderRow={(item) => {
        // D3c - unread: dot + bold (Outlook); flags from the cockpit data only.
        const unread = isUnreadRequest(item);
        const flags = requestFlags(item);
        return (
          <>
            {unread ? (
              <span
                aria-hidden="true"
                className="absolute left-1.5 top-4 h-1.5 w-1.5 rounded-full bg-anac-blue"
              />
            ) : null}
            <span
              className={cn(
                'truncate text-sm',
                unread ? 'font-bold text-anac-navy' : 'font-medium text-anac-text'
              )}
            >
              {item.organisationName}
              {unread ? <span className="sr-only"> (non lue)</span> : null}
            </span>
            <span
              className={cn(
                'whitespace-nowrap text-right text-[11px]',
                unread ? 'font-bold text-anac-blue' : 'text-anac-muted'
              )}
            >
              {formatRowDate(rowDateOf(item, sort))}
            </span>
            <span className="truncate text-xs text-anac-text/80">
              {item.reference} · {item.requestTypeLabel}
            </span>
            <span className="flex items-center justify-end gap-1.5">
              {flags.length > 0 ? (
                <span title={flags.join('\n')} className="inline-flex">
                  <Flag
                    size={12}
                    className="fill-amber-500 text-amber-700"
                    aria-label={flags.join(' ; ')}
                  />
                </span>
              ) : null}
              {isClosedRequest(item) ? <ClosedDossierBadge status={item.status} /> : null}
            </span>
            <span className="col-span-2 truncate text-xs">
              <span className="text-anac-muted">{item.currentPhaseLabel} — </span>
              <span className={cn('font-semibold', NEXT_ACTION_TEXT[item.nextActionTone])}>
                {item.nextActionLabel}
              </span>
            </span>
          </>
        );
      }}
    />
  );
}

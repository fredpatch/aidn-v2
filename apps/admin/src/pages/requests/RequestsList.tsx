import { ClosedDossierBadge } from '../../components/common/ClosedDossierBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { MessageList } from '../../components/common/MessageList';
import type { RequestCockpitItem } from '../../lib/api/requests.types';
import { cn } from '../../lib/utils';
import { formatRowDate, isClosedRequest, type RequestDayGroup } from './requestBuckets';

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
  selectedId,
  loading,
  error,
  onSelect,
  onActivate,
}: {
  groups: RequestDayGroup[];
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
      renderRow={(item) => (
        <>
          <span className="truncate text-sm font-medium text-anac-text">
            {item.organisationName}
          </span>
          <span className="whitespace-nowrap text-right text-[11px] text-anac-muted">
            {formatRowDate(item.createdAt)}
          </span>
          <span className="truncate text-xs text-anac-text/80">
            {item.reference} · {item.requestTypeLabel}
          </span>
          <span className="flex justify-end">
            {isClosedRequest(item) ? <ClosedDossierBadge status={item.status} /> : null}
          </span>
          <span className="col-span-2 truncate text-xs">
            <span className="text-anac-muted">{item.currentPhaseLabel} - </span>
            <span className={cn('font-semibold', NEXT_ACTION_TEXT[item.nextActionTone])}>
              {item.nextActionLabel}
            </span>
          </span>
        </>
      )}
    />
  );
}

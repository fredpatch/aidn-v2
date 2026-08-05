import { CheckCircle2, WalletCards } from 'lucide-react';
import {
  SelectableDataTable,
  type SelectableDataTableColumn,
} from '../../../components/common/SelectableDataTable';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { formatDate } from '../s5PaymentFormatters';
import { NEXT_ACTION_LABELS, PHASE_LABELS, STATUS_LABELS, statusClass, statusIcon } from '../s5PaymentLabels';
import type { S5PaymentQueueItem } from '../s5PaymentTypes';

const s5PaymentColumns: SelectableDataTableColumn<S5PaymentQueueItem>[] = [
  {
    id: 'dossier',
    header: 'Dossier',
    cell: (item) => (
      <>
        <span className="block text-left font-semibold text-anac-blue">
          {item.requestReference}
        </span>
        <p className="text-xs text-anac-muted">{item.requestType}</p>
      </>
    ),
  },
  {
    id: 'organisme',
    header: 'Organisme',
    className: 'max-w-[220px]',
    cell: (item) => (
      <p className="truncate font-medium text-anac-navy">{item.organisationName}</p>
    ),
  },
  {
    id: 'phase',
    header: 'Phase',
    className: 'text-xs text-anac-muted',
    cell: (item) => PHASE_LABELS[item.phaseCode],
  },
  {
    id: 'facture',
    header: 'Facture',
    className: 'text-xs text-anac-muted',
    cell: (item) => formatDate(item.payment.invoiceUploadedAt),
  },
  {
    id: 'preuve',
    header: 'Preuve',
    className: 'text-xs text-anac-muted',
    cell: (item) => formatDate(item.payment.proofUploadedAt),
  },
  {
    id: 'statut',
    header: 'Statut',
    cell: (item) => (
      <StatusBadge
        label={STATUS_LABELS[item.payment.status] ?? item.payment.status}
        tone={statusClass(item.payment.status)}
        icon={statusIcon(item.payment.status)}
        pill={false}
      />
    ),
  },
  {
    id: 'action',
    header: 'Action',
    className: 'text-xs font-medium text-anac-blue',
    cell: (item) => NEXT_ACTION_LABELS[item.nextAction],
  },
];

function getS5PaymentKey(item: S5PaymentQueueItem): string {
  return `${item.phaseCode}:${item.phaseId}`;
}

export function S5PaymentTable({
  items,
  selectedKey,
  loading,
  onSelect,
}: {
  items: S5PaymentQueueItem[];
  selectedKey: string | null;
  loading: boolean;
  onSelect: (key: string) => void;
}) {
  return (
    <SelectableDataTable
      rows={items}
      columns={s5PaymentColumns}
      getRowKey={getS5PaymentKey}
      selectedKey={selectedKey}
      onSelect={(_item, key) => onSelect(key)}
      getAriaLabel={(item) =>
        `Selectionner le paiement ${item.requestReference} de ${item.organisationName}`
      }
      loading={loading}
      loadingState={{
        icon: WalletCards,
        title: 'Chargement des paiements',
      }}
      emptyState={{
        icon: CheckCircle2,
        title: 'Aucun paiement dans cette vue',
        description: "Les paiements reapparaitront ici des qu'une action S5 sera attendue.",
      }}
      className="min-w-[860px]"
    />
  );
}

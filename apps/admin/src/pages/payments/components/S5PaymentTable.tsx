import { CheckCircle2, WalletCards } from 'lucide-react';
import { SelectableTableRow } from '../../../components/common/SelectableTableRow';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { TableState } from '../../../components/common/TableState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { formatDate } from '../s5PaymentFormatters';
import { NEXT_ACTION_LABELS, PHASE_LABELS, STATUS_LABELS, statusClass, statusIcon } from '../s5PaymentLabels';
import type { S5PaymentQueueItem } from '../s5PaymentTypes';

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
  if (loading) {
    return <TableState state="loading" icon={WalletCards} title="Chargement des paiements" />;
  }
  if (items.length === 0) {
    return (
      <TableState
        state="empty"
        icon={CheckCircle2}
        title="Aucun paiement dans cette vue"
        description="Les paiements reapparaitront ici des qu'une action S5 sera attendue."
      />
    );
  }

  return (
    <Table className="min-w-[860px]">
      <TableHeader>
        <TableRow>
          <TableHead>Dossier</TableHead>
          <TableHead>Organisme</TableHead>
          <TableHead>Phase</TableHead>
          <TableHead>Facture</TableHead>
          <TableHead>Preuve</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead>Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const key = `${item.phaseCode}:${item.phaseId}`;
          const selected = key === selectedKey;
          return (
            <SelectableTableRow
              key={key}
              selected={selected}
              onSelect={() => onSelect(key)}
              ariaLabel={`Selectionner le paiement ${item.requestReference} de ${item.organisationName}`}
            >
              <TableCell>
                <span className="block text-left font-semibold text-anac-blue">
                  {item.requestReference}
                </span>
                <p className="text-xs text-anac-muted">{item.requestType}</p>
              </TableCell>
              <TableCell className="max-w-[220px]">
                <p className="truncate font-medium text-anac-navy">{item.organisationName}</p>
              </TableCell>
              <TableCell className="text-xs text-anac-muted">{PHASE_LABELS[item.phaseCode]}</TableCell>
              <TableCell className="text-xs text-anac-muted">{formatDate(item.payment.invoiceUploadedAt)}</TableCell>
              <TableCell className="text-xs text-anac-muted">{formatDate(item.payment.proofUploadedAt)}</TableCell>
              <TableCell>
                <StatusBadge label={STATUS_LABELS[item.payment.status] ?? item.payment.status} tone={statusClass(item.payment.status)} icon={statusIcon(item.payment.status)} pill={false} />
              </TableCell>
              <TableCell className="text-xs font-medium text-anac-blue">
                {NEXT_ACTION_LABELS[item.nextAction]}
              </TableCell>
            </SelectableTableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

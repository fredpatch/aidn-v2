import type { ElementType, ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { SelectableTableRow } from './SelectableTableRow';
import { TableState } from './TableState';

export type SelectableDataTableColumn<T> = {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
};

type SelectableDataTableState = {
  title: string;
  description?: string;
  icon?: ElementType;
  className?: string;
};

export type SelectableDataTableProps<T, K extends string | number> = {
  rows: T[];
  columns: SelectableDataTableColumn<T>[];
  getRowKey: (row: T) => K;
  selectedKey: K | null;
  onSelect: (row: T, key: K) => void;
  getAriaLabel: (row: T) => string;
  loading?: boolean;
  loadingState?: SelectableDataTableState;
  emptyState?: SelectableDataTableState;
  error?: boolean;
  errorState?: SelectableDataTableState;
  className?: string;
  headerClassName?: string;
  rowClassName?: (row: T) => string | undefined;
};

export function SelectableDataTable<T, K extends string | number>({
  rows,
  columns,
  getRowKey,
  selectedKey,
  onSelect,
  getAriaLabel,
  loading = false,
  loadingState,
  emptyState,
  error = false,
  errorState,
  className,
  headerClassName,
  rowClassName,
}: SelectableDataTableProps<T, K>) {
  if (loading) {
    return loadingState ? <TableState state="loading" {...loadingState} /> : null;
  }

  if (error) {
    return errorState ? <TableState state="error" {...errorState} /> : null;
  }

  if (rows.length === 0) {
    return emptyState ? <TableState state="empty" {...emptyState} /> : null;
  }

  return (
    <Table className={className}>
      <TableHeader className={headerClassName}>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column.id} className={column.headerClassName}>
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const key = getRowKey(row);
          return (
            <SelectableTableRow
              key={key}
              selected={key === selectedKey}
              onSelect={() => onSelect(row, key)}
              ariaLabel={getAriaLabel(row)}
              className={rowClassName?.(row)}
            >
              {columns.map((column) => (
                <TableCell key={column.id} className={column.className}>
                  {column.cell(row)}
                </TableCell>
              ))}
            </SelectableTableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

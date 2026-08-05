import type { ElementType, ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { TableState } from './TableState';

export type ReadOnlyTableColumn<T> = {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
};

type ReadOnlyTableState = {
  title: string;
  description?: string;
  icon?: ElementType;
  className?: string;
};

export type ReadOnlyTableProps<T> = {
  rows: T[];
  columns: ReadOnlyTableColumn<T>[];
  getRowKey: (row: T) => string | number;
  loading?: boolean;
  loadingState?: ReadOnlyTableState;
  emptyState?: ReadOnlyTableState;
  className?: string;
};

export function ReadOnlyTable<T>({
  rows,
  columns,
  getRowKey,
  loading = false,
  loadingState,
  emptyState,
  className,
}: ReadOnlyTableProps<T>) {
  if (loading) {
    return loadingState ? <TableState state="loading" {...loadingState} /> : null;
  }

  if (rows.length === 0) {
    return emptyState ? <TableState state="empty" {...emptyState} /> : null;
  }

  return (
    <Table className={className}>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column.id} className={column.headerClassName}>
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={getRowKey(row)}>
            {columns.map((column) => (
              <TableCell key={column.id} className={column.className}>
                {column.cell(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

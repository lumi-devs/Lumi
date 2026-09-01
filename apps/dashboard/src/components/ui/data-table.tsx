"use client";

import {
  type ColumnDef,
  columnFilteringFeature,
  columnVisibilityFeature,
  createCoreRowModel,
  createFilteredRowModel,
  createSortedRowModel,
  flexRender,
  type RowData,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { Table, TableScroll, TBody, TD, TH, THead, TR } from "#/components/ui/table";
import { useStaggerIn } from "#/lib/animate";

export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  rowSortingFeature,
  coreRowModel: createCoreRowModel(),
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- phantom type-only slot per tableFeatures() contract
  columnMeta: {} as { className?: string },
});

// Thin wrapper around the project's existing `Table` primitives — this repo
// already ported the shadcn table markup with terser names (`TH`/`TD`/`TR`
// instead of `TableHead`/`TableCell`/`TableRow`), so `DataTable` renders
// through those rather than re-adding shadcn's originals. Pagination stays
// with whoever owns the data (URL search params, server actions); this
// component only ever renders one page's worth of rows.
export function DataTable<TData extends RowData, TValue>({
  columns,
  data,
  getRowId,
  className,
}: {
  columns: ColumnDef<typeof dataTableFeatures, TData, TValue>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  className?: string;
}) {
  const table = useTable({
    features: dataTableFeatures,
    data,
    columns: columns as ColumnDef<typeof dataTableFeatures, TData>[],
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
  });

  const rows = table.getRowModel().rows;
  const bodyRef = useStaggerIn<HTMLTableSectionElement>("tr", {
    resetKey: rows.map((r) => r.id).join(","),
  });

  return (
    <TableScroll className={className}>
      <Table>
        <THead>
          {table.getHeaderGroups().map((headerGroup) => (
            <TR key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TH
                  key={header.id}
                  className={header.column.columnDef.meta?.className}
                  colSpan={header.colSpan}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TH>
              ))}
            </TR>
          ))}
        </THead>
        <TBody ref={bodyRef}>
          {rows.map((row) => (
            <TR key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TD key={cell.id} className={cell.column.columnDef.meta?.className}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TD>
              ))}
            </TR>
          ))}
        </TBody>
      </Table>
    </TableScroll>
  );
}

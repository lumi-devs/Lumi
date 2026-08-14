"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Table, TableScroll, TBody, TD, TH, THead, TR } from "#/components/ui/table";
import { useStaggerIn } from "#/lib/animate";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    className?: string;
  }
}

// Thin wrapper around the project's existing `Table` primitives — this repo
// already ported the shadcn table markup with terser names (`TH`/`TD`/`TR`
// instead of `TableHead`/`TableCell`/`TableRow`), so `DataTable` renders
// through those rather than re-adding shadcn's originals. Pagination stays
// with whoever owns the data (URL search params, server actions); this
// component only ever renders one page's worth of rows.
export function DataTable<TData, TValue>({
  columns,
  data,
  getRowId,
  className,
}: {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  className?: string;
}) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
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

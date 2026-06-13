import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  /** Tailwind width class, e.g. "w-20". */
  width?: string;
  render: (row: T, index: number) => ReactNode;
}

/**
 * Reusable dense ranked table. Generic over row type. Optional `renderNote`
 * renders a full-width sub-row beneath a row (used for divergence flags), so
 * notes never crowd the data columns.
 */
export function RankedTable<T>({
  columns,
  rows,
  getRowKey,
  renderNote,
  emptyMessage = "No rows.",
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string;
  renderNote?: (row: T) => ReactNode;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <p className="py-3 text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`border-b border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-500 ${
                  c.align === "right" ? "text-right" : "text-left"
                } ${c.width ?? ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const note = renderNote?.(row);
            const hasNote = note !== undefined && note !== null && note !== false;
            return (
              <Fragmentish key={getRowKey(row, i)}>
                <tr className="align-top">
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-2 pt-2 ${hasNote ? "pb-0.5" : "pb-2 border-b border-slate-100"} text-slate-900 ${
                        c.align === "right" ? "text-right tabular-nums" : "text-left"
                      }`}
                    >
                      {c.render(row, i)}
                    </td>
                  ))}
                </tr>
                {hasNote ? (
                  <tr className="border-b border-slate-100">
                    <td colSpan={columns.length} className="px-2 pb-2 pt-0">
                      {note}
                    </td>
                  </tr>
                ) : null}
              </Fragmentish>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Renders children without an extra DOM node (table-row siblings). */
function Fragmentish({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

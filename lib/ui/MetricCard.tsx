import type { ReactNode } from "react";

/** Compact stat card for summary numbers. Reusable across analyses. */
export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-md bg-slate-50 px-4 py-3">
      <div className="text-2xl font-medium tabular-nums text-slate-900">
        {value}
      </div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div> : null}
    </div>
  );
}

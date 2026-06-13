import type { ReactNode } from "react";

export type FlagVariant = "info" | "warn" | "neutral";

const styles: Record<FlagVariant, string> = {
  info: "bg-blue-50 text-blue-800",
  warn: "bg-amber-50 text-amber-800",
  neutral: "bg-slate-100 text-slate-700",
};

/** Small inline badge, e.g. "in both", divergence markers. */
export function FlagBadge({
  variant = "neutral",
  children,
}: {
  variant?: FlagVariant;
  children: ReactNode;
}) {
  return (
    <span
      className={`ml-1.5 inline-block rounded px-1.5 py-0.5 align-middle text-[10px] font-medium ${styles[variant]}`}
    >
      {children}
    </span>
  );
}

/** A structured divergence note: short label + explanation, shown under a row. */
export interface Divergence {
  variant: FlagVariant;
  text: string;
}

export function DivergenceNote({ items }: { items: Divergence[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {items.map((d, i) => (
        <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug">
          <span
            className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
              d.variant === "warn"
                ? "bg-amber-400"
                : d.variant === "info"
                ? "bg-blue-400"
                : "bg-slate-300"
            }`}
            aria-hidden
          />
          <span className="text-slate-500">{d.text}</span>
        </li>
      ))}
    </ul>
  );
}

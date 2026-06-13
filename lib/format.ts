/** Shared formatting helpers for numeric financial displays. */

export function fmtNum(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toFixed(decimals);
}

/** Compact market-cap with a currency prefix, e.g. "HK$1.77T", "HK$60.0B". */
export function fmtMarketCap(
  v: number | null | undefined,
  currency = "HK$"
): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (v >= 1e12) return `${currency}${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${currency}${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${currency}${(v / 1e6).toFixed(0)}M`;
  return `${currency}${v.toFixed(0)}`;
}

/**
 * Whole months between an ISO date and now (floored, never negative).
 * Used to flag how stale a manually-maintained seed figure is.
 */
export function monthsSince(iso: string, now: Date = new Date()): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  const months =
    (now.getFullYear() - d.getFullYear()) * 12 +
    (now.getMonth() - d.getMonth()) -
    (now.getDate() < d.getDate() ? 1 : 0);
  return Math.max(0, months);
}

/** Format an ISO timestamp as a readable UTC string. */
export function fmtAsOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }) + " UTC";
}

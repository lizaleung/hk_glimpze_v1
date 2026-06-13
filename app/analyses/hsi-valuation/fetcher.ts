import type { AnalysisFetcher, AnalysisResult } from "@/lib/analysis-types";
import type { Divergence } from "@/lib/ui/DivergenceFlag";

/* ------------------------------------------------------------------ */
/* Swappable data source                                               */
/* ------------------------------------------------------------------ */

/** Raw per-constituent metrics — whatever the data source can provide. */
export interface RawConstituent {
  ticker: string;
  name: string;
  trailingPE: number | null;
  forwardPE: number | null;
  peg: number | null;
  marketCap: number | null;
}

export interface RawPayload {
  source: string;
  asOf: string;
  rows: RawConstituent[];
}

/**
 * The seam. Any source (Python yfinance now; FMP, a cached snapshot, or a
 * flat JSON file later) implements this. Swapping sources never touches the
 * ranking logic or the view.
 */
export interface HsiDataSource {
  readonly name: string;
  fetchRaw(): Promise<RawPayload>;
}

function pythonApiBase(): string {
  // Explicit override wins everywhere.
  if (process.env.PYTHON_API_BASE_URL) return process.env.PYTHON_API_BASE_URL;
  // On Vercel the Python function shares the deployment domain.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  // Local dev: scripts/dev_api.py serves the function on :8000.
  if (process.env.NODE_ENV === "development") return "http://localhost:8000";
  // Production without VERCEL_URL or an override: there is no sensible default —
  // fail loud rather than silently fetch from localhost (which would just hang
  // or 404). Set PYTHON_API_BASE_URL to point at the data function.
  throw new Error(
    "Cannot resolve the Python data function URL: set PYTHON_API_BASE_URL " +
      "(no VERCEL_URL present and not in development)."
  );
}

/** Default source: the Python yfinance serverless function (/api/hsi_valuation). */
export class PythonYfinanceSource implements HsiDataSource {
  readonly name = "Yahoo Finance via yfinance";

  async fetchRaw(): Promise<RawPayload> {
    const url = `${pythonApiBase()}/api/hsi_valuation`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Data function returned ${res.status} ${res.statusText}${
          body ? ` — ${body.slice(0, 300)}` : ""
        }`
      );
    }
    const json = (await res.json()) as Partial<RawPayload> & { error?: string };
    if (json.error) throw new Error(json.error);
    if (!Array.isArray(json.rows)) throw new Error("Malformed payload: missing rows[]");
    return {
      source: json.source ?? this.name,
      asOf: json.asOf ?? new Date().toISOString(),
      rows: json.rows,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Analysis logic — exclusion, ranking, divergence flags               */
/* ------------------------------------------------------------------ */

export interface ScoredConstituent extends RawConstituent {
  divergences: Divergence[];
}

export interface ExcludedConstituent {
  ticker: string;
  name: string;
  reason: string;
}

export interface HsiValuationData {
  totalCount: number;
  validCount: number;
  excludedCount: number;
  topByTrailingPE: ScoredConstituent[];
  topByPeg: ScoredConstituent[];
  inBoth: ScoredConstituent[];
  excluded: ExcludedConstituent[];
}

const TOP_N = 10;

// Divergence thresholds — tuned to match the original screen.
const HIGH_PE = 30;
const LOW_PE = 15;
const LOW_PEG = 1.0;
const HIGH_PEG = 2.5;
const FWD_GROWTH_RATIO = 0.7; // forward/trailing below this → growth expected
const FWD_DECLINE_RATIO = 1.4; // forward/trailing above this → decline expected

function computeDivergences(c: RawConstituent): Divergence[] {
  const out: Divergence[] = [];
  const { trailingPE: tpe, forwardPE: fpe, peg } = c;

  if (tpe != null && peg != null) {
    if (tpe > HIGH_PE && peg < LOW_PEG) {
      out.push({
        variant: "info",
        text: "High P/E but low PEG — growth may justify the premium.",
      });
    } else if (tpe < LOW_PE && peg > HIGH_PEG) {
      out.push({
        variant: "warn",
        text: "Low P/E but high PEG — growth expectations may be excessive.",
      });
    }
  }

  if (tpe != null && fpe != null && tpe > 0) {
    const ratio = fpe / tpe;
    if (ratio < FWD_GROWTH_RATIO) {
      out.push({
        variant: "info",
        text: `Forward P/E (${fpe.toFixed(1)}) well below trailing (${tpe.toFixed(
          1
        )}) — earnings growth expected.`,
      });
    } else if (ratio > FWD_DECLINE_RATIO) {
      out.push({
        variant: "warn",
        text: `Forward P/E (${fpe.toFixed(1)}) well above trailing (${tpe.toFixed(
          1
        )}) — earnings decline expected.`,
      });
    }
  }

  return out;
}

export function buildHsiValuation(payload: RawPayload): HsiValuationData {
  const valid: ScoredConstituent[] = [];
  const excluded: ExcludedConstituent[] = [];

  for (const row of payload.rows) {
    const reasons: string[] = [];
    if (row.trailingPE == null || row.trailingPE <= 0) {
      reasons.push("trailing P/E null or ≤ 0");
    }
    if (row.peg == null || row.peg <= 0) {
      reasons.push("PEG null or ≤ 0");
    }
    if (reasons.length > 0) {
      excluded.push({ ticker: row.ticker, name: row.name, reason: reasons.join("; ") });
    } else {
      valid.push({ ...row, divergences: computeDivergences(row) });
    }
  }

  const topByTrailingPE = [...valid]
    .sort((a, b) => (b.trailingPE ?? 0) - (a.trailingPE ?? 0))
    .slice(0, TOP_N);
  const topByPeg = [...valid]
    .sort((a, b) => (b.peg ?? 0) - (a.peg ?? 0))
    .slice(0, TOP_N);

  const peSet = new Set(topByTrailingPE.map((c) => c.ticker));
  const inBoth = topByPeg.filter((c) => peSet.has(c.ticker));

  excluded.sort((a, b) => a.ticker.localeCompare(b.ticker));

  return {
    totalCount: payload.rows.length,
    validCount: valid.length,
    excludedCount: excluded.length,
    topByTrailingPE,
    topByPeg,
    inBoth,
    excluded,
  };
}

/* ------------------------------------------------------------------ */
/* Fetcher — wires source + logic into the registry's AnalysisFetcher  */
/* ------------------------------------------------------------------ */

export class HsiValuationFetcher implements AnalysisFetcher<HsiValuationData> {
  constructor(private readonly source: HsiDataSource = new PythonYfinanceSource()) {}

  async fetch(): Promise<AnalysisResult<HsiValuationData>> {
    const payload = await this.source.fetchRaw();
    return {
      data: buildHsiValuation(payload),
      asOf: payload.asOf,
      source: payload.source,
      cached: false, // flips to true when a snapshot/cache source is dropped in
    };
  }
}

/** Convenience for the page/server component. */
export function getHsiValuation(): Promise<AnalysisResult<HsiValuationData>> {
  return new HsiValuationFetcher().fetch();
}

import type { AnalysisFetcher, AnalysisResult } from "@/lib/analysis-types";
import type { Divergence } from "@/lib/ui/DivergenceFlag";
import {
  YahooFinanceSource,
  type HsiDataSource,
  type RawConstituent,
  type RawPayload,
} from "./yahoo-source";

export type { RawConstituent, RawPayload, HsiDataSource } from "./yahoo-source";

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
  constructor(private readonly source: HsiDataSource = new YahooFinanceSource()) {}

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

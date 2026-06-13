/**
 * Core contracts for the analysis-registry pattern.
 *
 * Every analysis is a self-contained module under app/analyses/<slug>/ that:
 *   1. registers its metadata in lib/registry.ts (one line — drives the nav),
 *   2. exposes a fetcher returning AnalysisResult<TData>,
 *   3. renders a view component from that data.
 *
 * The shell knows only AnalysisMeta. It never imports analysis internals.
 */

export interface AnalysisMeta {
  /** URL segment under /analyses, e.g. "hsi-valuation". Unique. */
  slug: string;
  /** Sidebar label. */
  title: string;
  /** One-line description (sidebar tooltip / page subheading). */
  description: string;
  /** Optional grouping tags, e.g. ["equities", "HK"]. */
  tags?: string[];
}

/**
 * Envelope returned by every analysis fetcher. Generic over the analysis's
 * own data shape. The `cached`/`asOf`/`source` fields are the seam for a
 * future persistence layer: a CachedFetcher can wrap any AnalysisFetcher and
 * flip `cached` to true + serve a stored `asOf` without the view changing.
 */
export interface AnalysisResult<TData> {
  data: TData;
  /** ISO-8601 timestamp the underlying figures are as-of. */
  asOf: string;
  /** Human-readable provenance, e.g. "Yahoo Finance via yfinance". */
  source: string;
  /** False while fetching live per request; true once served from a snapshot. */
  cached: boolean;
}

/**
 * A fetcher produces an AnalysisResult. Implemented per analysis. A future
 * scheduled/cached layer implements the same interface and is dropped in
 * without rewriting the analysis module — that is the deliberate seam.
 */
export interface AnalysisFetcher<TData> {
  fetch(): Promise<AnalysisResult<TData>>;
}

import type { AnalysisFetcher, AnalysisResult } from "@/lib/analysis-types";
import seed from "./seed.json";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type WatchStatus = "ok" | "watch" | "restructure" | "default";

export interface ClrPoint {
  quarter: string; // "YYYY-MM" quarter-end
  overall: number; // cl_gross_total %
  mainland: number; // cl_gross_mainland_lend %
}

export interface OfficePoint {
  quarter: string; // "Qn YYYY"
  index: number; // RVD office price index
  qoq: number; // % QoQ (computed)
}

export interface Developer {
  ticker: string;
  name: string;
  status: WatchStatus;
  note?: string;
}

export interface WatchGroup {
  group: string;
  members: Developer[];
}

export interface CreRiskData {
  // live
  clrSeries: ClrPoint[];
  latestClr: number;
  priorClr: number | null;
  latestMainlandClr: number;
  clrAsOf: string; // quarter-end of latest live point
  // seed — manually maintained in seed.json. Each block carries a human label
  // (`*AsOf`) plus a machine ISO date (`*AsOfISO`) the view uses to flag staleness.
  officeSeries: OfficePoint[];
  officeLatestQoq: number;
  officeYoY: number;
  officeAsOf: string;
  officeAsOfISO: string;
  provisionCoverage: number;
  provisionAsOf: string;
  provisionAsOfISO: string;
  watchlist: WatchGroup[];
  watchlistAsOf: string;
  watchlistAsOfISO: string;
}

/* ------------------------------------------------------------------ */
/* Swappable data source for the live HKMA classified-loan ratio       */
/* ------------------------------------------------------------------ */

export interface ClrDataSource {
  readonly name: string;
  fetchClrSeries(): Promise<{ series: ClrPoint[]; asOf: string }>;
}

interface HkmaRecord {
  end_of_month: string;
  cl_gross_total: number | null;
  cl_gross_mainland_lend: number | null;
}

const HKMA_URL =
  "https://api.hkma.gov.hk/public/market-data-and-statistics/monthly-statistical-bulletin/banking/assetquality-ais?pagesize=200&sortby=end_of_month&sortorder=desc";

const QUARTER_END_MONTHS = new Set(["03", "06", "09", "12"]);
const QUARTERS_TO_KEEP = 12;

/** Live source: HKMA Monthly Statistical Bulletin public JSON API. */
export class HkmaClrSource implements ClrDataSource {
  readonly name = "HKMA Monthly Statistical Bulletin (assetquality-ais)";

  async fetchClrSeries(): Promise<{ series: ClrPoint[]; asOf: string }> {
    const res = await fetch(HKMA_URL, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HKMA API returned ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as { result?: { records?: HkmaRecord[] } };
    const records = json.result?.records;
    if (!Array.isArray(records)) {
      throw new Error("Malformed HKMA payload: missing result.records[]");
    }

    // Keep quarter-ends with a valid overall CLR, newest first.
    const quarterly = records
      .filter((r) => {
        const month = r.end_of_month?.split("-")[1];
        return (
          month != null &&
          QUARTER_END_MONTHS.has(month) &&
          r.cl_gross_total != null
        );
      })
      .slice(0, QUARTERS_TO_KEEP);

    if (quarterly.length === 0) {
      throw new Error("HKMA returned no quarter-end records");
    }

    const asOf = quarterly[0].end_of_month;

    // Ascending for charting.
    const series: ClrPoint[] = quarterly
      .slice()
      .reverse()
      .map((r) => ({
        quarter: r.end_of_month,
        overall: round(r.cl_gross_total as number),
        mainland: round(r.cl_gross_mainland_lend ?? 0),
      }));

    return { series, asOf };
  }
}

function round(v: number, d = 2): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

/* ------------------------------------------------------------------ */
/* Seed data — RVD CRE, provision coverage, developer watchlist         */
/*                                                                      */
/* These manually-maintained figures live in ./seed.json so editorial   */
/* updates don't require code edits. RVD publishes office prices as      */
/* XLS/PDF only, provision coverage is a semi-annual HKMA stability-     */
/* report figure, and the watchlist statuses are editorial. Each block   */
/* carries an ISO `asOf` the view uses to flag stale data. Verify before */
/* relying on them.                                                      */
/* ------------------------------------------------------------------ */

// `import seed` is typed structurally from the JSON; narrow the watchlist
// status field (string in JSON) back to the WatchStatus union.
const WATCHLIST: WatchGroup[] = seed.watchlist.groups.map((g) => ({
  group: g.group,
  members: g.members.map((m) => ({
    ticker: m.ticker,
    name: m.name,
    status: m.status as WatchStatus,
    note: m.note,
  })),
}));

function buildOfficeSeries(): OfficePoint[] {
  return seed.office.index.map((p, i) => {
    const prev = seed.office.index[i - 1];
    const qoq = prev ? round(((p.index - prev.index) / prev.index) * 100) : 0;
    return { quarter: p.quarter, index: p.index, qoq };
  });
}

/* ------------------------------------------------------------------ */
/* Fetcher                                                             */
/* ------------------------------------------------------------------ */

export class CreRiskFetcher implements AnalysisFetcher<CreRiskData> {
  constructor(private readonly clrSource: ClrDataSource = new HkmaClrSource()) {}

  async fetch(): Promise<AnalysisResult<CreRiskData>> {
    const { series, asOf } = await this.clrSource.fetchClrSeries();
    const latest = series[series.length - 1];
    const prior = series.length > 1 ? series[series.length - 2] : null;
    const office = buildOfficeSeries();
    const officeLatest = office[office.length - 1];
    const officeYearAgo = office[office.length - 5]; // 4 quarters back

    const data: CreRiskData = {
      clrSeries: series,
      latestClr: latest.overall,
      priorClr: prior ? prior.overall : null,
      latestMainlandClr: latest.mainland,
      clrAsOf: asOf,
      officeSeries: office,
      officeLatestQoq: officeLatest.qoq,
      officeYoY: officeYearAgo
        ? round(((officeLatest.index - officeYearAgo.index) / officeYearAgo.index) * 100)
        : 0,
      officeAsOf: seed.office.asOfLabel,
      officeAsOfISO: seed.office.asOf,
      provisionCoverage: seed.provision.coverage,
      provisionAsOf: seed.provision.asOfLabel,
      provisionAsOfISO: seed.provision.asOf,
      watchlist: WATCHLIST,
      watchlistAsOf: seed.watchlist.asOfLabel,
      watchlistAsOfISO: seed.watchlist.asOf,
    };

    return {
      data,
      asOf,
      source: this.clrSource.name,
      cached: false,
    };
  }
}

export function getCreRisk(): Promise<AnalysisResult<CreRiskData>> {
  return new CreRiskFetcher().fetch();
}

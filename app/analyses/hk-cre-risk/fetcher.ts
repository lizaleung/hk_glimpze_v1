import type { AnalysisFetcher, AnalysisResult } from "@/lib/analysis-types";

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
  // seed
  officeSeries: OfficePoint[];
  officeLatestQoq: number;
  officeYoY: number;
  officeAsOf: string;
  provisionCoverage: number;
  provisionAsOf: string;
  watchlist: WatchGroup[];
  watchlistAsOf: string;
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
/* Seed data — RVD CRE, provision coverage, developer watchlist        */
/*                                                                     */
/* These are manually-maintained illustrative figures (see README /    */
/* methodology). RVD publishes office prices as XLS/PDF only, provision */
/* coverage is a semi-annual HKMA stability-report figure, and the      */
/* watchlist statuses are editorial. Verify before relying on them.     */
/* ------------------------------------------------------------------ */

// RVD private office price index, last 12 quarters. Q4 2025 ~93.7,
// −4.3% QoQ, −13.6% YoY per RVD HK Property Review 2026.
// Source: https://www.rvd.gov.hk/doc/en/statistics/his_data_9.xls
const OFFICE_INDEX_RAW: { quarter: string; index: number }[] = [
  { quarter: "Q1 2023", index: 120.0 },
  { quarter: "Q2 2023", index: 118.5 },
  { quarter: "Q3 2023", index: 116.0 },
  { quarter: "Q4 2023", index: 114.2 },
  { quarter: "Q1 2024", index: 113.0 },
  { quarter: "Q2 2024", index: 111.5 },
  { quarter: "Q3 2024", index: 110.0 },
  { quarter: "Q4 2024", index: 108.4 },
  { quarter: "Q1 2025", index: 105.0 },
  { quarter: "Q2 2025", index: 101.5 },
  { quarter: "Q3 2025", index: 97.9 },
  { quarter: "Q4 2025", index: 93.7 },
];

function buildOfficeSeries(): OfficePoint[] {
  return OFFICE_INDEX_RAW.map((p, i) => {
    const prev = OFFICE_INDEX_RAW[i - 1];
    const qoq = prev ? round(((p.index - prev.index) / prev.index) * 100) : 0;
    return { quarter: p.quarter, index: p.index, qoq };
  });
}

const PROVISION_COVERAGE = 145; // % after collateral, end-Mar 2025
const PROVISION_AS_OF = "2025-03 (semi-annual)";
const OFFICE_AS_OF = "Q4 2025 (RVD HK Property Review 2026)";
const WATCHLIST_AS_OF = "2026-06 (editorial assessment)";

// Status taxonomy:
//   default     = defaulted and in liquidation or with a stalled/unresolved process
//   restructure = defaulted but with an agreed/completed restructuring or DDE
//   watch       = no default, but elevated leverage / concentration / liquidity stress
//   ok          = strong balance sheet, no distress signals
// Statuses are an editorial assessment (knowledge through early 2026); verify before relying.
const WATCHLIST: WatchGroup[] = [
  {
    group: "HK majors",
    members: [
      { ticker: "0016.HK", name: "Sun Hung Kai Properties", status: "ok", note: "Low gearing; blue-chip" },
      { ticker: "1113.HK", name: "CK Asset Holdings", status: "ok", note: "Strong balance sheet; net cash" },
      { ticker: "0012.HK", name: "Henderson Land", status: "watch", note: "Higher leverage; large development pipeline" },
      { ticker: "0083.HK", name: "Sino Land", status: "ok", note: "Historically net cash" },
      { ticker: "1997.HK", name: "Wharf REIC", status: "watch", note: "Harbour City/Times Square retail; mainland IPs" },
      { ticker: "0101.HK", name: "Hang Lung Properties", status: "watch", note: "Heavy mainland China retail exposure" },
      { ticker: "1972.HK", name: "Swire Properties", status: "watch", note: "Office-heavy (Pacific Place/Taikoo)" },
      { ticker: "0014.HK", name: "Hysan Development", status: "watch", note: "Causeway Bay office/retail concentration" },
      { ticker: "0683.HK", name: "Kerry Properties", status: "watch", note: "Mainland + HK; elevated gearing" },
      { ticker: "0173.HK", name: "K. Wah International", status: "watch", note: "Small-cap; mainland exposure" },
      { ticker: "0041.HK", name: "Great Eagle Holdings", status: "watch", note: "Champion REIT sponsor; hotels + office" },
      { ticker: "private", name: "Nan Fung Group (private)", status: "watch", note: "Private; large CRE/development book" },
      { ticker: "0369.HK", name: "Wing Tai Properties", status: "watch", note: "Small-cap developer" },
      { ticker: "0480.HK", name: "HKR International", status: "watch", note: "Discovery Bay; small-cap" },
      { ticker: "0088.HK", name: "Tai Cheung Holdings", status: "ok", note: "Small, conservative; net cash" },
      { ticker: "0488.HK", name: "Lai Sun Development", status: "watch", note: "CRE-heavy small-cap" },
      { ticker: "0017.HK", name: "New World Development", status: "restructure", note: "Perp coupon deferral + HK$88bn refinancing 2025; Bloomberg flagged default risk Nov 2025" },
    ],
  },
  {
    group: "Mainland devs with HK exposure",
    members: [
      { ticker: "0688.HK", name: "China Overseas Land & Inv.", status: "ok", note: "SOE; investment-grade anchor" },
      { ticker: "1109.HK", name: "China Resources Land", status: "ok", note: "SOE; strong credit" },
      { ticker: "2202.HK", name: "China Vanke", status: "watch", note: "Liquidity stress; Shenzhen SOE support" },
      { ticker: "0960.HK", name: "Longfor Group", status: "watch", note: "Survivor; deleveraging, still servicing debt" },
      { ticker: "0337.HK", name: "Greenland HK Holdings", status: "restructure", note: "Parent distressed bond extensions" },
      { ticker: "1238.HK", name: "Powerlong Real Estate", status: "default", note: "Offshore default; restructuring" },
      { ticker: "2007.HK", name: "Country Garden", status: "restructure", note: "US$17.7bn offshore restructuring (Feb 2026)" },
      { ticker: "1918.HK", name: "Sunac China", status: "restructure", note: "Offshore restructuring (2023; second round 2025)" },
      { ticker: "3883.HK", name: "China Aoyuan", status: "restructure", note: "Offshore restructuring completed 2024" },
      { ticker: "3333.HK", name: "China Evergrande", status: "default", note: "Liquidation since Jan 2024; delisted Aug 2024" },
      { ticker: "0813.HK", name: "Shimao Group", status: "default", note: "Defaulted 2022; liquidation petitions" },
      { ticker: "1638.HK", name: "Kaisa Group", status: "restructure", note: "Defaulted Dec 2021; restructuring plan advanced" },
      { ticker: "0884.HK", name: "CIFI Holdings", status: "restructure", note: "Defaulted Sep 2022; restructuring agreed" },
      { ticker: "3380.HK", name: "Logan Group", status: "restructure", note: "Defaulted; restructuring" },
      { ticker: "1233.HK", name: "Times China", status: "default", note: "Defaulted 2022; liquidation petitions" },
      { ticker: "1777.HK", name: "Fantasia Holdings", status: "default", note: "Defaulted Oct 2021" },
      { ticker: "1628.HK", name: "Yuzhou Group", status: "restructure", note: "Defaulted 2022; restructuring" },
      { ticker: "3383.HK", name: "Agile Group", status: "restructure", note: "Missed payments 2024; restructuring (added)" },
      { ticker: "3377.HK", name: "Sino-Ocean Group", status: "restructure", note: "Defaulted 2023; restructuring (added)" },
      { ticker: "1813.HK", name: "KWG Group", status: "restructure", note: "Defaulted; restructuring (added)" },
      { ticker: "1098.HK", name: "Road King Infrastructure", status: "default", note: "Offshore default 2024 (added)" },
    ],
  },
  {
    group: "Smaller HK + REITs",
    members: [
      { ticker: "0035.HK", name: "Far East Consortium", status: "watch", note: "Diversified property + hotels" },
      { ticker: "0823.HK", name: "Link REIT", status: "watch", note: "Largest REIT; retail/office valuation pressure" },
      { ticker: "0778.HK", name: "Fortune REIT", status: "ok", note: "Defensive suburban retail" },
      { ticker: "0435.HK", name: "Sunlight REIT", status: "watch", note: "Office/retail; decentralised" },
      { ticker: "0808.HK", name: "Prosperity REIT", status: "watch", note: "Decentralised office" },
      { ticker: "2778.HK", name: "Champion REIT", status: "watch", note: "Central office concentration" },
      { ticker: "0405.HK", name: "Yuexiu REIT", status: "watch", note: "Mainland CRE proxy (Guangzhou)" },
      { ticker: "N2IU.SI", name: "Mapletree Pan Asia Comm. Trust", status: "watch", note: "Festival Walk HK exposure (SGX-listed)" },
      { ticker: "1426.HK", name: "Spring REIT", status: "watch", note: "Beijing CBD office" },
      { ticker: "87001.HK", name: "Hui Xian REIT", status: "watch", note: "Beijing Oriental Plaza; mainland (RMB-traded)" },
      { ticker: "1881.HK", name: "Regal REIT", status: "watch", note: "HK hotels" },
      { ticker: "0163.HK", name: "Emperor International", status: "default", note: "Overdue/breached bank loans 2025; lender talks" },
      { ticker: "0127.HK", name: "Chinese Estates", status: "watch", note: "CRE; prior Evergrande-stake losses" },
      { ticker: "0530.HK", name: "Goldin Financial Holdings", status: "default", note: "Kowloon Bay tower force-sold 2020; receivership" },
    ],
  },
];

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
      officeAsOf: OFFICE_AS_OF,
      provisionCoverage: PROVISION_COVERAGE,
      provisionAsOf: PROVISION_AS_OF,
      watchlist: WATCHLIST,
      watchlistAsOf: WATCHLIST_AS_OF,
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

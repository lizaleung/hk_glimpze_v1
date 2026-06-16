import "server-only";
import YahooFinance from "yahoo-finance2";

/**
 * Yahoo Finance data source for HSI constituent valuation metrics.
 *
 * Replaces the former Python serverless function (api/hsi_valuation.py) — the
 * fetch now runs in-process in the Node runtime, so there is no internal HTTP
 * hop and no separate language/runtime to deploy. Returns RAW per-ticker metrics
 * only; all ranking/exclusion/flagging logic lives in ./fetcher.ts behind the
 * HsiDataSource interface, so this source stays swappable.
 */

/* ------------------------------------------------------------------ */
/* Data contracts (the swappable-source seam)                          */
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
 * The seam. Any source (Yahoo now; FMP, a flat JSON file, or a cached snapshot
 * later) implements this. Swapping sources never touches the ranking logic or
 * the view.
 */
export interface HsiDataSource {
  readonly name: string;
  fetchRaw(): Promise<RawPayload>;
}

/* ------------------------------------------------------------------ */
/* Yahoo Finance source                                                */
/* ------------------------------------------------------------------ */

const SOURCE_NAME = "Yahoo Finance (yahoo-finance2)";

// HSI constituents (.HK symbols). Maintained here as the source's universe.
// When the index rebalances, update this list — or swap to a data source that
// resolves constituents dynamically (the interface does not care which).
const HSI_TICKERS: string[] = [
  "0001.HK", "0002.HK", "0003.HK", "0005.HK", "0006.HK",
  "0011.HK", "0012.HK", "0016.HK", "0017.HK", "0019.HK",
  "0027.HK", "0066.HK", "0101.HK", "0175.HK", "0241.HK",
  "0267.HK", "0285.HK", "0291.HK", "0316.HK", "0322.HK",
  "0388.HK", "0669.HK", "0688.HK", "0700.HK", "0762.HK",
  "0823.HK", "0857.HK", "0868.HK", "0883.HK", "0939.HK",
  "0941.HK", "0960.HK", "0968.HK", "0992.HK", "1038.HK",
  "1044.HK", "1088.HK", "1093.HK", "1109.HK", "1177.HK",
  "1209.HK", "1211.HK", "1299.HK", "1378.HK", "1398.HK",
  "1810.HK", "1876.HK", "1928.HK", "2007.HK", "2018.HK",
  "2020.HK", "2269.HK", "2313.HK", "2318.HK", "2319.HK",
  "2331.HK", "2382.HK", "2388.HK", "2628.HK", "3328.HK",
  "3690.HK", "3968.HK", "3988.HK", "6098.HK", "6862.HK",
  "9618.HK", "9633.HK", "9888.HK", "9961.HK", "9988.HK",
  "9999.HK",
];

// One client per server instance. suppressNotices silences the library's
// first-run survey/console notices in serverless logs.
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

/** Run an async mapper over items with a bounded number of concurrent calls. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function fetchOne(ticker: string): Promise<RawConstituent> {
  try {
    const r = await yf.quoteSummary(ticker, {
      modules: ["price", "summaryDetail", "defaultKeyStatistics"],
    });
    // yahoo-finance2 types the PEG fields loosely ({} | number); coerce to number.
    const pegRaw =
      r.defaultKeyStatistics?.trailingPegRatio ??
      r.defaultKeyStatistics?.pegRatio;
    const peg = typeof pegRaw === "number" ? pegRaw : null;
    return {
      ticker,
      name: r.price?.shortName ?? r.price?.longName ?? ticker,
      trailingPE: r.summaryDetail?.trailingPE ?? null,
      forwardPE: r.summaryDetail?.forwardPE ?? null,
      peg,
      marketCap: r.price?.marketCap ?? null,
    };
  } catch {
    // Surface a per-ticker miss as nulls; never crash the whole batch. Such rows
    // are filtered into the "excluded" bucket by the analysis logic downstream.
    return {
      ticker,
      name: ticker,
      trailingPE: null,
      forwardPE: null,
      peg: null,
      marketCap: null,
    };
  }
}

/** Fetch all HSI constituents and return a raw payload (rows sorted by ticker). */
export async function fetchHsiPayload(concurrency = 8): Promise<RawPayload> {
  const rows = await mapWithConcurrency(HSI_TICKERS, concurrency, fetchOne);
  rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
  return {
    source: SOURCE_NAME,
    asOf: new Date().toISOString(),
    rows,
  };
}

/** Default source: Yahoo Finance via yahoo-finance2, fetched in-process. */
export class YahooFinanceSource implements HsiDataSource {
  readonly name = SOURCE_NAME;
  fetchRaw(): Promise<RawPayload> {
    return fetchHsiPayload();
  }
}

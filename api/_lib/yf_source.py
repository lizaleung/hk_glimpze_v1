"""yfinance-backed data source for HSI constituent valuation metrics.

Returns RAW per-ticker metrics only. All ranking, exclusion, and flagging
logic lives on the TypeScript side (lib/) so that the data source stays
swappable behind the HsiDataSource interface without touching analysis logic.

This module is imported by both:
  - api/hsi_valuation.py  (the Vercel Python serverless function)
  - scripts/dev_api.py    (the local dev HTTP server used by `npm run dev`)
"""

from __future__ import annotations

import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

warnings.filterwarnings("ignore")

SOURCE_NAME = "Yahoo Finance via yfinance"

# HSI constituents (.HK symbols). Maintained here as the source's universe.
# When the index rebalances, update this list — or swap to a data source that
# resolves constituents dynamically (the interface does not care which).
HSI_TICKERS: list[str] = [
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
]


def _fetch_one(ticker: str) -> dict:
    import yfinance as yf

    try:
        info = yf.Ticker(ticker).info
        peg = info.get("trailingPegRatio")
        if peg is None:
            peg = info.get("pegRatio")
        return {
            "ticker": ticker,
            "name": info.get("shortName") or info.get("longName") or ticker,
            "trailingPE": info.get("trailingPE"),
            "forwardPE": info.get("forwardPE"),
            "peg": peg,
            "marketCap": info.get("marketCap"),
        }
    except Exception as exc:  # noqa: BLE001 — surface per-ticker, never crash the batch
        return {
            "ticker": ticker,
            "name": ticker,
            "trailingPE": None,
            "forwardPE": None,
            "peg": None,
            "marketCap": None,
            "error": str(exc),
        }


def fetch_hsi_payload(max_workers: int = 8) -> dict:
    """Fetch all HSI constituents concurrently and return a raw payload.

    Shape:
      {
        "source": str,
        "asOf": ISO-8601 UTC timestamp,
        "rows": [ { ticker, name, trailingPE, forwardPE, peg, marketCap }, ... ]
      }
    """
    rows: list[dict] = []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_fetch_one, t): t for t in HSI_TICKERS}
        for fut in as_completed(futures):
            rows.append(fut.result())

    # Stable order by ticker for deterministic output.
    rows.sort(key=lambda r: r["ticker"])

    return {
        "source": SOURCE_NAME,
        "asOf": datetime.now(timezone.utc).isoformat(),
        "rows": rows,
    }

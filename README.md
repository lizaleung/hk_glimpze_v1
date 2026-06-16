# Hong Kong Glimpze

A personal financial-analysis dashboard. Next.js (App Router) + TypeScript +
Tailwind, deployed to Vercel. Each analysis is a self-contained module that
registers itself into a shared shell; data is fetched and analyzed once a day by
a cron job and served to all visitors from a cached snapshot.

## Quick start

Requires Node 18+. Everything is TypeScript — no other runtime needed:

```bash
npm install
npm run dev                            # Next on :3000
```

Open http://localhost:3000. To seed the local cache so pages serve from a
snapshot (instead of live-fetching), hit the refresh job once:

```bash
curl http://localhost:3000/api/cron/refresh    # writes .snapshots/*.json locally
```

## Architecture

### Analysis registry pattern

Each analysis is a self-contained module under `app/analyses/<slug>/`:

```
app/analyses/<slug>/
  fetcher.ts   # data source(s) + analysis logic → AnalysisResult<T>
  view.tsx     # presentation
  page.tsx     # reads the snapshot via loadAnalysis(); error state
  loading.tsx  # streamed skeleton
```

The shell ([app/layout.tsx](app/layout.tsx) + [lib/ui/Sidebar.tsx](lib/ui/Sidebar.tsx))
renders navigation from [lib/registry.ts](lib/registry.ts) and knows nothing
about analysis internals.

### Shared UI primitives (`lib/ui/`)

`RankedTable`, `MetricCard`, `FlagBadge` / `DivergenceNote`, `ErrorPanel`,
`Sidebar` — reusable across all analyses.

### Swappable data source

Each analysis fetches through an interface, not a concrete client:

```ts
interface HsiDataSource { fetchRaw(): Promise<RawPayload> }   // HSI
interface ClrDataSource { fetchClrSeries(): Promise<...> }    // HK CRE
```

Swap to a different provider (FMP, a different API) by passing another
implementation to the fetcher — ranking/analysis logic and the view never
change. `AnalysisResult<T>` carries `{ asOf, source, cached }` so the cache
layer is transparent to views.

### Data refresh — daily snapshot, cached for traffic

The expensive **fetch + analyze** runs once a day, never on the request path:

```
Vercel Cron (daily) → live fetch + analyze → write snapshot → bust cache
                                                   │
Page load → loadAnalysis(slug) → read snapshot (unstable_cache) → render
```

- **Cron** ([app/api/cron/refresh](app/api/cron/refresh/route.ts)) runs every
  analysis's live fetcher, writes a JSON snapshot, and calls
  `revalidateTag` / `revalidatePath`. Scheduled at 22:00 UTC (06:00 HKT) in
  [vercel.json](vercel.json). Protected by `CRON_SECRET`.
- **Snapshot store** ([lib/snapshot.ts](lib/snapshot.ts)) — Vercel Blob in
  production (`BLOB_READ_WRITE_TOKEN`, set automatically when a Blob store is
  linked); local filesystem `.snapshots/` for `npm run dev`.
- **Pages** call [`loadAnalysis(slug)`](lib/load-analysis.ts), which reads the
  snapshot wrapped in `unstable_cache` so 1000+ visitors share one read. Before
  the first cron run (or if a read fails), it falls back to a live fetch.

## Analyses

### HSI Valuation Ranking — `/analyses/hsi-valuation`

Ranks Hang Seng constituents by trailing P/E and PEG: top 10 by each metric, the
overlap, and an excluded list (loss-making / missing data). Flags rows where P/E
and PEG disagree, or forward P/E diverges from trailing. Data from Yahoo Finance
via `yahoo-finance2`, fetched in-process (see
[yahoo-source.ts](app/analyses/hsi-valuation/yahoo-source.ts)).

### HK CRE Risk Monitor — `/analyses/hk-cre-risk`

Hong Kong commercial-real-estate credit risk:

- **Classified loan ratio (live)** — HKMA Monthly Statistical Bulletin JSON API
  (`HkmaClrSource`), quarter-ends, last 12 quarters. Overall + mainland-related.
- **Office prices, provision coverage, watchlist (seed)** — RVD publishes office
  prices as XLS/PDF only and provision coverage is a semi-annual figure, so these
  are manually-maintained in [seed.json](app/analyses/hk-cre-risk/seed.json), each
  block carrying an ISO `asOf` the UI uses to flag stale figures. Watchlist
  statuses are an editorial assessment — verify before relying on them.
- **Threshold alerts (client-side)** — configurable CLR (default 2.5%) and office
  QoQ (default −5%) thresholds drive a red/amber/green banner.
- **Charts** — CLR lines with a threshold line; office QoQ bars + index line.
- **Developer news** — [news.ts](app/analyses/hk-cre-risk/news.ts) uses Claude
  (`claude-opus-4-8`) with server-side web search to extract recent developer
  credit news. This is expensive, so it runs once a day in the cron job and is
  served from a cached snapshot; the "Re-scan" button
  ([app/api/cre-news/route.ts](app/api/cre-news/route.ts)) triggers an on-demand
  live refresh. Requires `ANTHROPIC_API_KEY`; degrades to topic-page links
  without it.

Both analyses fetch in-process (the HKMA JSON API for CRE, `yahoo-finance2` for
HSI) behind the `ClrDataSource` / `HsiDataSource` interfaces for swappability.

## Adding an analysis

1. Create `app/analyses/<slug>/{fetcher.ts,view.tsx,page.tsx}` (+ optional
   `loading.tsx`). The fetcher exposes a `get<Name>()` returning
   `AnalysisResult<T>`.
2. Add one metadata entry to `analyses[]` in [lib/registry.ts](lib/registry.ts)
   (drives the sidebar).
3. Add one line to [lib/analyses-runtime.ts](lib/analyses-runtime.ts)
   (`slug → live fetcher`) so the cron refreshes it.
4. In `page.tsx`, render from `loadAnalysis<T>(slug)`.

No shell edits.

## Deploy to Vercel

```bash
vercel        # or connect the repo in the Vercel dashboard
```

Vercel auto-detects Next.js (`package.json`) and the cron schedule
(`vercel.json`). Then:

| Setting | Required for | Notes |
|---|---|---|
| Blob store (Storage → Blob) | daily snapshot cache | Sets `BLOB_READ_WRITE_TOKEN` automatically |
| `CRON_SECRET` | securing the refresh job | **Required** — the refresh job fails closed (503) on Vercel without it |
| `ANTHROPIC_API_KEY` | developer-news scan | Optional; without it the news panel shows topic links |

On first deploy, pages live-fetch until the first cron run — or trigger it once:
`GET /api/cron/refresh` with `Authorization: Bearer $CRON_SECRET`.

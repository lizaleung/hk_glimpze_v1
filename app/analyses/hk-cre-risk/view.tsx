"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line, Chart } from "react-chartjs-2";
import type { AnalysisResult } from "@/lib/analysis-types";
import { fmtNum, fmtAsOf, monthsSince } from "@/lib/format";
import type { CreRiskData, WatchStatus, WatchGroup } from "./fetcher";
import type { NewsResult } from "./news";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler
);

type Severity = "green" | "amber" | "red";
const SEV_RANK: Record<Severity, number> = { green: 0, amber: 1, red: 2 };

const STATUS_STYLE: Record<WatchStatus, { label: string; cls: string; rank: number }> = {
  ok: { label: "OK", cls: "bg-green-100 text-green-800", rank: 0 },
  watch: { label: "Watch", cls: "bg-amber-100 text-amber-800", rank: 1 },
  restructure: { label: "Restructure", cls: "bg-purple-100 text-purple-800", rank: 2 },
  default: { label: "Default", cls: "bg-red-100 text-red-800", rank: 3 },
};

function Dot({ sev }: { sev: Severity }) {
  const c = sev === "green" ? "bg-green-500" : sev === "amber" ? "bg-amber-500" : "bg-red-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${c}`} aria-label={sev} />;
}

// Staleness budgets for the manually-maintained seed blocks (in months). Each
// block has a different natural cadence; past its budget the UI flags it.
const STALE_AFTER_MONTHS = { office: 4, provision: 7, watchlist: 3 } as const;

/** Inline "⚠ N mo old" marker shown next to a stale seed figure's as-of line. */
function StaleTag({ months }: { months: number }) {
  return (
    <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800">
      ⚠ {months} mo old
    </span>
  );
}

function Kpi({
  label,
  value,
  sub,
  sev,
  delta,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  sev: Severity;
  delta?: number | null;
}) {
  return (
    <div className="rounded-md bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{label}</span>
        <Dot sev={sev} />
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-medium tabular-nums text-slate-900">{value}</span>
        {delta != null ? (
          <span
            className={`text-xs font-medium tabular-nums ${
              delta > 0 ? "text-red-700" : delta < 0 ? "text-green-700" : "text-slate-500"
            }`}
          >
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "–"} {fmtNum(Math.abs(delta), 2)}pp QoQ
          </span>
        ) : null}
      </div>
      {sub ? <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div> : null}
    </div>
  );
}

interface NewsState extends NewsResult {
  loading: boolean;
}

export function CreRiskView({
  result,
  initialNews,
}: {
  result: AnalysisResult<CreRiskData>;
  initialNews: NewsResult;
}) {
  const { data, source, asOf, cached } = result;
  const [clrThreshold, setClrThreshold] = useState(2.5);
  const [officeThreshold, setOfficeThreshold] = useState(-5);
  // Seeded with the daily-snapshot news (scanned in cron); Re-scan does a live refresh.
  const [news, setNews] = useState<NewsState>({ loading: false, ...initialNews });

  const clrDelta = data.priorClr != null ? data.latestClr - data.priorClr : null;

  // -- watchlist counts --
  const counts = useMemo(() => {
    let def = 0,
      restructure = 0,
      watch = 0;
    for (const g of data.watchlist) {
      for (const m of g.members) {
        if (m.status === "default") def += 1;
        else if (m.status === "restructure") restructure += 1;
        else if (m.status === "watch") watch += 1;
      }
    }
    return { def, restructure, watch };
  }, [data.watchlist]);

  // -- seed-data staleness --
  // Each manually-maintained block ages at its own cadence; surface the ones
  // past their budget so stale figures can't masquerade as current.
  const stale = useMemo(() => {
    const office = monthsSince(data.officeAsOfISO);
    const provision = monthsSince(data.provisionAsOfISO);
    const watchlist = monthsSince(data.watchlistAsOfISO);
    const flagged: { label: string; months: number }[] = [];
    if (office > STALE_AFTER_MONTHS.office)
      flagged.push({ label: "Office price index", months: office });
    if (provision > STALE_AFTER_MONTHS.provision)
      flagged.push({ label: "Provision coverage", months: provision });
    if (watchlist > STALE_AFTER_MONTHS.watchlist)
      flagged.push({ label: "Developer watchlist", months: watchlist });
    return { office, provision, watchlist, flagged };
  }, [data.officeAsOfISO, data.provisionAsOfISO, data.watchlistAsOfISO]);

  // -- alert evaluation (client-side) --
  const alerts = useMemo(() => {
    const reasons: { sev: Severity; text: string }[] = [];

    if (data.latestClr >= clrThreshold) {
      reasons.push({ sev: "red", text: `Classified loan ratio ${fmtNum(data.latestClr)}% ≥ ${clrThreshold}% threshold` });
    } else if (data.latestClr >= clrThreshold - 0.3) {
      reasons.push({ sev: "amber", text: `Classified loan ratio ${fmtNum(data.latestClr)}% within 0.3pp of ${clrThreshold}% threshold` });
    }

    if (data.officeLatestQoq <= officeThreshold) {
      reasons.push({ sev: "red", text: `Office prices ${fmtNum(data.officeLatestQoq)}% QoQ ≤ ${officeThreshold}% threshold` });
    } else if (data.officeLatestQoq <= officeThreshold + 1) {
      reasons.push({ sev: "amber", text: `Office prices ${fmtNum(data.officeLatestQoq)}% QoQ approaching ${officeThreshold}% threshold` });
    }

    if (counts.def + counts.restructure >= 1) {
      reasons.push({ sev: "amber", text: `${counts.def + counts.restructure} developer(s) in default/restructure` });
    }
    if (counts.watch > 2) {
      reasons.push({ sev: "amber", text: `${counts.watch} developers on watch` });
    }

    const overall: Severity = reasons.reduce<Severity>(
      (worst, r) => (SEV_RANK[r.sev] > SEV_RANK[worst] ? r.sev : worst),
      "green"
    );
    return { overall, reasons };
  }, [data, clrThreshold, officeThreshold, counts]);

  // -- chart 1: CLR over time + threshold line --
  const clrChart = useMemo(
    () => ({
      data: {
        labels: data.clrSeries.map((p) => p.quarter),
        datasets: [
          {
            label: "Overall CLR",
            data: data.clrSeries.map((p) => p.overall),
            borderColor: "#185fa5",
            backgroundColor: "#185fa5",
            tension: 0.25,
            pointRadius: 2,
          },
          {
            label: "Mainland-related CLR",
            data: data.clrSeries.map((p) => p.mainland),
            borderColor: "#1d9e75",
            backgroundColor: "#1d9e75",
            borderDash: [4, 3],
            tension: 0.25,
            pointRadius: 2,
          },
          {
            label: `Threshold (${clrThreshold}%)`,
            data: data.clrSeries.map(() => clrThreshold),
            borderColor: "#a32d2d",
            borderDash: [6, 4],
            pointRadius: 0,
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { mode: "index" as const, intersect: false } },
        scales: {
          y: { ticks: { callback: (v: string | number) => `${v}%` }, grid: { color: "rgba(0,0,0,0.05)" } },
          x: { grid: { display: false } },
        },
      },
    }),
    [data.clrSeries, clrThreshold]
  );

  // -- chart 2: office QoQ bars (red where breach) + index line on y1 --
  const officeChart = useMemo(
    () => ({
      data: {
        labels: data.officeSeries.map((p) => p.quarter),
        datasets: [
          {
            type: "bar" as const,
            label: "Office QoQ %",
            data: data.officeSeries.map((p) => p.qoq),
            backgroundColor: data.officeSeries.map((p) =>
              p.qoq <= officeThreshold ? "#e24b4a" : "#85b7eb"
            ),
            yAxisID: "y",
            order: 2,
          },
          {
            type: "line" as const,
            label: "Office price index",
            data: data.officeSeries.map((p) => p.index),
            borderColor: "#534ab7",
            backgroundColor: "#534ab7",
            yAxisID: "y1",
            tension: 0.25,
            pointRadius: 2,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { mode: "index" as const, intersect: false } },
        scales: {
          y: {
            position: "left" as const,
            ticks: { callback: (v: string | number) => `${v}%` },
            grid: { color: "rgba(0,0,0,0.05)" },
          },
          y1: { position: "right" as const, grid: { display: false } },
          x: { grid: { display: false } },
        },
      },
    }),
    [data.officeSeries, officeThreshold]
  );

  async function rescan() {
    setNews((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch("/api/cre-news", { method: "POST" });
      const json = (await res.json()) as NewsResult;
      setNews({ loading: false, ...json });
    } catch (e) {
      setNews((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : "Request failed",
      }));
    }
  }

  const bannerStyle: Record<Severity, string> = {
    green: "border-green-200 bg-green-50 text-green-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-800",
  };

  return (
    <div>
      <header className="border-b border-slate-200 pb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-medium text-slate-900">HK CRE Risk Monitor</h1>
            <p className="mt-1 text-[13px] text-slate-500">
              Hong Kong classified-loan ratio, commercial property prices, provision
              coverage, and developer credit watch.
            </p>
          </div>
          <div className="flex items-end gap-3 text-[12px]">
            <label className="flex flex-col gap-1 text-slate-500">
              CLR threshold %
              <input
                type="number"
                step="0.1"
                value={clrThreshold}
                onChange={(e) => setClrThreshold(parseFloat(e.target.value) || 0)}
                className="w-20 rounded-md border border-slate-300 px-2 py-1 text-slate-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-slate-500">
              Office QoQ %
              <input
                type="number"
                step="0.5"
                value={officeThreshold}
                onChange={(e) => setOfficeThreshold(parseFloat(e.target.value) || 0)}
                className="w-20 rounded-md border border-slate-300 px-2 py-1 text-slate-900"
              />
            </label>
            <button
              onClick={() => window.location.reload()}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>
        </div>
        <p className="mt-2 text-[12px] text-slate-400">
          CLR source: {source} · As of {fmtAsOf(asOf)} ·{" "}
          {cached ? "Cached daily snapshot" : "Live fetch"}
        </p>
      </header>

      {/* Alert banner */}
      <div className={`mt-4 rounded-md border px-4 py-3 ${bannerStyle[alerts.overall]}`}>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Dot sev={alerts.overall} />
          {alerts.overall === "green"
            ? "No threshold breaches"
            : alerts.overall === "amber"
            ? "Elevated — watch"
            : "Alert — threshold breached"}
        </div>
        {alerts.reasons.length > 0 ? (
          <ul className="mt-1.5 space-y-0.5 text-[12px]">
            {alerts.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
                {r.text}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Seed-data staleness */}
      {stale.flagged.length > 0 ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          <div className="text-sm font-medium">⚠ Seed data may be stale</div>
          <ul className="mt-1.5 space-y-0.5 text-[12px]">
            {stale.flagged.map((f) => (
              <li key={f.label} className="flex items-start gap-1.5">
                <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
                {f.label} last updated {f.months} months ago — these are hand-maintained
                figures; verify against source before relying on them.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* KPI cards */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Classified Loan Ratio"
          value={`${fmtNum(data.latestClr)}%`}
          sub={`Live · ${data.clrAsOf}`}
          sev={data.latestClr >= clrThreshold ? "red" : data.latestClr >= clrThreshold - 0.3 ? "amber" : "green"}
          delta={clrDelta}
        />
        <Kpi
          label="Mainland-Related CLR"
          value={`${fmtNum(data.latestMainlandClr)}%`}
          sub={`Live · ${data.clrAsOf}`}
          sev={data.latestMainlandClr >= clrThreshold ? "red" : data.latestMainlandClr >= clrThreshold - 0.3 ? "amber" : "green"}
        />
        <Kpi
          label="Provision Coverage"
          value={`${fmtNum(data.provisionCoverage, 0)}%`}
          sub={
            <>
              Seed · {data.provisionAsOf}
              {stale.provision > STALE_AFTER_MONTHS.provision ? (
                <StaleTag months={stale.provision} />
              ) : null}
            </>
          }
          sev="amber"
        />
        <Kpi
          label="Office Price YoY"
          value={`${fmtNum(data.officeYoY)}%`}
          sub={
            <>
              Seed · {data.officeAsOf}
              {stale.office > STALE_AFTER_MONTHS.office ? (
                <StaleTag months={stale.office} />
              ) : null}
            </>
          }
          sev="amber"
        />
      </div>

      {/* Charts */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Classified loan ratio — 12 quarters
          </h2>
          <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm" style={{ background: "#185fa5" }} />Overall</span>
            <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm" style={{ background: "#1d9e75" }} />Mainland</span>
            <span className="flex items-center gap-1"><span className="h-0.5 w-3" style={{ background: "#a32d2d" }} />Threshold</span>
          </div>
          <div className="relative h-64">
            <Line data={clrChart.data} options={clrChart.options} aria-label="Line chart of overall and mainland classified loan ratio over 12 quarters" />
          </div>
        </section>

        <section>
          <h2 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Office prices — QoQ % and index level
          </h2>
          <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm" style={{ background: "#85b7eb" }} />QoQ %</span>
            <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm" style={{ background: "#e24b4a" }} />QoQ % (breach)</span>
            <span className="flex items-center gap-1"><span className="h-0.5 w-3" style={{ background: "#534ab7" }} />Index (right)</span>
          </div>
          <div className="relative h-64">
            <Chart type="bar" data={officeChart.data} options={officeChart.options} aria-label="Bar chart of office price QoQ percent with index level line on secondary axis" />
          </div>
        </section>
      </div>

      {/* Watchlist */}
      <section className="mt-8">
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
          Developer watchlist · seed as of {data.watchlistAsOf}
          {stale.watchlist > STALE_AFTER_MONTHS.watchlist ? (
            <StaleTag months={stale.watchlist} />
          ) : null}
        </h2>
        <Watchlist groups={data.watchlist} />
      </section>

      {/* Developer news */}
      <section className="mt-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Recent developer news
          </h2>
          <button
            onClick={rescan}
            disabled={news.loading}
            className="rounded-md border border-slate-300 px-3 py-1 text-[12px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {news.loading ? "Scanning…" : "Re-scan ↗"}
          </button>
        </div>
        <NewsPanel news={news} />
      </section>

      {/* Methodology */}
      <details className="mt-8 rounded-md border border-slate-200">
        <summary className="cursor-pointer select-none px-3 py-2 text-[13px] font-medium text-slate-700">
          Methodology & credits
        </summary>
        <div className="space-y-2 border-t border-slate-200 px-3 py-2 text-[12px] text-slate-600">
          <p>
            <strong>Classified loans</strong> are loans graded sub-standard, doubtful, or loss
            under the HKMA loan-classification system — i.e. where full repayment is in doubt.
            The classified loan ratio (CLR) is classified loans as a share of total loans.
          </p>
          <p>
            HKMA publishes the Monthly Statistical Bulletin on the <strong>9th business day</strong>{" "}
            of each month; this dashboard reads quarter-end figures live and shows the last 12 quarters.
          </p>
          <p>
            Office price index and YoY are seed figures from the RVD HK Property Review (XLS/PDF,
            not machine-readable). Provision coverage (145%, after collateral) is a semi-annual
            HKMA Half-Yearly Stability Report figure. Watchlist statuses are editorial — verify
            before relying on them.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            <a className="text-blue-700 hover:underline" href="https://api.hkma.gov.hk/public/market-data-and-statistics/monthly-statistical-bulletin/banking/assetquality-ais" target="_blank" rel="noopener noreferrer">HKMA MSB (asset quality)</a>
            <a className="text-blue-700 hover:underline" href="https://apidocs.hkma.gov.hk/" target="_blank" rel="noopener noreferrer">HKMA API docs</a>
            <a className="text-blue-700 hover:underline" href="https://www.rvd.gov.hk/en/publications/property_market_statistics.html" target="_blank" rel="noopener noreferrer">RVD property statistics</a>
            <a className="text-blue-700 hover:underline" href="https://www.hkma.gov.hk/eng/news-and-media/publications-and-research/half-yearly-monetary-and-financial-stability-report/" target="_blank" rel="noopener noreferrer">HKMA stability reports</a>
          </div>
        </div>
      </details>
    </div>
  );
}

function Watchlist({ groups }: { groups: WatchGroup[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className="border-b border-slate-200 px-2 py-1.5 text-left text-[11px] font-medium text-slate-500">Ticker</th>
            <th className="border-b border-slate-200 px-2 py-1.5 text-left text-[11px] font-medium text-slate-500">Name</th>
            <th className="border-b border-slate-200 px-2 py-1.5 text-left text-[11px] font-medium text-slate-500">Status</th>
            <th className="border-b border-slate-200 px-2 py-1.5 text-left text-[11px] font-medium text-slate-500">Note</th>
          </tr>
        </thead>
        {groups.map((g) => {
          const sorted = [...g.members].sort(
            (a, b) => STATUS_STYLE[a.status].rank - STATUS_STYLE[b.status].rank
          );
          return (
            <tbody key={g.group}>
              <tr>
                  <td colSpan={4} className="bg-slate-50 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {g.group}
                  </td>
                </tr>
                {sorted.map((m) => {
                  const s = STATUS_STYLE[m.status];
                  return (
                    <tr key={m.ticker} className="border-b border-slate-100">
                      <td className="px-2 py-2 font-mono text-[12px] text-slate-500">{m.ticker}</td>
                      <td className="px-2 py-2 font-medium text-slate-900">{m.name}</td>
                      <td className="px-2 py-2">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${s.cls}`}>{s.label}</span>
                      </td>
                      <td className="px-2 py-2 text-[12px] text-slate-500">{m.note ?? "—"}</td>
                    </tr>
                  );
                })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

function NewsPanel({ news }: { news: NewsState }) {
  if (news.loading) {
    return <p className="text-[13px] text-slate-500">Searching recent developer news…</p>;
  }
  if (!news.items && !news.message && !news.error) {
    return (
      <p className="text-[13px] text-slate-500">
        Click <span className="font-medium">Re-scan</span> to pull recent developer credit news.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {news.error ? <p className="text-[12px] text-red-700">{news.error}</p> : null}
      {news.message ? <p className="text-[12px] text-amber-700">{news.message}</p> : null}
      {news.items && news.items.length > 0 ? (
        <ul className="divide-y divide-slate-100">
          {news.items.map((it, i) => (
            <li key={i} className="py-2">
              <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-blue-700 hover:underline">
                {it.title}
              </a>
              <div className="text-[11px] text-slate-400">
                {it.date}
                {it.source ? ` · ${it.source}` : ""}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {news.links && (!news.items || news.items.length === 0) ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
          {news.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">
              {l.label}
            </a>
          ))}
        </div>
      ) : null}
      {news.asOf ? <p className="text-[11px] text-slate-400">Scanned {fmtAsOf(news.asOf)}</p> : null}
    </div>
  );
}

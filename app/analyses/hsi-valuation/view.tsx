import type { AnalysisResult } from "@/lib/analysis-types";
import { RankedTable, type Column } from "@/lib/ui/RankedTable";
import { MetricCard } from "@/lib/ui/MetricCard";
import { FlagBadge, DivergenceNote } from "@/lib/ui/DivergenceFlag";
import { fmtNum, fmtMarketCap, fmtAsOf } from "@/lib/format";
import type {
  HsiValuationData,
  ScoredConstituent,
} from "./fetcher";

function valueColumns(
  inBothTickers: Set<string>
): Column<ScoredConstituent>[] {
  return [
    {
      key: "ticker",
      header: "Ticker",
      width: "w-24",
      render: (r) => <span className="font-mono text-[12px] text-slate-500">{r.ticker}</span>,
    },
    {
      key: "name",
      header: "Name",
      render: (r) => (
        <span className="font-medium text-slate-900">
          {r.name}
          {inBothTickers.has(r.ticker) ? (
            <FlagBadge variant="info">in both</FlagBadge>
          ) : null}
        </span>
      ),
    },
    {
      key: "tpe",
      header: "Trail P/E",
      align: "right",
      width: "w-20",
      render: (r) => fmtNum(r.trailingPE),
    },
    {
      key: "fpe",
      header: "Fwd P/E",
      align: "right",
      width: "w-20",
      render: (r) => fmtNum(r.forwardPE),
    },
    {
      key: "peg",
      header: "PEG",
      align: "right",
      width: "w-16",
      render: (r) => fmtNum(r.peg),
    },
    {
      key: "mcap",
      header: "Mkt Cap",
      align: "right",
      width: "w-24",
      render: (r) => <span className="text-slate-500">{fmtMarketCap(r.marketCap)}</span>,
    },
  ];
}

function Table({
  title,
  rows,
  inBothTickers,
  emptyMessage,
}: {
  title: string;
  rows: ScoredConstituent[];
  inBothTickers: Set<string>;
  emptyMessage?: string;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {title}
      </h2>
      <RankedTable
        columns={valueColumns(inBothTickers)}
        rows={rows}
        getRowKey={(r) => r.ticker}
        renderNote={(r) =>
          r.divergences.length ? <DivergenceNote items={r.divergences} /> : null
        }
        emptyMessage={emptyMessage}
      />
    </section>
  );
}

export function HsiValuationView({
  result,
}: {
  result: AnalysisResult<HsiValuationData>;
}) {
  const { data, source, asOf, cached } = result;
  const inBothTickers = new Set(data.inBoth.map((c) => c.ticker));

  return (
    <div>
      <header className="border-b border-slate-200 pb-4">
        <h1 className="text-xl font-medium text-slate-900">HSI Valuation Ranking</h1>
        <p className="mt-1 text-[13px] text-slate-500">
          Hang Seng constituents ranked by trailing P/E and PEG. Excludes
          loss-making or missing-data names from the rankings.
        </p>
        <p className="mt-2 text-[12px] text-slate-400">
          Source: {source} · As of {fmtAsOf(asOf)} ·{" "}
          {cached ? "Cached daily snapshot" : "Live fetch"}
        </p>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Constituents" value={data.totalCount} />
        <MetricCard label="Valid (P/E + PEG)" value={data.validCount} />
        <MetricCard label="Excluded" value={data.excludedCount} />
        <MetricCard label="In both top-10s" value={data.inBoth.length} />
      </div>

      <Table
        title="Table 1 — Top 10 by highest trailing P/E"
        rows={data.topByTrailingPE}
        inBothTickers={inBothTickers}
      />
      <Table
        title="Table 2 — Top 10 by highest PEG ratio"
        rows={data.topByPeg}
        inBothTickers={inBothTickers}
      />
      <Table
        title="Table 3 — Appears in both top-10 lists"
        rows={data.inBoth}
        inBothTickers={inBothTickers}
        emptyMessage="No constituent ranks in the top 10 of both metrics."
      />

      <details className="mt-8 rounded-md border border-slate-200">
        <summary className="cursor-pointer select-none px-3 py-2 text-[13px] font-medium text-slate-700">
          Excluded constituents ({data.excludedCount}) — negative or null
          trailing P/E or PEG
        </summary>
        <div className="border-t border-slate-200 px-3 py-2">
          {data.excluded.length === 0 ? (
            <p className="text-[13px] text-slate-500">None.</p>
          ) : (
            <table className="w-full border-collapse text-[12px]">
              <tbody>
                {data.excluded.map((e) => (
                  <tr key={e.ticker} className="border-b border-slate-100 last:border-0">
                    <td className="py-1.5 pr-3 font-mono text-slate-500">{e.ticker}</td>
                    <td className="py-1.5 pr-3 text-slate-700">{e.name}</td>
                    <td className="py-1.5 text-slate-500">{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </details>
    </div>
  );
}

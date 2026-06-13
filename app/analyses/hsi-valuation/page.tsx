import type { HsiValuationData } from "./fetcher";
import { HsiValuationView } from "./view";
import { ErrorPanel } from "@/lib/ui/ErrorPanel";
import { loadAnalysis } from "@/lib/load-analysis";

// Reads the daily snapshot (cached). The expensive fetch + analyze runs once a
// day in the cron job, not on the request path.
export const dynamic = "force-dynamic";

export default async function HsiValuationPage() {
  try {
    const result = await loadAnalysis<HsiValuationData>("hsi-valuation");
    return <HsiValuationView result={result} />;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return (
      <div>
        <h1 className="text-xl font-medium text-slate-900">HSI Valuation Ranking</h1>
        <div className="mt-4">
          <ErrorPanel message={message} />
        </div>
      </div>
    );
  }
}

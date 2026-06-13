import type { CreRiskData } from "./fetcher";
import { CreRiskView } from "./view";
import { ErrorPanel } from "@/lib/ui/ErrorPanel";
import { loadAnalysis } from "@/lib/load-analysis";
import { loadCreNews } from "@/lib/cre-news";

// Reads the daily snapshot (cached). The live HKMA fetch and the developer-news
// scan both run once a day in the cron job, not on the request path.
export const dynamic = "force-dynamic";

export default async function HkCreRiskPage() {
  try {
    const [result, news] = await Promise.all([
      loadAnalysis<CreRiskData>("hk-cre-risk"),
      loadCreNews(),
    ]);
    return <CreRiskView result={result} initialNews={news} />;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return (
      <div>
        <h1 className="text-xl font-medium text-slate-900">HK CRE Risk Monitor</h1>
        <div className="mt-4">
          <ErrorPanel message={message} />
        </div>
      </div>
    );
  }
}

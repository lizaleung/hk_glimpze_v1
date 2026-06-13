import { redirect } from "next/navigation";
import { defaultAnalysisSlug } from "@/lib/registry";

export default function Home() {
  if (defaultAnalysisSlug) {
    redirect(`/analyses/${defaultAnalysisSlug}`);
  }
  return (
    <div className="text-sm text-slate-500">
      No analyses registered yet. Add one in lib/registry.ts.
    </div>
  );
}

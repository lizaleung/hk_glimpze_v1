import type { AnalysisResult } from "./analysis-types";
import { getHsiValuation } from "@/app/analyses/hsi-valuation/fetcher";
import { getCreRisk } from "@/app/analyses/hk-cre-risk/fetcher";

/**
 * Runtime wiring: maps each analysis slug to its LIVE fetcher (the expensive
 * fetch + analyze path). The cron job iterates this to refresh snapshots; the
 * loader uses it as a cold-start fallback.
 *
 * This is the one module that imports analysis internals — lib/registry.ts
 * stays pure metadata. Adding an analysis = one line here + one in registry.ts.
 */
export const liveFetchers: Record<string, () => Promise<AnalysisResult<unknown>>> = {
  "hsi-valuation": getHsiValuation,
  "hk-cre-risk": getCreRisk,
};

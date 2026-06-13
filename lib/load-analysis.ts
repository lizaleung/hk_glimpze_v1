import { unstable_cache } from "next/cache";
import type { AnalysisResult } from "./analysis-types";
import { readSnapshot } from "./snapshot";
import { liveFetchers } from "./analyses-runtime";

/** Cache tag for an analysis — the cron job busts this after writing. */
export const analysisTag = (slug: string) => `analysis:${slug}`;

async function readOrLive<T>(slug: string): Promise<AnalysisResult<T>> {
  const snap = await readSnapshot<T>(slug);
  if (snap?.result) return snap.result;

  // Cold start: no snapshot written yet (e.g. before the first cron run).
  // Fall back to a live fetch so the page still works; cached stays false.
  const live = liveFetchers[slug];
  if (!live) throw new Error(`No live fetcher registered for "${slug}"`);
  return (await live()) as AnalysisResult<T>;
}

/**
 * Page-facing loader. Reads the daily snapshot, wrapped in unstable_cache so
 * 1000 concurrent visitors share a single read (one read per revalidate window
 * / until the cron busts the tag) instead of each hitting Blob.
 *
 * The expensive fetch + analyze never runs on the request path — it runs once
 * a day in the cron job. This is the whole point of the daily-cache model.
 */
export function loadAnalysis<T>(slug: string): Promise<AnalysisResult<T>> {
  const cached = unstable_cache(() => readOrLive<T>(slug), [`analysis:${slug}`], {
    revalidate: 3600, // re-read Blob at most hourly even absent a cron bust
    tags: [analysisTag(slug)],
  });
  return cached();
}

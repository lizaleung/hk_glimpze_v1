import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { refreshCreNews, NEWS_TAG } from "@/lib/cre-news";

/**
 * On-demand developer-news re-scan endpoint (the "Re-scan" button).
 *
 * The scan logic and its daily-snapshot caching live in lib/cre-news.ts — the
 * expensive Claude + web_search call normally runs once a day in the cron job
 * (app/api/cron/refresh), and pages read the cached snapshot via loadCreNews().
 * This route exists only for an explicit, user-triggered live refresh: it runs
 * the scan, overwrites the snapshot, and busts the cache so the next render
 * serves the fresh result.
 */

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST() {
  const result = await refreshCreNews();
  revalidateTag(NEWS_TAG);
  return NextResponse.json(result);
}

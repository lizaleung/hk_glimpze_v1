import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { liveFetchers } from "@/lib/analyses-runtime";
import { writeSnapshot } from "@/lib/snapshot";
import { analysisTag } from "@/lib/load-analysis";

/**
 * Daily refresh job. Runs every analysis's LIVE fetcher (fetch + analyze),
 * writes the result as a snapshot, and busts the cache so the next page load
 * serves fresh data immediately. Triggered by Vercel Cron (see vercel.json).
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET
 * is set. Locally (no CRON_SECRET) it's open so you can curl it to seed snapshots.
 */

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const results: Record<string, string> = {};
  for (const [slug, fetchLive] of Object.entries(liveFetchers)) {
    try {
      const result = await fetchLive();
      await writeSnapshot(slug, result);
      revalidateTag(analysisTag(slug));
      revalidatePath(`/analyses/${slug}`);
      results[slug] = `ok (asOf ${result.asOf})`;
    } catch (err) {
      results[slug] = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return NextResponse.json({ refreshedAt: new Date().toISOString(), results });
}

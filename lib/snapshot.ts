import type { AnalysisResult } from "./analysis-types";

/**
 * Daily-snapshot persistence for analyses.
 *
 * Production: Vercel Blob (set automatically when a Blob store is linked —
 *   BLOB_READ_WRITE_TOKEN). Stores one JSON object per analysis at a stable path.
 * Local dev: filesystem fallback under .snapshots/ so `npm run dev` exercises the
 *   exact same cached path without needing a Blob token.
 *
 * The cron route (app/api/cron/refresh) writes snapshots; pages read them via
 * lib/load-analysis.ts. This is the persistence layer the architecture's
 * AnalysisResult.cached seam was built for.
 */

const PREFIX = "snapshots/";
const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

export interface Snapshot<T> {
  result: AnalysisResult<T>;
  /** When the cron job wrote this snapshot (distinct from the data's asOf). */
  refreshedAt: string;
}

function blobPath(slug: string): string {
  return `${PREFIX}${slug}.json`;
}

/* ------------------------------------------------------------------ */
/* Payload-agnostic storage core (Blob in prod, filesystem in dev)     */
/* ------------------------------------------------------------------ */

/** Persist an arbitrary JSON-serializable value under a stable slug. */
export async function writeJson(slug: string, value: unknown): Promise<void> {
  const body = JSON.stringify(value);

  if (useBlob) {
    const { put } = await import("@vercel/blob");
    // @vercel/blob 0.27: addRandomSuffix:false gives a stable path; overwrite
    // is the default (the opt-in allowOverwrite flag arrived in v1.x).
    await put(blobPath(slug), body, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
    });
    return;
  }

  // Local filesystem fallback.
  const { promises: fs } = await import("fs");
  const path = await import("path");
  const dir = path.join(process.cwd(), ".snapshots");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${slug}.json`), body, "utf-8");
}

/** Read a value previously stored by writeJson. null on miss or any error. */
export async function readJson<T>(slug: string): Promise<T | null> {
  try {
    if (useBlob) {
      const { list } = await import("@vercel/blob");
      const { blobs } = await list({ prefix: blobPath(slug) });
      const match = blobs.find((b) => b.pathname === blobPath(slug));
      if (!match) return null;
      const res = await fetch(match.url, { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()) as T;
    }

    const { promises: fs } = await import("fs");
    const path = await import("path");
    const file = path.join(process.cwd(), ".snapshots", `${slug}.json`);
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    // Missing snapshot or read error → caller falls back to a live fetch.
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Analysis snapshots (the AnalysisResult envelope), built on the core */
/* ------------------------------------------------------------------ */

export async function writeSnapshot<T>(
  slug: string,
  result: AnalysisResult<T>
): Promise<void> {
  const snapshot: Snapshot<T> = {
    result: { ...result, cached: true },
    refreshedAt: new Date().toISOString(),
  };
  return writeJson(slug, snapshot);
}

export function readSnapshot<T>(slug: string): Promise<Snapshot<T> | null> {
  return readJson<Snapshot<T>>(slug);
}

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { unstable_cache } from "next/cache";
import { readJson, writeJson } from "@/lib/snapshot";

/**
 * HK / mainland property-developer credit news.
 *
 * The scan is an expensive call — Claude (opus) with the server-side web_search
 * tool, up to ~5 searches, up to 60s. It must NOT run on the request path. The
 * cron job (app/api/cron/refresh) runs it once a day via scanCreNews() and
 * stores the result as a snapshot; pages read the snapshot via loadCreNews().
 *
 * The "Re-scan" button on the page can still trigger a live scan on demand
 * (app/api/cre-news), which also refreshes the snapshot.
 *
 * Degrades gracefully: with no ANTHROPIC_API_KEY, returns curated topic-page
 * links so the panel is still useful.
 */

export const NEWS_SNAPSHOT_SLUG = "hk-cre-news";
/** Cache tag the cron job busts after writing a fresh news snapshot. */
export const NEWS_TAG = "cre-news";

const MODEL = "claude-opus-4-8";
const WEB_SEARCH_TOOL = process.env.CRE_NEWS_SEARCH_TOOL ?? "web_search_20250305";

const TOPIC_LINKS = [
  { label: "SCMP — Hong Kong property", url: "https://www.scmp.com/topics/hong-kong-property" },
  { label: "SCMP — China property", url: "https://www.scmp.com/topics/china-property" },
  { label: "SCMP — property developers", url: "https://www.scmp.com/topics/property-developers" },
];

export interface NewsItem {
  date: string;
  title: string;
  url: string;
  source?: string;
}

export interface NewsResult {
  /** False when no ANTHROPIC_API_KEY is configured (links-only fallback). */
  enabled: boolean;
  items: NewsItem[];
  links: { label: string; url: string }[];
  /** When this scan ran (ISO-8601). */
  asOf: string;
  source?: string;
  /** Set on graceful degradation (e.g. missing key). */
  message?: string;
  /** Set when a scan was attempted but failed. */
  error?: string;
}

const PROMPT = `Search for recent news (last ~60 days) about Hong Kong and mainland Chinese property developers with Hong Kong exposure — focus on credit events: defaults, debt restructurings, bond repayments/extensions, refinancing deals, rating actions, and major commercial-real-estate write-downs.

Prioritise major names: New World Development, Sun Hung Kai, Henderson Land, Swire Properties, Sunac, Country Garden, Shimao, CIFI, Vanke, Longfor, Link REIT.

Return ONLY a JSON array (no prose, no markdown fences) of up to 8 items, newest first, each:
{"date": "YYYY-MM-DD", "title": "...", "url": "https://...", "source": "publication name"}

If you cannot find a precise date, use the article's published month as YYYY-MM-01. Output the JSON array and nothing else.`;

function parseNewsJson(text: string): NewsItem[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON array found in model output");
  }
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error("Parsed value is not an array");
  return parsed
    .filter((i) => i && typeof i.title === "string" && typeof i.url === "string")
    .map((i) => ({
      date: typeof i.date === "string" ? i.date : "",
      title: i.title,
      url: i.url,
      source: typeof i.source === "string" ? i.source : undefined,
    }));
}

/**
 * Run the live news scan. Expensive — call this from the cron job or an
 * explicit user-triggered re-scan, never on a normal page render.
 */
export async function scanCreNews(): Promise<NewsResult> {
  const asOf = new Date().toISOString();

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      enabled: false,
      items: [],
      links: TOPIC_LINKS,
      asOf,
      message:
        "Set ANTHROPIC_API_KEY to enable AI news summarization. Topic pages linked below.",
    };
  }

  try {
    const client = new Anthropic();
    const tools = [{ type: WEB_SEARCH_TOOL, name: "web_search", max_uses: 5 }];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response: any = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      tools: tools as never,
      messages: [{ role: "user", content: PROMPT }],
    });

    // Server-side tool loop: re-send on pause_turn until the model finishes.
    let guard = 0;
    while (response.stop_reason === "pause_turn" && guard < 5) {
      guard += 1;
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        tools: tools as never,
        messages: [
          { role: "user", content: PROMPT },
          { role: "assistant", content: response.content },
        ],
      });
    }

    const text = response.content
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((b: any) => b.type === "text")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any) => b.text)
      .join("\n");

    return {
      enabled: true,
      items: parseNewsJson(text),
      links: TOPIC_LINKS,
      asOf,
      source: "Claude web search",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      enabled: true,
      items: [],
      links: TOPIC_LINKS,
      asOf,
      error: `News scan failed: ${message}`,
    };
  }
}

/** Run a live scan and persist it as the daily snapshot. Used by cron + re-scan. */
export async function refreshCreNews(): Promise<NewsResult> {
  const result = await scanCreNews();
  await writeJson(NEWS_SNAPSHOT_SLUG, result);
  return result;
}

/** Empty placeholder shown before the first scan has ever run. */
function emptyNews(): NewsResult {
  return {
    enabled: !!process.env.ANTHROPIC_API_KEY,
    items: [],
    links: TOPIC_LINKS,
    asOf: "",
    message: "No news snapshot yet — runs daily, or use Re-scan to fetch now.",
  };
}

/**
 * Page-facing loader. Reads the daily news snapshot, wrapped in unstable_cache
 * so concurrent visitors share one Blob read until the cron busts NEWS_TAG.
 * Never triggers a live scan.
 */
export function loadCreNews(): Promise<NewsResult> {
  const cached = unstable_cache(
    async () => (await readJson<NewsResult>(NEWS_SNAPSHOT_SLUG)) ?? emptyNews(),
    [`news:${NEWS_SNAPSHOT_SLUG}`],
    { revalidate: 3600, tags: [NEWS_TAG] }
  );
  return cached();
}

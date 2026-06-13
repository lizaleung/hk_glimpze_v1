import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

/**
 * Developer-news re-scan endpoint.
 *
 * Uses Claude (claude-opus-4-8) with the server-side web_search tool to find
 * recent Hong Kong / mainland property-developer news (defaults, restructurings,
 * bond/refinancing events) and extract {date, title, url, source} tuples.
 *
 * We use web_search rather than fetching SCMP topic-page HTML directly: SCMP is
 * paywalled and blocks server-side scrapes, whereas web_search returns sourced,
 * cited results reliably. Behind an LLM summarizer either way.
 *
 * Degrades gracefully: with no ANTHROPIC_API_KEY, returns curated topic-page
 * links so the panel is still useful.
 */

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MODEL = "claude-opus-4-8";
const WEB_SEARCH_TOOL = process.env.CRE_NEWS_SEARCH_TOOL ?? "web_search_20250305";

const TOPIC_LINKS = [
  { label: "SCMP — Hong Kong property", url: "https://www.scmp.com/topics/hong-kong-property" },
  { label: "SCMP — China property", url: "https://www.scmp.com/topics/china-property" },
  { label: "SCMP — property developers", url: "https://www.scmp.com/topics/property-developers" },
];

interface NewsItem {
  date: string;
  title: string;
  url: string;
  source?: string;
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

export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      enabled: false,
      items: [],
      links: TOPIC_LINKS,
      asOf: new Date().toISOString(),
      message:
        "Set ANTHROPIC_API_KEY to enable AI news summarization. Topic pages linked below.",
    });
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

    const items = parseNewsJson(text);
    return NextResponse.json({
      enabled: true,
      items,
      links: TOPIC_LINKS,
      asOf: new Date().toISOString(),
      source: "Claude web search",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        enabled: true,
        items: [],
        links: TOPIC_LINKS,
        asOf: new Date().toISOString(),
        error: `News scan failed: ${message}`,
      },
      { status: 200 }
    );
  }
}

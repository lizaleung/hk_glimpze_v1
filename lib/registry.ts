import type { AnalysisMeta } from "./analysis-types";

/**
 * The analysis registry — the ONLY file you edit to surface a new analysis.
 *
 * To add an analysis:
 *   1. Create app/analyses/<slug>/{fetcher.ts,view.tsx,page.tsx}.
 *   2. Add one entry below with the matching slug.
 * The sidebar, routing index, and home redirect all read from here.
 */
export const analyses: AnalysisMeta[] = [
  {
    slug: "hsi-valuation",
    title: "HSI Valuation Ranking",
    description: "Hang Seng constituents ranked by trailing P/E and PEG.",
    tags: ["equities", "HK"],
  },
  {
    slug: "hk-cre-risk",
    title: "HK CRE Risk Monitor",
    description: "Classified loans, office prices, and developer credit watch.",
    tags: ["credit", "HK"],
  },
];

export function getAnalysis(slug: string): AnalysisMeta | undefined {
  return analyses.find((a) => a.slug === slug);
}

/** Slug of the analysis the home page redirects to. */
export const defaultAnalysisSlug = analyses[0]?.slug;

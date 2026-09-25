import { requestPermission } from "../lib/permissions.js";
import type { ToolDefinition } from "./types.js";

const MAX_RESULTS = 5;

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, "")).trim();
}

/** DuckDuckGo's html.duckduckgo.com endpoint wraps result links as a redirect
 *  (`//duckduckgo.com/l/?uddg=<encoded-target>&...`) rather than the real URL. */
function resolveResultUrl(href: string): string {
  try {
    const url = new URL(href.startsWith("//") ? `https:${href}` : href);
    const target = url.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : url.toString();
  } catch {
    return href;
  }
}

/**
 * Pure-function parser for DuckDuckGo's no-JS HTML results page, kept
 * separate from the tool so it can be tested against fixture HTML without a
 * real network call.
 */
export function parseDuckDuckGoResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const resultRegex =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let match: RegExpExecArray | null;
  while ((match = resultRegex.exec(html)) !== null) {
    const [, rawUrl, rawTitle, rawSnippet] = match;
    const title = stripTags(rawTitle);
    if (!title) continue;
    results.push({ url: resolveResultUrl(rawUrl), title, snippet: stripTags(rawSnippet) });
  }
  return results;
}

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return "(no results)";
  return results
    .slice(0, MAX_RESULTS)
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
    .join("\n\n");
}

export const webSearchTool: ToolDefinition = {
  name: "web_search",
  description:
    "Search the web for up-to-date information (library docs, current versions, error messages, general knowledge) " +
    "not available in this project or your own training data. Returns a short list of results: title, URL, snippet.",
  parameters: {
    type: "object",
    properties: { query: { type: "string", description: "Search query" } },
    required: ["query"],
  },
  async execute(args) {
    const query = String(args.query);
    await requestPermission({ category: "network", description: `Web search: "${query}"` });

    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    let html: string;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; DevBuddy/1.0; +https://github.com)" },
      });
      if (!res.ok) return `web search failed: HTTP ${res.status}`;
      html = await res.text();
    } catch (err) {
      return `web search failed: ${(err as Error).message}`;
    }

    return formatSearchResults(parseDuckDuckGoResults(html));
  },
};

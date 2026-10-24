// Live web search for the research steps, used when the AI's own search isn't
// available on the current plan. Prospects and decision makers are then picked
// only from real search results, never from the model's memory.
//
// Provider: Tavily (TAVILY_API_KEY, starts with "tvly-"). The free plan gives
// 1,000 searches a month, no card needed: https://app.tavily.com

export interface Hit {
  title: string;
  url: string;
  content: string;
}

export function webSearchOn() {
  return /^tvly-[\w-]{10,}$/.test(process.env.TAVILY_API_KEY ?? "");
}

const regionName = new Intl.DisplayNames(["en"], { type: "region" });

/** One search. Returns [] on any failure, so a step degrades instead of failing. */
export async function webSearch(query: string, opts: { max?: number; country?: string } = {}): Promise<Hit[]> {
  if (!webSearchOn()) return [];
  const body: Record<string, unknown> = { query: query.slice(0, 380), search_depth: "basic", max_results: Math.min(opts.max ?? 10, 20), chunks_per_source: 3 };
  // Tavily takes lowercase English country names ("united kingdom"); ISO codes come from the market picker.
  if (opts.country && /^[A-Z]{2}$/.test(opts.country)) body.country = (regionName.of(opts.country) ?? "").toLowerCase();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.TAVILY_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      // An unsupported country name: search again without it.
      if (res.status === 400 && body.country) {
        delete body.country;
        continue;
      }
      if (!res.ok) {
        console.info(`[websearch] ${res.status} for "${query}"`);
        return [];
      }
      const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
      return (data.results ?? [])
        .filter((r) => typeof r.url === "string" && /^https?:\/\//.test(r.url))
        .map((r) => ({ title: String(r.title ?? "").slice(0, 200), url: r.url!, content: String(r.content ?? "").slice(0, 1500) }));
    } catch (e) {
      console.info(`[websearch] failed for "${query}":`, (e as Error).message);
      return [];
    }
  }
  return [];
}

/** Several searches in parallel, merged and de-duplicated by URL. */
export async function webSearchAll(queries: string[], opts: { max?: number; country?: string } = {}): Promise<Hit[]> {
  const lists = await Promise.all(queries.map((q) => webSearch(q, opts)));
  const seen = new Set<string>();
  const out: Hit[] = [];
  for (const h of lists.flat()) {
    const key = h.url.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

export function formatHits(hits: Hit[]) {
  return hits.map((h, i) => `[${i + 1}] ${h.title}\nURL: ${h.url}\n${h.content}`).join("\n\n");
}

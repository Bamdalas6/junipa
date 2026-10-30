import { db } from "./db";

// Numbers for the admin dashboard, read from page_views, site_events and the account tables.

export const RANGES = { "24h": { buckets: 24, hourly: true }, "7d": { buckets: 7, hourly: false }, "30d": { buckets: 30, hourly: false }, "90d": { buckets: 90, hourly: false } } as const;
export type Range = keyof typeof RANGES;
export const isRange = (r: unknown): r is Range => typeof r === "string" && r in RANGES;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface Row {
  key: string;
  visitors: number;
  views?: number;
  avgMs?: number | null;
}

export interface SiteStats {
  range: Range;
  start: number;
  bucketMs: number;
  totals: { visitors: number; views: number; avgMs: number | null; searches: number; searchers: number; signups: number };
  previous: { visitors: number; views: number; avgMs: number | null; searches: number; searchers: number; signups: number };
  series: { at: number; visitors: number; views: number; searches: number }[];
  pages: Row[];
  brands: { key: string; searches: number; visitors: number; demo: boolean }[];
  steps: { key: string; searches: number }[];
  referrers: Row[];
  campaigns: Row[];
  countries: Row[];
  devices: Row[];
  browsers: Row[];
  systems: Row[];
  funnel: { visitors: number; searched: number; signedUp: number; checkouts: number; subscribers: number };
  liveNow: number;
  recent: { at: number; path: string; country: string | null; device: string | null; browser: string | null; referrer: string | null; durationMs: number | null; signedIn: boolean }[];
  allTime: { users: number; views: number };
}

/** Group a page's address the way you think of it: every brand's workspace is one page. */
export function pageKey(path: string) {
  if (/^\/w\/[^/]+\/pipeline\/?$/.test(path)) return "/w/[brand]/pipeline";
  if (/^\/w\/[^/]+\/?$/.test(path)) return "/w/[brand]";
  if (/^\/pay\/return\//.test(path)) return "/pay/return";
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/**
 * `tz` is the viewer's offset from UTC in minutes (e.g. 60 for Lagos), so days start at
 * their midnight. Hours are whole hours, the last one being the current hour.
 */
export async function siteStats(range: Range, tz: number): Promise<SiteStats> {
  const now = Date.now();
  const { buckets, hourly } = RANGES[range];
  const bucketMs = hourly ? HOUR : DAY;
  const offset = tz * 60_000;
  const current = hourly ? Math.floor(now / HOUR) * HOUR : Math.floor((now + offset) / DAY) * DAY - offset;
  const start = current - (buckets - 1) * bucketMs;
  const prevStart = start - buckets * bucketMs;
  const database = await db();

  const q = <T>(sql: string, ...args: unknown[]) =>
    database
      .prepare(sql)
      .bind(...args)
      .all<T>()
      .then((r) => r.results);
  const one = <T>(sql: string, ...args: unknown[]) =>
    database
      .prepare(sql)
      .bind(...args)
      .first<T>();

  type Totals = { visitors: number; views: number; avgMs: number | null };
  type Searches = { searches: number; searchers: number };
  const totalsBetween = async (from: number, to: number) => {
    const [v, s, u] = await Promise.all([
      one<Totals>("SELECT COUNT(DISTINCT visitor) AS visitors, COUNT(*) AS views, AVG(duration_ms) AS avgMs FROM page_views WHERE at >= ? AND at < ?", from, to),
      one<Searches>("SELECT COUNT(*) AS searches, COUNT(DISTINCT visitor) AS searchers FROM site_events WHERE name = 'search' AND at >= ? AND at < ?", from, to),
      one<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE created_at >= ? AND created_at < ?", from, to),
    ]);
    return {
      visitors: v?.visitors ?? 0,
      views: v?.views ?? 0,
      avgMs: v?.avgMs == null ? null : Math.round(v.avgMs),
      searches: s?.searches ?? 0,
      searchers: s?.searchers ?? 0,
      signups: u?.n ?? 0,
    };
  };

  // `column` is only ever one of the fixed names below, never anything from a request.
  const top = (column: "referrer" | "country" | "device" | "browser" | "os", limit = 10) =>
    q<Row>(
      `SELECT COALESCE(${column}, '') AS key, COUNT(DISTINCT visitor) AS visitors, COUNT(*) AS views FROM page_views WHERE at >= ? GROUP BY key ORDER BY visitors DESC, views DESC LIMIT ?`,
      start,
      limit,
    );

  const [totals, previous, viewSeries, searchSeries, rawPages, brands, steps, referrers, campaigns, countries, devices, browsers, systems, checkouts, subscribers, live, recent, allUsers, allViews] =
    await Promise.all([
      totalsBetween(start, now + 1),
      totalsBetween(prevStart, start),
      q<{ b: number; visitors: number; views: number }>(
        "SELECT CAST((at - ?) / ? AS INTEGER) AS b, COUNT(DISTINCT visitor) AS visitors, COUNT(*) AS views FROM page_views WHERE at >= ? GROUP BY b",
        start,
        bucketMs,
        start,
      ),
      q<{ b: number; n: number }>("SELECT CAST((at - ?) / ? AS INTEGER) AS b, COUNT(*) AS n FROM site_events WHERE name = 'search' AND at >= ? GROUP BY b", start, bucketMs, start),
      q<{ path: string; visitors: number; views: number; ms: number | null; timed: number }>(
        "SELECT path, COUNT(DISTINCT visitor) AS visitors, COUNT(*) AS views, SUM(duration_ms) AS ms, COUNT(duration_ms) AS timed FROM page_views WHERE at >= ? GROUP BY path ORDER BY views DESC LIMIT 300",
        start,
      ),
      q<{ key: string; searches: number; visitors: number }>(
        "SELECT target AS key, COUNT(*) AS searches, COUNT(DISTINCT visitor) AS visitors FROM site_events WHERE name = 'search' AND at >= ? AND target IS NOT NULL GROUP BY target ORDER BY searches DESC LIMIT 12",
        start,
      ),
      q<{ key: string; searches: number }>("SELECT label AS key, COUNT(*) AS searches FROM site_events WHERE name = 'search' AND at >= ? GROUP BY label ORDER BY searches DESC", start),
      top("referrer"),
      q<Row>(
        "SELECT utm_source || COALESCE(' / ' || utm_medium, '') || COALESCE(' / ' || utm_campaign, '') AS key, COUNT(DISTINCT visitor) AS visitors, COUNT(*) AS views FROM page_views WHERE at >= ? AND utm_source IS NOT NULL GROUP BY key ORDER BY visitors DESC LIMIT 10",
        start,
      ),
      top("country", 12),
      top("device", 5),
      top("browser", 8),
      top("os", 8),
      one<{ n: number }>("SELECT COUNT(*) AS n FROM billing_checkouts WHERE created_at >= ?", start),
      one<{ n: number }>("SELECT COUNT(*) AS n FROM subscriptions WHERE created_at >= ? AND status IN ('active', 'trialing', 'past_due')", start),
      one<{ n: number }>("SELECT COUNT(DISTINCT visitor) AS n FROM page_views WHERE at >= ?", now - 5 * 60_000),
      q<{ at: number; path: string; country: string | null; device: string | null; browser: string | null; referrer: string | null; duration_ms: number | null; signed_in: number }>(
        "SELECT at, path, country, device, browser, referrer, duration_ms, signed_in FROM page_views ORDER BY at DESC LIMIT 40",
      ),
      one<{ n: number }>("SELECT COUNT(*) AS n FROM users"),
      one<{ n: number }>("SELECT COUNT(*) AS n FROM page_views"),
    ]);

  // Fill every bucket, including empty ones, so the chart's time axis is even.
  const series = Array.from({ length: buckets }, (_, i) => ({ at: start + i * bucketMs, visitors: 0, views: 0, searches: 0 }));
  for (const r of viewSeries) if (series[r.b]) Object.assign(series[r.b], { visitors: r.visitors, views: r.views });
  for (const r of searchSeries) if (series[r.b]) series[r.b].searches = r.n;

  // Workspace pages for different brands are one page; distinct visitors can't be summed
  // across paths, so a grouped page shows the larger of its parts (a lower bound).
  const grouped = new Map<string, { visitors: number; views: number; ms: number; timed: number }>();
  for (const p of rawPages) {
    const key = pageKey(p.path);
    const g = grouped.get(key) ?? { visitors: 0, views: 0, ms: 0, timed: 0 };
    g.visitors = Math.max(g.visitors, p.visitors);
    g.views += p.views;
    g.ms += p.ms ?? 0;
    g.timed += p.timed;
    grouped.set(key, g);
  }
  const pages = [...grouped.entries()]
    .map(([key, g]) => ({ key, visitors: g.visitors, views: g.views, avgMs: g.timed ? Math.round(g.ms / g.timed) : null }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 12);

  return {
    range,
    start,
    bucketMs,
    totals,
    previous,
    series,
    pages,
    brands: brands.map((b) => ({ ...b, demo: /\.example$/.test(b.key) })),
    steps,
    referrers,
    campaigns,
    countries,
    devices,
    browsers,
    systems,
    funnel: { visitors: totals.visitors, searched: totals.searchers, signedUp: totals.signups, checkouts: checkouts?.n ?? 0, subscribers: subscribers?.n ?? 0 },
    liveNow: live?.n ?? 0,
    recent: recent.map((r) => ({ at: r.at, path: r.path, country: r.country, device: r.device, browser: r.browser, referrer: r.referrer, durationMs: r.duration_ms, signedIn: !!r.signed_in })),
    allTime: { users: allUsers?.n ?? 0, views: allViews?.n ?? 0 },
  };
}

import { randomId, sha256, type User } from "./auth";
import { db } from "./db";
import { clientIp } from "./guard";

// First-party visit stats for the admin dashboard. No cookies, and no IP addresses are
// stored: each visitor is a hash of (address, browser, today's secret salt), so the same
// person counts once a day but can't be followed from one day to the next.

/* ---------- Who may see the dashboard ---------- */

/**
 * Admins are the emails in ADMIN_EMAILS (comma-separated), and only when signed in with
 * Google: Google has verified they own the email, so nobody can claim an admin address
 * by registering it with a password first.
 */
export function isAdmin(user: User | null) {
  if (!user?.google) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return admins.includes(user.email.toLowerCase());
}

/* ---------- Reading a visit ---------- */

const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|httpclient|axios|node-fetch|undici|go-http|java\/|okhttp|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|vercel|cloudflare/i;
export const isBot = (ua: string) => !ua || ua.length < 20 || BOT.test(ua);

export function parseAgent(ua: string) {
  const device = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua) ? "Tablet" : /Mobi|iPhone|iPod|Android/i.test(ua) ? "Mobile" : "Desktop";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS/.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Other";
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /CrOS/.test(ua)
          ? "ChromeOS"
          : /Mac OS X|Macintosh/.test(ua)
            ? "macOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "Other";
  return { device, browser, os };
}

/** A clean page path (no query or hash), or null if it doesn't look like one of ours. */
export function cleanPath(raw: unknown) {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null;
  const path = raw.split(/[?#]/)[0].slice(0, 200);
  return /^\/[A-Za-z0-9\-._~%/@:+]*$/.test(path) ? path : null;
}

/** Just the other site's host name (never the full address), or null for direct and internal visits. */
export function cleanReferrer(raw: unknown, ownHost: string) {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return host && host !== ownHost.replace(/^www\./, "") ? host.slice(0, 120) : null;
  } catch {
    return null;
  }
}

const short = (v: unknown, n = 80) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

/** Two-letter country from Cloudflare's header (unknown, Tor and missing become null). */
export function countryOf(request: Request) {
  const c = request.headers.get("cf-ipcountry")?.toUpperCase();
  return c && /^[A-Z]{2}$/.test(c) && c !== "XX" && c !== "T1" ? c : null;
}

const DAY = 86_400_000;

/** Today's anonymous id for this visitor (see the note at the top). */
export async function visitorId(request: Request) {
  const day = Math.floor(Date.now() / DAY);
  const secret = process.env.REACHLY_SIGNING_SECRET || "junia-dev-analytics";
  const salt = await sha256(`${secret}|visits|${day}`);
  return (await sha256(`${salt}|${clientIp(request)}|${request.headers.get("user-agent") ?? ""}`)).slice(0, 22);
}

/* ---------- Recording ---------- */

export interface ViewInput {
  path?: unknown;
  referrer?: unknown;
  utm_source?: unknown;
  utm_medium?: unknown;
  utm_campaign?: unknown;
}

/** Saves a page view and returns its id (for the time-on-page update), or null when it isn't saved. */
export async function recordView(request: Request, input: ViewInput, signedIn: boolean) {
  const path = cleanPath(input.path);
  if (!path) return null;
  const ua = request.headers.get("user-agent") ?? "";
  const { device, browser, os } = parseAgent(ua);
  const id = randomId(12);
  const now = Date.now();
  const database = await db();
  await database
    .prepare(
      "INSERT INTO page_views (id, at, visitor, path, referrer, utm_source, utm_medium, utm_campaign, country, device, browser, os, signed_in) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      now,
      await visitorId(request),
      path,
      cleanReferrer(input.referrer, new URL(request.url).hostname),
      short(input.utm_source),
      short(input.utm_medium),
      short(input.utm_campaign),
      countryOf(request),
      device,
      browser,
      os,
      signedIn ? 1 : 0,
    )
    .run();
  // Now and then, drop visits older than 13 months.
  if (Math.random() < 0.01) {
    const cutoff = now - 400 * DAY;
    await database.batch([
      database.prepare("DELETE FROM page_views WHERE at < ?").bind(cutoff),
      database.prepare("DELETE FROM site_events WHERE at < ?").bind(cutoff),
    ]);
  }
  return id;
}

/** Time on page, sent when the visitor leaves it. Only the same visitor, once, within 6 hours. */
export async function recordDuration(request: Request, id: unknown, ms: unknown) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{8,40}$/.test(id) || typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return;
  await (await db())
    .prepare("UPDATE page_views SET duration_ms = ? WHERE id = ? AND visitor = ? AND duration_ms IS NULL AND at > ?")
    .bind(Math.min(Math.round(ms), 30 * 60_000), id, await visitorId(request), Date.now() - 6 * 3_600_000)
    .run();
}

/** Counts an action (e.g. a research step started). Never throws: stats must not break the app. */
export async function recordEvent(request: Request, name: string, label?: string | null, target?: string | null) {
  try {
    if (isBot(request.headers.get("user-agent") ?? "")) return;
    await (await db())
      .prepare("INSERT INTO site_events (id, at, visitor, name, label, target, country) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(randomId(12), Date.now(), await visitorId(request), name, short(label, 60), short(target, 253), countryOf(request))
      .run();
  } catch (e) {
    console.error("[analytics] event not saved:", (e as Error).message);
  }
}

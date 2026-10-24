// Request guards shared by the API routes: body size caps, per-IP rate limits,
// input clipping and error messages that are safe to show users.

import { onWorkers } from "./public-fetch";

/** An error whose message is written for users and safe to show as-is. */
export class ScoutError extends Error {}

export function userMessage(err: unknown, fallback = "Scout hit a snag. Try running this step again.") {
  return err instanceof ScoutError ? err.message : fallback;
}

export class BadRequest extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Reads a JSON body of at most `maxBytes`. Throws BadRequest (400/413) otherwise. */
export async function readJson<T>(request: Request, maxBytes: number): Promise<T> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new BadRequest("That request is too large.", 413);
  const text = await request.text();
  if (Buffer.byteLength(text) > maxBytes) throw new BadRequest("That request is too large.", 413);
  try {
    const data = JSON.parse(text) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    return data as T;
  } catch {
    throw new BadRequest("Invalid request");
  }
}

export function badRequest(err: unknown) {
  if (err instanceof BadRequest) return Response.json({ error: err.message }, { status: err.status });
  return null;
}

/* ---------- Rate limits (in memory, per server instance) ---------- */

const buckets = new Map<string, number[]>();

/**
 * The visitor's IP for rate limits. A client can send any X-Forwarded-For, and Next only
 * fills it in when it's missing, so on its own it can't be trusted:
 * - On Vercel, x-real-ip is set by the platform and can't be forged.
 * - Behind your own proxy, the right-most entry is the one the proxy added. Set
 *   REACHLY_TRUSTED_PROXIES=N when there are N proxies in front.
 * A global cap per endpoint (below) still bounds the total even if addresses are faked.
 */
export function clientIp(request: Request) {
  // Cloudflare sets this itself and overwrites any value a visitor sends.
  if (onWorkers) return request.headers.get("cf-connecting-ip") ?? "cloudflare";
  if (process.env.VERCEL) return request.headers.get("x-real-ip") ?? "vercel";
  const hops = Math.max(1, Number(process.env.REACHLY_TRUSTED_PROXIES) || 1);
  const chain = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return chain[chain.length - hops] ?? "local";
}

function hit(key: string, limit: number, windowMs: number, now: number) {
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  const over = hits.length >= limit;
  if (!over) hits.push(now);
  buckets.set(key, hits);
  return over ? Math.ceil((windowMs - (now - hits[0])) / 1000) : 0;
}

/**
 * Returns a 429 response when this visitor made more than `limit` calls to `name` within
 * `windowMs`, or when everyone together made more than `limit * GLOBAL_FACTOR` (so faked
 * addresses can't run up the bill).
 */
export function rateLimit(request: Request, name: string, limit: number, windowMs: number): Response | null {
  const now = Date.now();
  const retry = hit(`${name}:${clientIp(request)}`, limit, windowMs, now) || hit(`${name}:*`, limit * GLOBAL_FACTOR, windowMs, now);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
  if (!retry) return null;
  return Response.json({ error: "Too many requests. Wait a little and try again." }, { status: 429, headers: { "Retry-After": String(retry) } });
}

const GLOBAL_FACTOR = Math.max(1, Number(process.env.REACHLY_GLOBAL_RATE_FACTOR) || 10);

/* ---------- Input clipping ---------- */

/** Copies plain JSON data with every string, array and nesting level capped, so client data can't bloat prompts. */
export function clipDeep<T>(value: T, opts: { str?: number; arr?: number; depth?: number } = {}): T {
  const { str = 1500, arr = 40, depth = 6 } = opts;
  const walk = (v: unknown, d: number): unknown => {
    if (typeof v === "string") return v.slice(0, str);
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    if (typeof v === "boolean" || v === null) return v;
    if (d >= depth) return undefined;
    if (Array.isArray(v)) return v.slice(0, arr).map((x) => walk(x, d + 1));
    if (typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 60)) {
        if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
        out[k] = walk(x, d + 1);
      }
      return out;
    }
    return undefined;
  };
  return walk(value, 0) as T;
}

/** The site address the visitor actually used (keeps 127.0.0.1 vs localhost, and proxies, intact). */
export function siteOrigin(request: Request) {
  if (process.env.REACHLY_PUBLIC_URL) return process.env.REACHLY_PUBLIC_URL.replace(/\/+$/, "");
  const url = new URL(request.url);
  // Forwarded headers can be forged; outside development, never build redirects from them.
  if (process.env.NODE_ENV === "production") return url.origin;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export const clip = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);

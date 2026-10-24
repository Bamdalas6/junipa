// Fetches a page from the public internet only, so research can't be pointed at
// internal addresses. Redirects are returned, not followed, so each hop is checked.
//
// On Cloudflare Workers the platform refuses private destinations itself
// (the global_fetch_strictly_public flag in wrangler.jsonc). On Node, every
// connection is pinned to an IP that was checked to be public.

export const onWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

const IP_LITERAL = /^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])$/i;
const INTERNAL_NAME = /(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/i;

export async function fetchPublic(url: URL, init: { headers: Record<string, string>; signal: AbortSignal }): Promise<Response> {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Bad protocol");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("Port not allowed");
  if (url.username || url.password) throw new Error("Credentials not allowed");
  if (IP_LITERAL.test(url.hostname)) throw new Error("IP addresses are not allowed");
  if (!url.hostname.includes(".") || INTERNAL_NAME.test(url.hostname)) throw new Error("Host is not public");
  if (onWorkers) return fetch(url, { ...init, redirect: "manual" });
  const { fetchPinned } = await import("./public-fetch-node");
  return fetchPinned(url, init);
}

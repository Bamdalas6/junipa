import { getCloudflareContext } from "@opennextjs/cloudflare";

// Cloudflare's shared rate limiters (the "ratelimits" bindings in wrangler.jsonc). The
// in-memory limits in guard.ts only count requests that reach the same server instance,
// and Cloudflare spreads traffic over many; these count across all of them in a location.
// Wherever a binding isn't available (e.g. local dev) they let the request through, and
// the in-memory limits still apply.

/** Per visitor: sign-in, sign-up, password reset and Google sign-in starts. */
export const AUTH_IP = "AUTH_IP_LIMITER";
/** Per account email: sign-in attempts and reset emails. */
export const AUTH_ACCOUNT = "AUTH_ACCOUNT_LIMITER";
/** Per visitor: research runs and growth plans, which spend AI and search credits. */
export const RUN_IP = "RUN_IP_LIMITER";

type Binding = typeof AUTH_IP | typeof AUTH_ACCOUNT | typeof RUN_IP;
interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** A 429 response when `key` is over the binding's limit, otherwise null. */
export async function sharedLimit(binding: Binding, key: string): Promise<Response | null> {
  let success = true;
  try {
    const env = (await getCloudflareContext({ async: true })).env as unknown as Partial<Record<Binding, RateLimiter>>;
    const limiter = env[binding];
    if (limiter) success = (await limiter.limit({ key })).success;
  } catch (e) {
    console.error("[ratelimit] check failed:", (e as Error).message);
  }
  if (success) return null;
  return Response.json({ error: "Too many tries. Wait a minute and try again." }, { status: 429, headers: { "Retry-After": "60" } });
}

import { getCloudflareContext } from "@opennextjs/cloudflare";

// Cloudflare's shared rate limiters (the "ratelimits" bindings in wrangler.jsonc), a soft
// layer against floods from one address. They're approximate by design: each server
// counts locally and syncs in the background, so a burst can get past the limit. Limits
// that must hold (wrong passwords per account, reset emails) are counted in the database
// instead (see auth.ts). Where a binding isn't available they let the request through.

/** Per visitor: sign-in, sign-up, password reset and Google sign-in starts. */
export const AUTH_IP = "AUTH_IP_LIMITER";
/** Per visitor: research runs and growth plans, which spend AI and search credits. */
export const RUN_IP = "RUN_IP_LIMITER";

type Binding = typeof AUTH_IP | typeof RUN_IP;
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

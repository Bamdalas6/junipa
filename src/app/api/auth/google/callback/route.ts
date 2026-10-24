import { clearCookie, createSession, readCookie, safeNext, sessionCookie, upsertGoogleUser } from "@/lib/auth";
import { OAUTH_COOKIE, googleConfigured, googleProfile } from "@/lib/google";
import { siteOrigin } from "@/lib/guard";

export const dynamic = "force-dynamic";

// Google sends the visitor back here with ?code&state. Check the state against the
// cookie set when they left, then sign them in (creating the account if it's new).
export async function GET(request: Request) {
  const origin = siteOrigin(request);
  const url = new URL(request.url);
  const [state, verifier, next] = (readCookie(request, OAUTH_COOKIE) ?? "").split("|");
  const back = (path: string, extra: string[] = []) => {
    const headers = new Headers({ Location: `${origin}${path}`, "Cache-Control": "no-store" });
    headers.append("Set-Cookie", clearCookie(request, OAUTH_COOKIE).replace("Path=/", "Path=/api/auth/google"));
    for (const c of extra) headers.append("Set-Cookie", c);
    return new Response(null, { status: 302, headers });
  };
  const failed = (why: string) => {
    console.error("[auth] Google sign-in failed:", why);
    const to = safeNext(next);
    return back(`${to}${to.includes("?") ? "&" : "?"}auth=google-failed`);
  };

  if (!googleConfigured()) return failed("not configured");
  if (url.searchParams.get("error")) return failed(`Google said ${url.searchParams.get("error")}`);
  const code = url.searchParams.get("code");
  if (!code || !state || !verifier || url.searchParams.get("state") !== state) return failed("state mismatch");

  try {
    const profile = await googleProfile(request, code, verifier);
    const userId = await upsertGoogleUser(profile);
    const token = await createSession(userId);
    return back(safeNext(next), [sessionCookie(request, token)]);
  } catch (e) {
    return failed((e as Error).message);
  }
}

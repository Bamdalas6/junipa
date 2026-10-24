import { safeNext } from "@/lib/auth";
import { OAUTH_COOKIE, googleConfigured, googleStart } from "@/lib/google";
import { rateLimit } from "@/lib/guard";

export const dynamic = "force-dynamic";

// GET ?next=/path -> sends the visitor to Google's sign-in page.
export async function GET(request: Request) {
  if (!googleConfigured()) return new Response("Google sign-in isn't set up.", { status: 404 });
  const limited = rateLimit(request, "auth-google", 30, 10 * 60_000);
  if (limited) return limited;
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  const { url, state, verifier } = await googleStart(request);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  // Lax so the cookie comes back on Google's redirect to us. Ten minutes to finish signing in.
  const cookie = `${OAUTH_COOKIE}=${encodeURIComponent(`${state}|${verifier}|${next}`)}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
  return new Response(null, { status: 302, headers: { Location: url, "Set-Cookie": cookie, "Cache-Control": "no-store" } });
}

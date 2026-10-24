import { randomId, sha256 } from "./auth";
import { siteOrigin } from "./guard";

// "Continue with Google": OAuth 2.0 authorization code flow with PKCE.
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from a Google Cloud OAuth client
// whose authorised redirect URI is {site}/api/auth/google/callback.

export const OAUTH_COOKIE = "junia_oauth";

export function googleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export const redirectUri = (request: Request) => `${siteOrigin(request)}/api/auth/google/callback`;

/** The Google sign-in URL, plus the one-time values to keep in a cookie until Google sends the user back. */
export async function googleStart(request: Request) {
  const state = randomId(16);
  const verifier = randomId(32);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: await sha256(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, state, verifier };
}

/** Swaps the code Google returned for the person's verified Google profile. */
export async function googleProfile(request: Request, code: string, verifier: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(request),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  const { access_token } = (await res.json()) as { access_token?: string };
  if (!access_token) throw new Error("Google sent no access token");
  const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(10_000) });
  if (!info.ok) throw new Error(`Google profile request failed (${info.status})`);
  const p = (await info.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
  if (!p.sub || !p.email || p.email_verified !== true) throw new Error("Google account has no verified email");
  return { sub: p.sub, email: p.email, name: p.name, picture: p.picture?.startsWith("https://") ? p.picture : undefined };
}

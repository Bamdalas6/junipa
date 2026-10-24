import { createSession, findUserByEmail, fromThisSite, normalEmail, sessionCookie, verifyPassword } from "@/lib/auth";
import { badRequest, rateLimit, rateLimitKey, readJson } from "@/lib/guard";

export const dynamic = "force-dynamic";

// POST { email, password } -> signs in. The same error for a wrong email or password.
export async function POST(request: Request) {
  if (!fromThisSite(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const limited = rateLimit(request, "auth-signin", 20, 15 * 60_000);
  if (limited) return limited;
  let body: { email?: unknown; password?: unknown };
  try {
    body = await readJson(request, 4_000);
  } catch (err) {
    return badRequest(err)!;
  }
  const email = typeof body.email === "string" ? normalEmail(body.email).slice(0, 320) : "";
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  // Also limit tries per account, wherever they come from.
  const perAccount = rateLimitKey("auth-signin-acct", email, 10, 15 * 60_000);
  if (perAccount) return perAccount;

  const user = email ? await findUserByEmail(email) : null;
  const ok = await verifyPassword(password, user?.password_hash ?? null);
  if (!user || !ok) {
    const googleOnly = user && !user.password_hash && user.google_sub;
    return Response.json({ error: googleOnly ? "This account uses Google. Continue with Google instead." : "Wrong email or password." }, { status: 401 });
  }
  const token = await createSession(user.id);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(request, token) } });
}

import { createSession, fromThisSite, hashPassword, resetPassword, sessionCookie } from "@/lib/auth";
import { badRequest, rateLimit, readJson } from "@/lib/guard";

export const dynamic = "force-dynamic";

// POST { token, password } -> sets the new password from an emailed link, signs out
// every other device and signs this one in.
export async function POST(request: Request) {
  if (!fromThisSite(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const limited = rateLimit(request, "auth-reset", 10, 15 * 60_000);
  if (limited) return limited;
  let body: { token?: unknown; password?: unknown };
  try {
    body = await readJson(request, 2_000);
  } catch (err) {
    return badRequest(err)!;
  }
  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!token || token.length > 100) return Response.json({ error: "This reset link isn't valid. Ask for a new one." }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "Use at least 8 characters for your password." }, { status: 400 });
  if (password.length > 200) return Response.json({ error: "That password is too long." }, { status: 400 });

  const userId = await resetPassword(token, await hashPassword(password));
  if (!userId) return Response.json({ error: "This reset link has expired or was already used. Ask for a new one." }, { status: 400 });
  const session = await createSession(userId);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(request, session) } });
}

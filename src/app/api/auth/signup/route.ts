import { EMAIL, createSession, createUser, findUserByEmail, fromThisSite, hashPassword, normalEmail, sessionCookie } from "@/lib/auth";
import { badRequest, rateLimit, readJson } from "@/lib/guard";

export const dynamic = "force-dynamic";

// POST { email, password, name? } -> creates the account and signs it in.
export async function POST(request: Request) {
  if (!fromThisSite(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const limited = rateLimit(request, "auth-signup", 10, 30 * 60_000);
  if (limited) return limited;
  let body: { email?: unknown; password?: unknown; name?: unknown };
  try {
    body = await readJson(request, 4_000);
  } catch (err) {
    return badRequest(err)!;
  }
  const email = typeof body.email === "string" ? normalEmail(body.email) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) || null : null;
  if (!EMAIL.test(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "Use at least 8 characters for your password." }, { status: 400 });
  if (password.length > 200) return Response.json({ error: "That password is too long." }, { status: 400 });

  if (await findUserByEmail(email)) return Response.json({ error: "There's already an account with this email. Sign in instead." }, { status: 409 });
  const id = await createUser({ email, name, passwordHash: await hashPassword(password) });
  const token = await createSession(id);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(request, token) } });
}

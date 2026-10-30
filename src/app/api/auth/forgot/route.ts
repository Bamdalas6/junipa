import { EMAIL, RESET_MINUTES, createPasswordReset, findUserByEmail, fromThisSite, normalEmail, resetSentRecently } from "@/lib/auth";
import { buttonEmail, emailConfigured, sendEmail } from "@/lib/email";
import { badRequest, clientIp, rateLimit, rateLimitKey, readJson, siteOrigin } from "@/lib/guard";
import { AUTH_IP, sharedLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// POST { email } -> emails a reset link if there's an account. The reply is the same
// either way, so this can't be used to find out who has an account.
export async function POST(request: Request) {
  if (!fromThisSite(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!emailConfigured()) return Response.json({ error: "Password reset isn't available yet. Email privacy@junipa.app and we'll help." }, { status: 503 });
  const limited = rateLimit(request, "auth-forgot", 5, 15 * 60_000);
  if (limited) return limited;
  const shared = await sharedLimit(AUTH_IP, `forgot:${clientIp(request)}`);
  if (shared) return shared;
  let body: { email?: unknown };
  try {
    body = await readJson(request, 2_000);
  } catch (err) {
    return badRequest(err)!;
  }
  const email = typeof body.email === "string" ? normalEmail(body.email).slice(0, 320) : "";
  if (!EMAIL.test(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  // A quick in-memory cap per address; the reliable one is resetSentRecently below.
  const perAccount = rateLimitKey("auth-forgot-acct", email, 3, 60 * 60_000);
  if (perAccount) return perAccount;

  const user = await findUserByEmail(email);
  // A link sent in the last minute is still on its way: don't send another (the reply looks the same).
  if (user && !(await resetSentRecently(user.id))) {
    const token = await createPasswordReset(user.id);
    const url = `${siteOrigin(request)}/reset-password?token=${encodeURIComponent(token)}`;
    const googleOnly = !user.password_hash && user.google_sub;
    const mail = buttonEmail({
      heading: "Reset your password",
      intro: googleOnly
        ? "Someone asked to reset the password for your Junia account. You sign in with Google, so you don't need one, but you can set a password here if you'd like to use your email too."
        : "Someone asked to reset the password for your Junia account. Use the button below to choose a new one.",
      button: "Choose a new password",
      url,
      outro: `The link works once and expires in ${RESET_MINUTES} minutes. If you didn't ask for this, ignore this email: your password stays the same.`,
    });
    if (!(await sendEmail({ to: user.email, subject: "Reset your Junia password", ...mail })))
      return Response.json({ error: "We couldn't send the email just now. Try again in a minute." }, { status: 502 });
  }
  return Response.json({ ok: true });
}

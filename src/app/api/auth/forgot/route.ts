import { EMAIL, RESET_MINUTES, createPasswordReset, findUserByEmail, fromThisSite, normalEmail } from "@/lib/auth";
import { buttonEmail, emailConfigured, sendEmail } from "@/lib/email";
import { badRequest, rateLimit, rateLimitKey, readJson, siteOrigin } from "@/lib/guard";

export const dynamic = "force-dynamic";

// POST { email } -> emails a reset link if there's an account. The reply is the same
// either way, so this can't be used to find out who has an account.
export async function POST(request: Request) {
  if (!fromThisSite(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!emailConfigured()) return Response.json({ error: "Password reset isn't available yet. Email privacy@junipa.app and we'll help." }, { status: 503 });
  const limited = rateLimit(request, "auth-forgot", 5, 15 * 60_000);
  if (limited) return limited;
  let body: { email?: unknown };
  try {
    body = await readJson(request, 2_000);
  } catch (err) {
    return badRequest(err)!;
  }
  const email = typeof body.email === "string" ? normalEmail(body.email).slice(0, 320) : "";
  if (!EMAIL.test(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  // At most 3 emails an hour to one address, so nobody can flood an inbox.
  const perAccount = rateLimitKey("auth-forgot-acct", email, 3, 60 * 60_000);
  if (perAccount) return perAccount;

  const user = await findUserByEmail(email);
  if (user) {
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

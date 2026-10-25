import { currentUser, fromThisSite } from "@/lib/auth";
import { billingStatus, confirmSubscription } from "@/lib/billing";
import { badRequest, rateLimit, readJson } from "@/lib/guard";

export const dynamic = "force-dynamic";

// POST { checkoutId? } -> after checkout, looks up the new subscription on Bachs and saves it.
export async function POST(request: Request) {
  if (!fromThisSite(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const limited = rateLimit(request, "billing-confirm", 30, 10 * 60_000);
  if (limited) return limited;
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in to finish.", signIn: true }, { status: 401 });
  let body: { checkoutId?: unknown };
  try {
    body = await readJson(request, 1_000);
  } catch (err) {
    return badRequest(err)!;
  }
  const checkoutId = typeof body.checkoutId === "string" && /^chk_[A-Za-z0-9_-]{4,80}$/.test(body.checkoutId) ? body.checkoutId : undefined;
  try {
    const confirmed = await confirmSubscription(user.id, checkoutId);
    return Response.json({ confirmed, ...(await billingStatus(user.id)) });
  } catch (err) {
    console.error("[billing:confirm]", err);
    return Response.json({ error: "Couldn't confirm the subscription yet. Try again in a moment." }, { status: 502 });
  }
}

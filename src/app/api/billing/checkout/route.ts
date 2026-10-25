import { currentUser, fromThisSite, safeNext } from "@/lib/auth";
import { entitlement, startSubscription, subscriptionsEnabled } from "@/lib/billing";
import { badRequest, rateLimit, readJson, siteOrigin } from "@/lib/guard";
import { isInterval, isPlan } from "@/lib/plans";

export const dynamic = "force-dynamic";

// POST { plan, interval, back? } -> { url } of Bachs' hosted checkout for that subscription.
export async function POST(request: Request) {
  if (!fromThisSite(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const limited = rateLimit(request, "billing-checkout", 20, 10 * 60_000);
  if (limited) return limited;
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Create a free account first.", signIn: true }, { status: 401 });
  if (!subscriptionsEnabled()) return Response.json({ error: "Subscriptions open very soon." }, { status: 503 });
  let body: { plan?: unknown; interval?: unknown; back?: unknown };
  try {
    body = await readJson(request, 2_000);
  } catch (err) {
    return badRequest(err)!;
  }
  if (!isPlan(body.plan) || !isInterval(body.interval)) return Response.json({ error: "Pick a plan." }, { status: 400 });
  const plan = await entitlement(user.id);
  if (plan !== "free") return Response.json({ error: "You already have a subscription. Change it from Billing.", manage: true }, { status: 409 });

  const origin = siteOrigin(request);
  // Bachs only returns buyers to a public address; locally, BACHS_RETURN_URL stands in.
  const returnTo = (process.env.NODE_ENV !== "production" && process.env.BACHS_RETURN_URL) || origin;
  const back = safeNext(typeof body.back === "string" ? body.back : "/billing");
  try {
    const url = await startSubscription({
      userId: user.id,
      email: user.email,
      plan: body.plan,
      interval: body.interval,
      // Path only: Bachs appends ?checkout_id=.
      successUrl: `${returnTo}/billing/return`,
      cancelUrl: `${returnTo}${back}`,
    });
    return Response.json({ url });
  } catch (err) {
    console.error("[billing:checkout]", err);
    return Response.json({ error: "Couldn't start the checkout. Try again in a moment." }, { status: 502 });
  }
}

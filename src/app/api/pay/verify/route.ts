import { currentUser } from "@/lib/auth";
import { recordPayment } from "@/lib/billing";
import { rateLimit } from "@/lib/guard";
import { CURRENCY, SOCIAL, TIERS, confirmPayment, confirmSocialPayment, paymentsEnabled, signSocial, signUnlock } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called when Paystack redirects back: confirms the payment server-side, then issues the unlock token.
export async function GET(request: Request) {
  const limited = rateLimit(request, "pay-verify", 30, 10 * 60_000);
  if (limited) return limited;
  const params = new URL(request.url).searchParams;
  const reference = (params.get("reference") ?? "").slice(0, 100);
  const domain = params.get("domain") ?? "";
  const campaign = params.get("campaign") ?? "";
  if (params.get("product") === "social") {
    const key = params.get("key") ?? "";
    if (!paymentsEnabled() || !reference || !/^[a-f0-9]{20}$/.test(key)) return Response.json({ paid: false }, { status: 400 });
    try {
      const paid = await confirmSocialPayment(reference, key);
      if (paid) await recordPayment({ id: `pay:${reference}`, userId: (await currentUser(request))?.id ?? null, kind: "one_time", product: "social", amount: SOCIAL.price, currency: CURRENCY, reference });
      return Response.json(paid ? { paid: true, token: signSocial(key, reference) } : { paid: false });
    } catch (err) {
      console.error("[pay:verify:social]", err);
      return Response.json({ paid: false, error: "Couldn't confirm the payment yet." }, { status: 502 });
    }
  }
  if (!paymentsEnabled() || !reference || !domain || !campaign) return Response.json({ paid: false }, { status: 400 });
  try {
    const tier = await confirmPayment(reference, domain, campaign);
    if (tier)
      await recordPayment({ id: `pay:${reference}`, userId: (await currentUser(request))?.id ?? null, kind: "one_time", product: `campaign_${tier}`, amount: TIERS[tier].price, currency: CURRENCY, reference });
    return Response.json(tier ? { paid: true, tier, token: signUnlock(domain, campaign, tier, reference) } : { paid: false });
  } catch (err) {
    console.error("[pay:verify]", err);
    return Response.json({ paid: false, error: "Couldn't confirm the payment yet." }, { status: 502 });
  }
}

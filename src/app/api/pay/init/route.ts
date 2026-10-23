import { badRequest, rateLimit, readJson, siteOrigin } from "@/lib/guard";
import { isTier, paymentsEnabled, provider, startCheckout, startSocialCheckout } from "@/lib/payments";

export const runtime = "nodejs";

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CAMPAIGN = /^[a-z0-9-]{1,80}$/;

// Starts a checkout (Bachs, or Paystack) for one campaign + tier and returns the hosted payment page URL.
export async function POST(request: Request) {
  if (!paymentsEnabled()) return Response.json({ error: "Payments are not set up yet." }, { status: 400 });
  const limited = rateLimit(request, "pay-init", 20, 10 * 60_000);
  if (limited) return limited;
  let body: Record<string, unknown>;
  try {
    body = await readJson(request, 4_000);
  } catch (err) {
    return badRequest(err)!;
  }
  const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 254) : undefined);
  const [domain, email, campaign, tier, product, key] = [body.domain, body.email, body.campaign, body.tier, body.product, body.key].map(str);
  const industry = /^[a-z-]{1,40}$/.test(str(body.industry) ?? "") ? str(body.industry) : undefined;
  const origin = siteOrigin(request);
  // Bachs only returns buyers to a public address (never localhost). Locally, set
  // BACHS_RETURN_URL to a tunnel or any public URL while testing.
  const returnTo = (process.env.NODE_ENV !== "production" && process.env.BACHS_RETURN_URL) || origin;

  if (product === "social") {
    if (!key || !/^[a-f0-9]{20}$/.test(key)) return Response.json({ error: "Run the plan first." }, { status: 400 });
    if (!email || !EMAIL.test(email)) return Response.json({ error: "Enter a valid email for your receipt." }, { status: 400 });
    try {
      const back = `${provider() === "bachs" ? returnTo : origin}/social?key=${key}`;
      // Bachs adds ?checkout_id= to the return address, so it comes back via a path-only route.
      const { url, reference } = await startSocialCheckout({ key, email, callbackUrl: provider() === "bachs" ? `${returnTo}/pay/return/social/${key}` : back, cancelUrl: back });
      return Response.json({ url, reference });
    } catch (err) {
      console.error("[pay:init:social]", err);
      return Response.json({ error: "Couldn't start the payment. Try again in a moment." }, { status: 502 });
    }
  }

  if (!domain || !DOMAIN.test(domain) || !campaign || !CAMPAIGN.test(campaign)) return Response.json({ error: "Invalid campaign." }, { status: 400 });
  if (!isTier(tier)) return Response.json({ error: "Pick a plan." }, { status: 400 });
  if (!email || !EMAIL.test(email)) return Response.json({ error: "Enter a valid email for your receipt." }, { status: 400 });
  const q = new URLSearchParams({ step: "people", industry: industry || "other", campaign });
  try {
    const back = `${provider() === "bachs" ? returnTo : origin}/w/${domain}?${q}`;
    const { url, reference } = await startCheckout({ domain, campaign, tier, email, callbackUrl: provider() === "bachs" ? `${returnTo}/pay/return/w/${domain}/${campaign}/${industry || "other"}` : back, cancelUrl: back });
    return Response.json({ url, reference });
  } catch (err) {
    console.error("[pay:init]", err);
    return Response.json({ error: "Couldn't start the payment. Try again in a moment." }, { status: 502 });
  }
}

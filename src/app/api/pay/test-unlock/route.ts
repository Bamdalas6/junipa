import { badRequest, readJson } from "@/lib/guard";
import { isTier, signSocial, signUnlock, testUnlockAllowed } from "@/lib/payments";

export const runtime = "nodejs";

// Only while Paystack isn't connected (and never in production unless switched on): lets you test the paid steps end to end.
export async function POST(request: Request) {
  if (!testUnlockAllowed()) return Response.json({ error: "Test unlock is off." }, { status: 403 });
  let body: Record<string, unknown>;
  try {
    body = await readJson(request, 2_000);
  } catch (err) {
    return badRequest(err)!;
  }
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 253) : undefined);
  const [domain, campaign, tier, product, key] = [body.domain, body.campaign, body.tier, body.product, body.key].map(str);
  if (product === "social") {
    if (!key || !/^[a-f0-9]{20}$/.test(key)) return Response.json({ error: "Run the plan first." }, { status: 400 });
    return Response.json({ token: signSocial(key, `test_${Date.now()}`) });
  }
  if (!domain || !campaign || !isTier(tier)) return Response.json({ error: "Missing campaign or plan." }, { status: 400 });
  return Response.json({ token: signUnlock(domain, campaign, tier, `test_${Date.now()}`), tier });
}

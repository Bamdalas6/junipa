// Bachs sends buyers back to success_url (docs say with ?checkout_id=, but the sandbox
// sends none, so "pending" tells the page to use the checkout it remembered).
// This path-only address turns that into the normal workspace / social URL,
// where the page confirms the payment on the server before unlocking anything.
import { siteOrigin } from "@/lib/guard";

export const dynamic = "force-dynamic";

const redirect = (to: string, status: number) => new Response(null, { status, headers: { Location: to, "Cache-Control": "no-store" } });

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const CAMPAIGN = /^[a-z0-9-]{1,80}$/;
const INDUSTRY = /^[a-z-]{1,40}$/;
const KEY = /^[a-f0-9]{20}$/;
const CHECKOUT = /^chk_[A-Za-z0-9_-]{4,80}$/;

export function GET(request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  return params.then(({ slug }) => {
    const url = new URL(request.url);
    const origin = siteOrigin(request);
    const checkout = url.searchParams.get("checkout_id") ?? "";
    const ref = CHECKOUT.test(checkout) ? checkout : "";
    const [kind, a, b, c] = slug;
    if (kind === "w" && DOMAIN.test(a ?? "") && CAMPAIGN.test(b ?? "")) {
      const q = new URLSearchParams({ step: "people", industry: INDUSTRY.test(c ?? "") ? c : "other", campaign: b });
      q.set("reference", ref || "pending");
      return redirect(`${origin}/w/${a.toLowerCase()}?${q}`, 303);
    }
    if (kind === "social" && KEY.test(a ?? "")) {
      const q = new URLSearchParams({ key: a });
      q.set("reference", ref || "pending");
      return redirect(`${origin}/social?${q}`, 303);
    }
    return redirect(`${origin}/`, 303);
  });
}

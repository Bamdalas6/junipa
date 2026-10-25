import { currentUser, fromThisSite } from "@/lib/auth";
import { portalUrl } from "@/lib/billing";
import { rateLimit } from "@/lib/guard";

export const dynamic = "force-dynamic";

// POST -> { url } of Bachs' customer portal, where subscribers change plan, update their card or cancel.
export async function POST(request: Request) {
  if (!fromThisSite(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const limited = rateLimit(request, "billing-portal", 20, 10 * 60_000);
  if (limited) return limited;
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in first.", signIn: true }, { status: 401 });
  try {
    const url = await portalUrl(user.id);
    return url ? Response.json({ url }) : Response.json({ error: "No subscription to manage yet." }, { status: 404 });
  } catch (err) {
    console.error("[billing:portal]", err);
    return Response.json({ error: "Couldn't open billing right now. Try again in a moment." }, { status: 502 });
  }
}

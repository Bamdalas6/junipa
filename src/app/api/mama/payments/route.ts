import { currentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/analytics";
import { isRange } from "@/lib/analytics-stats";
import { refreshDueSubscriptions } from "@/lib/billing";
import { rateLimit } from "@/lib/guard";
import { paymentStats } from "@/lib/payment-stats";

export const dynamic = "force-dynamic";

// GET ?range=24h|7d|30d|90d&tz=<minutes east of UTC> -> payments for the /mama dashboard.
// First re-reads any subscription whose renewal date has passed, so renewals are counted.
// Anyone who isn't an admin gets a plain 404.
export async function GET(request: Request) {
  const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const limited = rateLimit(request, "admin-payments", 120, 10 * 60_000);
  if (limited) return limited;
  if (!isAdmin(await currentUser(request))) return notFound();
  const url = new URL(request.url);
  const range = url.searchParams.get("range");
  const tz = Math.max(-840, Math.min(840, Math.round(Number(url.searchParams.get("tz")) || 0)));
  try {
    await refreshDueSubscriptions();
  } catch (e) {
    console.error("[mama] renewal check failed:", (e as Error).message);
  }
  const stats = await paymentStats(isRange(range) ? range : "7d", tz);
  return Response.json(stats, { headers: { "Cache-Control": "private, no-store" } });
}

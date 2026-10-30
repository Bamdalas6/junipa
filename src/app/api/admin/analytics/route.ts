import { currentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/analytics";
import { isRange, siteStats } from "@/lib/analytics-stats";
import { rateLimit } from "@/lib/guard";

export const dynamic = "force-dynamic";

// GET ?range=24h|7d|30d|90d&tz=<minutes east of UTC> -> visit stats for the admin dashboard.
// Anyone who isn't an admin gets a plain 404, so the endpoint doesn't reveal itself.
export async function GET(request: Request) {
  const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const limited = rateLimit(request, "admin-stats", 120, 10 * 60_000);
  if (limited) return limited;
  if (!isAdmin(await currentUser(request))) return notFound();
  const url = new URL(request.url);
  const range = url.searchParams.get("range");
  const tz = Math.max(-840, Math.min(840, Math.round(Number(url.searchParams.get("tz")) || 0)));
  const stats = await siteStats(isRange(range) ? range : "7d", tz);
  return Response.json(stats, { headers: { "Cache-Control": "private, no-store" } });
}

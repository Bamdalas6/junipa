import { currentUser, fromThisSite } from "@/lib/auth";
import { isAdmin, isBot, recordDuration, recordView } from "@/lib/analytics";
import { badRequest, rateLimit, readJson } from "@/lib/guard";

export const dynamic = "force-dynamic";

// Visit stats from VisitTracker:
//   POST { path, referrer?, utm_source?, utm_medium?, utm_campaign? } -> { id } for a page view
//   POST { id, ms }                                                   -> time spent on that page
// Bots and the site's admins aren't counted. Nothing here ever fails the visitor's page.
export async function POST(request: Request) {
  const ok = (body: object = { ok: true }) => Response.json(body, { headers: { "Cache-Control": "no-store" } });
  if (!fromThisSite(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const limited = rateLimit(request, "visits", 300, 10 * 60_000);
  if (limited) return limited;
  let body: Record<string, unknown>;
  try {
    body = await readJson(request, 2_000);
  } catch (err) {
    return badRequest(err)!;
  }
  if (isBot(request.headers.get("user-agent") ?? "")) return ok();
  try {
    if ("ms" in body) {
      await recordDuration(request, body.id, body.ms);
      return ok();
    }
    const user = await currentUser(request);
    if (isAdmin(user)) return ok();
    return ok({ id: await recordView(request, body, !!user) });
  } catch (e) {
    console.error("[analytics] visit not saved:", (e as Error).message);
    return ok();
  }
}

import { currentUser, fromThisSite } from "@/lib/auth";
import { badRequest, rateLimit, readJson } from "@/lib/guard";
import { addLeads, pipeline, type LeadInput } from "@/lib/leads";

export const dynamic = "force-dynamic";

// Results tracking for one workspace (the researched website).
//   GET  ?workspace=brand.com          -> leads with their messages and follow-ups, stats, plan limit
//   POST { workspace, leads: [...] }   -> adds leads (free plan: up to 25 in total)

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in to see your pipeline." }, { status: 401 });
  const workspace = new URL(request.url).searchParams.get("workspace")?.toLowerCase() ?? "";
  if (!DOMAIN.test(workspace)) return Response.json({ error: "Invalid workspace" }, { status: 400 });
  return Response.json(await pipeline(user.id, workspace), { headers: noStore });
}

export async function POST(request: Request) {
  if (!fromThisSite(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const limited = rateLimit(request, "leads-add", 120, 10 * 60_000);
  if (limited) return limited;
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in to track leads." }, { status: 401 });
  let body: { workspace?: unknown; leads?: unknown };
  try {
    body = await readJson(request, 200_000);
  } catch (err) {
    return badRequest(err)!;
  }
  const workspace = typeof body.workspace === "string" ? body.workspace.toLowerCase() : "";
  if (!DOMAIN.test(workspace) || !Array.isArray(body.leads)) return Response.json({ error: "Invalid request" }, { status: 400 });
  const result = await addLeads(user.id, workspace, body.leads as LeadInput[]);
  return Response.json(result, { status: result.added === 0 && result.overLimit > 0 ? 402 : 200 });
}

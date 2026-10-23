import { badRequest, rateLimit, readJson } from "@/lib/guard";
import { unseal, verifySocial } from "@/lib/payments";
import type { SocialPlan } from "@/lib/schema";

export const runtime = "nodejs";

// Opens a sealed plan once the browser holds a valid unlock token for those handles.
export async function POST(request: Request) {
  const limited = rateLimit(request, "social-unlock", 60, 10 * 60_000);
  if (limited) return limited;
  let body: { sealed?: unknown; token?: unknown };
  try {
    body = await readJson(request, 300_000);
  } catch (err) {
    return badRequest(err)!;
  }
  const { sealed, token } = body;
  if (typeof sealed !== "string" || typeof token !== "string" || !sealed || !token) return Response.json({ error: "Missing plan or unlock." }, { status: 400 });
  let data: { key: string; plan: SocialPlan };
  try {
    data = unseal<{ key: string; plan: SocialPlan }>(sealed);
  } catch {
    return Response.json({ error: "That plan can't be opened. Run it again." }, { status: 400 });
  }
  if (!verifySocial(token, data.key)) return Response.json({ error: "Unlock this plan to see it." }, { status: 402 });
  return Response.json({ plan: data.plan });
}

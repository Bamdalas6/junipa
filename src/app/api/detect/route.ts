import { detectIndustry } from "@/lib/detect";
import { rateLimit } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

// GET /api/detect?domain=brand.com -> best-guess industry from the homepage.
export async function GET(request: Request) {
  const limited = rateLimit(request, "detect", 60, 10 * 60_000);
  if (limited) return limited;
  const domain = new URL(request.url).searchParams.get("domain")?.toLowerCase() ?? "";
  if (!DOMAIN.test(domain) || domain.length > 253) return Response.json({ error: "Invalid domain" }, { status: 400 });
  if (domain.endsWith(".example")) return Response.json({ industry: "fashion", confidence: 0.9, name: "Demo brand", description: "", matched: [], readSite: false });
  try {
    return Response.json(await detectIndustry(domain), { headers: { "Cache-Control": "private, max-age=600" } });
  } catch {
    return Response.json({ error: "Could not read that website" }, { status: 422 });
  }
}

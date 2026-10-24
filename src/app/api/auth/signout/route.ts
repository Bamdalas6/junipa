import { clearCookie, endSession, fromThisSite } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST -> ends this browser's session.
export async function POST(request: Request) {
  if (!fromThisSite(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  await endSession(request).catch(() => {});
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearCookie(request) } });
}

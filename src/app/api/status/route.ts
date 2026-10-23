import { isLive } from "@/lib/engine";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ live: isLive(), emails: Boolean(process.env.HUNTER_API_KEY) });
}

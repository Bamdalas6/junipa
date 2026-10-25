import { currentUser } from "@/lib/auth";
import { billingStatus } from "@/lib/billing";

export const dynamic = "force-dynamic";

// GET -> the plans on offer, and the signed-in user's plan (free when signed out).
export async function GET(request: Request) {
  const user = await currentUser(request);
  return Response.json(await billingStatus(user?.id ?? null), { headers: { "Cache-Control": "private, no-store" } });
}

import { CURRENCY, SOCIAL, TIERS, paymentsEnabled, provider } from "@/lib/payments";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ enabled: paymentsEnabled(), provider: provider(), currency: CURRENCY, tiers: [TIERS.starter, TIERS.pro], social: SOCIAL });
}

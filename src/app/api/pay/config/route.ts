import { CURRENCY, FOUNDING, SOCIAL, TIERS, paymentsEnabled, provider } from "@/lib/payments";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ enabled: paymentsEnabled(), provider: provider(), currency: CURRENCY, founding: FOUNDING.percent ? FOUNDING : null, tiers: [TIERS.starter, TIERS.pro], social: SOCIAL });
}

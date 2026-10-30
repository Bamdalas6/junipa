import type { Metadata } from "next";
import SocialView from "@/components/SocialView";
import { WORLDWIDE, sanitizeMarket } from "@/lib/geo";
import { PLATFORMS, type Platform } from "@/lib/social-shared";

export const metadata: Metadata = {
  title: "Grow your social accounts · Junipa",
  description: "Drop your handles and get an audit, bio rewrites, content pillars, hooks, hashtags and a 30-day growth plan for your niche.",
};

// Handles can be prefilled from the workspace: /social?instagram=brand&tiktok=brand&industry=fashion&country=NG
export default async function SocialPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const handles: Partial<Record<Platform, string>> = {};
  for (const p of PLATFORMS) if (q[p.id]) handles[p.id] = String(q[p.id]).slice(0, 120);
  const market = q.market === "worldwide" ? WORLDWIDE : sanitizeMarket({ scope: "country", country: q.country, region: q.region });
  return <SocialView initialHandles={handles} initialIndustry={q.industry ?? ""} initialMarket={market} initialBrand={(q.brand ?? "").slice(0, 80)} paidKey={q.key} reference={q.reference} autoStart={q.auto === "1"} />;
}

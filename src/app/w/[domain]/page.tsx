import WorkspaceView from "@/components/WorkspaceView";
import { WORLDWIDE, sanitizeMarket } from "@/lib/geo";

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ industry?: string; goal?: string; demo?: string; step?: string; reference?: string; campaign?: string; market?: string; country?: string; region?: string }>;
}) {
  const { domain } = await params;
  const { industry, goal, demo, step, reference, campaign, market, country, region } = await searchParams;
  const target = market === "worldwide" ? WORLDWIDE : sanitizeMarket({ scope: "country", country, region });
  return <WorkspaceView domain={decodeURIComponent(domain).toLowerCase()} industry={industry ?? "fashion"} goal={goal ?? ""} demo={demo === "1"} initialStep={step} reference={reference} campaign={campaign} market={target} />;
}

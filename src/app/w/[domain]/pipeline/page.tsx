import type { Metadata } from "next";
import PipelineView from "@/components/PipelineView";

export const metadata: Metadata = { title: "Pipeline · Junipa" };

export default async function PipelinePage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  return <PipelineView domain={decodeURIComponent(domain).toLowerCase()} />;
}

"use client";

import type { LeadChannel, LeadContext } from "./leads-shared";

// Browser helpers for results tracking: add leads from the research, and log what was sent.

export interface NewLead {
  campaign?: string;
  account: string;
  name?: string;
  role?: string;
  email?: string;
  linkedin?: string;
  instagram?: string;
  channel?: LeadChannel;
  context?: LeadContext;
}

export interface TrackResult {
  ids: string[];
  added: number;
  overLimit: number;
}

export async function trackLeads(workspace: string, leads: NewLead[]): Promise<TrackResult> {
  const res = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace, leads }) });
  const data = (await res.json().catch(() => ({}))) as Partial<TrackResult> & { error?: string };
  if (!res.ok && res.status !== 402) throw new Error(data.error ?? "Couldn't add to your pipeline.");
  return { ids: data.ids ?? [], added: data.added ?? 0, overLimit: data.overLimit ?? 0 };
}

/** Adds the lead if needed, then records the message on it (a Found lead becomes Contacted). */
export async function logSent(workspace: string, lead: NewLead, message: { channel: LeadChannel; subject?: string; body: string }) {
  const { ids, overLimit } = await trackLeads(workspace, [lead]);
  if (!ids[0]) return { logged: false, overLimit: overLimit > 0 };
  await fetch(`/api/leads/${ids[0]}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(message) }).catch(() => {});
  return { logged: true, overLimit: false };
}

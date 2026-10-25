// Lead statuses and follow-up rules, shared by the pipeline page and the server.

export const LEAD_STATUSES = ["found", "contacted", "replied", "interested", "signed_up", "not_interested"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STATUS_LABEL: Record<LeadStatus, string> = {
  found: "Found",
  contacted: "Contacted",
  replied: "Replied",
  interested: "Interested",
  signed_up: "Signed up",
  not_interested: "Not interested",
};

/** Once a lead answers (or says no), its follow-up sequence stops. */
export const STOPS_SEQUENCE: LeadStatus[] = ["replied", "interested", "signed_up", "not_interested"];
/** Counted as a reply in the stats. */
export const REPLIED: LeadStatus[] = ["replied", "interested", "signed_up"];

export const LEAD_CHANNELS = ["email", "instagram", "whatsapp", "linkedin", "phone", "other"] as const;
export type LeadChannel = (typeof LEAD_CHANNELS)[number];

export const FREE_LEADS = 25;
export const MAX_FOLLOW_UPS = 4;

/** Added to every follow-up email so people can opt out (and we stop when they do). */
export const OPT_OUT_LINE = `Not the right time? Just reply "no thanks" and I won't follow up again.`;

export function withOptOut(body: string) {
  return body.includes(OPT_OUT_LINE) ? body : `${body.trimEnd()}\n\n${OPT_OUT_LINE}`;
}

export interface LeadMessage {
  id: string;
  channel: string;
  subject: string | null;
  body: string;
  kind: "message" | "follow_up";
  sentAt: number;
}

export interface FollowUp {
  id: string;
  leadId: string;
  step: number;
  channel: string;
  subject: string | null;
  body: string;
  dueAt: number;
  status: "scheduled" | "due" | "sent" | "cancelled";
  sentAt: number | null;
}

/** Research behind the lead, kept so follow-ups can be written from it. */
export interface LeadContext {
  why?: string;
  signal?: string;
  angle?: string;
  brand?: string;
  website?: string;
}

export interface Lead {
  id: string;
  workspace: string;
  campaign: string | null;
  account: string;
  name: string;
  role: string | null;
  email: string | null;
  linkedin: string | null;
  instagram: string | null;
  channel: string | null;
  status: LeadStatus;
  notes: string | null;
  context: LeadContext | null;
  contactedAt: number | null;
  createdAt: number;
  updatedAt: number;
  messages: LeadMessage[];
  followUps: FollowUp[];
}

export interface PipelineData {
  leads: Lead[];
  stats: { total: number; contacted: number; replied: number; replyRate: number; signedUp: number; due: number; sentToday: number };
  /** null = unlimited (a paid campaign); otherwise the free plan's cap. */
  limit: { used: number; max: number | null };
  dailyLimit: number;
}

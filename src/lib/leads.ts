import { randomId } from "./auth";
import { db } from "./db";
import {
  FREE_LEADS,
  LEAD_CHANNELS,
  LEAD_STATUSES,
  REPLIED,
  type FollowUp,
  type Lead,
  type LeadContext,
  type LeadMessage,
  type LeadStatus,
  type PipelineData,
} from "./leads-shared";
import { entitlement } from "./billing";

// Results tracking on the server: leads, their messages and follow-ups, per user + workspace.

export const DAILY_FOLLOW_UPS = () => Math.max(1, Number(process.env.FOLLOW_UP_DAILY_LIMIT) || 30);

interface LeadRow {
  id: string;
  workspace_id: string;
  campaign: string | null;
  account: string;
  name: string;
  role: string | null;
  email: string | null;
  linkedin: string | null;
  instagram: string | null;
  channel: string | null;
  status: string;
  notes: string | null;
  context: string | null;
  contacted_at: number | null;
  created_at: number;
  updated_at: number;
}

const parse = <T,>(s: string | null): T | null => {
  try {
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
};

export const isStatus = (s: unknown): s is LeadStatus => typeof s === "string" && (LEAD_STATUSES as readonly string[]).includes(s);
export const cleanChannel = (s: unknown) => (typeof s === "string" && (LEAD_CHANNELS as readonly string[]).includes(s) ? s : "other");
export const text = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

/** Pro: unlimited leads. Free and Starter: FREE_LEADS in total. */
export async function leadLimit(userId: string): Promise<{ used: number; max: number | null }> {
  const used = (await (await db()).prepare("SELECT COUNT(*) AS n FROM leads WHERE user_id = ?").bind(userId).first<{ n: number }>())?.n ?? 0;
  return { used, max: (await entitlement(userId)) === "pro" ? null : FREE_LEADS };
}

/** A lead that belongs to this user, or null. */
export async function ownLead(userId: string, id: string) {
  return (await db()).prepare("SELECT * FROM leads WHERE id = ? AND user_id = ?").bind(id, userId).first<LeadRow>();
}

export async function pipeline(userId: string, workspace: string): Promise<PipelineData> {
  const database = await db();
  const [{ results: rows }, { results: msgs }, { results: fus }] = await Promise.all([
    database.prepare("SELECT * FROM leads WHERE user_id = ? AND workspace_id = ? ORDER BY updated_at DESC").bind(userId, workspace).all<LeadRow>(),
    database
      .prepare("SELECT m.* FROM lead_messages m JOIN leads l ON l.id = m.lead_id WHERE l.user_id = ? AND l.workspace_id = ? ORDER BY m.sent_at ASC")
      .bind(userId, workspace)
      .all<{ id: string; lead_id: string; channel: string; subject: string | null; body: string; kind: string; sent_at: number }>(),
    database
      .prepare("SELECT f.* FROM follow_ups f JOIN leads l ON l.id = f.lead_id WHERE l.user_id = ? AND l.workspace_id = ? AND f.status != 'cancelled' ORDER BY f.due_at ASC")
      .bind(userId, workspace)
      .all<{ id: string; lead_id: string; step: number; channel: string; subject: string | null; body: string; due_at: number; status: string; sent_at: number | null }>(),
  ]);
  const byLead = <T extends { lead_id: string }>(list: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of list) m.set(x.lead_id, [...(m.get(x.lead_id) ?? []), x]);
    return m;
  };
  const msgMap = byLead(msgs);
  const fuMap = byLead(fus);
  const leads: Lead[] = rows.map((r) => ({
    id: r.id,
    workspace: r.workspace_id,
    campaign: r.campaign,
    account: r.account,
    name: r.name,
    role: r.role,
    email: r.email,
    linkedin: r.linkedin,
    instagram: r.instagram,
    channel: r.channel,
    status: isStatus(r.status) ? r.status : "found",
    notes: r.notes,
    context: parse<LeadContext>(r.context),
    contactedAt: r.contacted_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    messages: (msgMap.get(r.id) ?? []).map(
      (m): LeadMessage => ({ id: m.id, channel: m.channel, subject: m.subject, body: m.body, kind: m.kind === "follow_up" ? "follow_up" : "message", sentAt: m.sent_at }),
    ),
    followUps: (fuMap.get(r.id) ?? []).map(
      (f): FollowUp => ({ id: f.id, leadId: f.lead_id, step: f.step, channel: f.channel, subject: f.subject, body: f.body, dueAt: f.due_at, status: f.status as FollowUp["status"], sentAt: f.sent_at }),
    ),
  }));
  const contacted = leads.filter((l) => l.status !== "found").length;
  const replied = leads.filter((l) => REPLIED.includes(l.status)).length;
  const since = Date.now() - 86_400_000;
  const sentToday = (await database.prepare("SELECT COUNT(*) AS n FROM lead_messages WHERE user_id = ? AND sent_at > ?").bind(userId, since).first<{ n: number }>())?.n ?? 0;
  return {
    leads,
    stats: {
      total: leads.length,
      contacted,
      replied,
      replyRate: contacted ? Math.round((100 * replied) / contacted) : 0,
      signedUp: leads.filter((l) => l.status === "signed_up").length,
      due: leads.reduce((n, l) => n + l.followUps.filter((f) => f.status === "due").length, 0),
      sentToday,
    },
    limit: await leadLimit(userId),
    dailyLimit: DAILY_FOLLOW_UPS(),
    followUps: (await entitlement(userId)) === "pro",
  };
}

export interface LeadInput {
  campaign?: unknown;
  account?: unknown;
  name?: unknown;
  role?: unknown;
  email?: unknown;
  linkedin?: unknown;
  instagram?: unknown;
  channel?: unknown;
  context?: unknown;
}

/**
 * Adds leads (or fills in details of existing ones; their status is left alone).
 * On the free plan, new leads stop at FREE_LEADS; the rest are reported back as over the limit.
 */
export async function addLeads(userId: string, workspace: string, input: LeadInput[]) {
  const database = await db();
  const limit = await leadLimit(userId);
  let room = limit.max === null ? Infinity : Math.max(0, limit.max - limit.used);
  let added = 0;
  let overLimit = 0;
  const ids: string[] = [];
  const now = Date.now();
  for (const l of input.slice(0, 100)) {
    const account = text(l.account, 120);
    const name = text(l.name, 120) ?? (account ? "Team" : null);
    if (!account || !name) continue;
    const ctx = l.context && typeof l.context === "object" ? JSON.stringify(l.context).slice(0, 2000) : null;
    const existing = await database
      .prepare("SELECT id FROM leads WHERE user_id = ? AND workspace_id = ? AND account = ? AND name = ?")
      .bind(userId, workspace, account, name)
      .first<{ id: string }>();
    if (existing) {
      await database
        .prepare(
          "UPDATE leads SET role = COALESCE(?, role), email = COALESCE(?, email), linkedin = COALESCE(?, linkedin), instagram = COALESCE(?, instagram), campaign = COALESCE(campaign, ?), context = COALESCE(?, context), updated_at = ? WHERE id = ?",
        )
        .bind(text(l.role, 120), text(l.email, 200), text(l.linkedin, 300), text(l.instagram, 60), text(l.campaign, 80), ctx, now, existing.id)
        .run();
      ids.push(existing.id);
      continue;
    }
    if (room <= 0) {
      overLimit++;
      continue;
    }
    const id = randomId(12);
    await database
      .prepare(
        "INSERT INTO leads (id, user_id, workspace_id, campaign, account, name, role, email, linkedin, instagram, channel, status, context, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'found', ?, ?, ?)",
      )
      .bind(id, userId, workspace, text(l.campaign, 80), account, name, text(l.role, 120), text(l.email, 200), text(l.linkedin, 300), text(l.instagram, 60), l.channel ? cleanChannel(l.channel) : null, ctx, now, now)
      .run();
    ids.push(id);
    added++;
    room--;
  }
  return { ids, added, overLimit };
}

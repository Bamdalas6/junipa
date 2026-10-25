import { z } from "zod";
import { randomId, currentUser, fromThisSite } from "@/lib/auth";
import { entitlement } from "@/lib/billing";
import { db } from "@/lib/db";
import { claudeJson, provider } from "@/lib/engine";
import { geminiJson } from "@/lib/engine-gemini";
import { ScoutError, badRequest, rateLimit, readJson, userMessage } from "@/lib/guard";
import { cleanChannel, ownLead, text } from "@/lib/leads";
import { MAX_FOLLOW_UPS, STOPS_SEQUENCE, withOptOut, type LeadContext } from "@/lib/leads-shared";

export const dynamic = "force-dynamic";

// A lead's follow-up sequence.
//   POST   { draft: true, original, steps: [{ day, channel }] } -> AI drafts (nothing is saved)
//   PUT    { steps: [{ day, channel, subject, body }] }       -> schedules them, replacing any not yet sent
//   DELETE                                                    -> stops the sequence

type Ctx = { params: Promise<{ id: string }> };
const DAY = 86_400_000;

const Drafts = z.object({
  steps: z.array(z.object({ subject: z.string().describe("Email subject, or empty string for DMs"), body: z.string().describe("Message body") })),
});

const WRITER = `You write short follow-up messages for a founder's cold outreach.
Each follow-up adds something new: a useful detail from the research, a small proof point the founder actually gave, or an easy question. Never guilt-trip ("just bumping this", "did you see my last email").
Warm and plain. DMs and WhatsApp under 45 words, emails under 80 words. Use the person's first name only if it is given.
Never invent facts, results, clients or numbers, about the brand or the lead: only mention what the notes above say. With no facts to use, ask one simple, specific question instead.
Don't add a sign-off line or an unsubscribe line; the app adds those.`;

async function signedIn(request: Request, params: Ctx["params"], needsPro = true) {
  const user = await currentUser(request);
  if (!user) return { error: Response.json({ error: "Sign in first." }, { status: 401 }) };
  if (needsPro && (await entitlement(user.id)) !== "pro") return { error: Response.json({ error: "Automatic follow-ups are part of Pro.", subscribe: true }, { status: 402 }) };
  const { id } = await params;
  const lead = await ownLead(user.id, id);
  if (!lead) return { error: Response.json({ error: "Lead not found" }, { status: 404 }) };
  return { user, lead, id };
}

const parseSteps = (v: unknown) =>
  Array.isArray(v)
    ? v.slice(0, MAX_FOLLOW_UPS).map((s: { day?: unknown; channel?: unknown; subject?: unknown; body?: unknown }) => ({
        day: Math.min(60, Math.max(1, Math.round(Number(s?.day) || 3))),
        channel: cleanChannel(s?.channel),
        subject: text(s?.subject, 300),
        body: text(s?.body, 4000),
      }))
    : [];

export async function POST(request: Request, { params }: Ctx) {
  if (!fromThisSite(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const limited = rateLimit(request, "followup-draft", 30, 10 * 60_000);
  if (limited) return limited;
  const got = await signedIn(request, params);
  if (got.error) return got.error;
  let body: { original?: { channel?: unknown; subject?: unknown; body?: unknown }; steps?: unknown };
  try {
    body = await readJson(request, 40_000);
  } catch (err) {
    return badRequest(err)!;
  }
  const steps = parseSteps(body.steps);
  if (!steps.length) return Response.json({ error: "Add at least one follow-up" }, { status: 400 });
  const { lead, user } = got;
  const ctx = (lead.context ? JSON.parse(lead.context) : {}) as LeadContext;
  // A lead added without its research notes: fall back to the workspace's saved brand profile,
  // so the drafts never have to guess what the brand sells.
  if (!ctx.brand) {
    const row = await (await db()).prepare("SELECT data FROM workspaces WHERE user_id = ? AND domain = ?").bind(user.id, lead.workspace_id).first<{ data: string }>();
    try {
      const p = row ? (JSON.parse(row.data) as { profile?: { name?: string; oneLiner?: string } }).profile : undefined;
      if (p?.name) ctx.brand = `${p.name}: ${p.oneLiner ?? ""}`;
    } catch {}
  }
  const original = text(body.original?.body, 4000) ?? "";
  const first = lead.name && lead.name !== "Team" ? lead.name.split(" ")[0] : "";

  // Without an AI provider (demo mode), return plain templates the user can edit.
  const engine = provider();
  if (!engine) {
    return Response.json({
      steps: steps.map((s, i) => ({
        ...s,
        subject: s.channel === "email" ? `Re: ${text(body.original?.subject, 200) ?? lead.account}` : "",
        body: i === 0 ? `Hi${first ? ` ${first}` : ""}, following up on my note about ${lead.account}. Would a quick look be useful?` : `Hi${first ? ` ${first}` : ""}, last note from me. Happy to send details whenever suits.`,
      })),
    });
  }
  const prompt = [
    ctx.brand ? `Brand sending this: ${ctx.brand}.` : "The brand is not described here: do not say what it sells or does; keep the follow-up about the lead.",
    `Lead: ${first || "the team"} (${lead.role ?? "decision maker"}) at ${lead.account}.`,
    ctx.why && `Why they fit: ${ctx.why}`,
    ctx.signal && `Recent signal: ${ctx.signal}`,
    ctx.angle && `Hook: ${ctx.angle}`,
    original && `First message already sent:\n"""${original}"""`,
    "",
    `Write ${steps.length} follow-up${steps.length === 1 ? "" : "s"}, in order:`,
    ...steps.map((s, i) => `${i + 1}. Day ${s.day} after the first message, by ${s.channel}${i === steps.length - 1 ? " (the last one: polite, easy to say no)" : ""}.`),
  ]
    .filter(Boolean)
    .join("\n");
  try {
    const out = engine === "gemini" ? await geminiJson(Drafts, WRITER, prompt) : await claudeJson(Drafts, WRITER, prompt);
    return Response.json({
      steps: steps.map((s, i) => ({ ...s, subject: s.channel === "email" ? (out.steps[i]?.subject ?? "") : "", body: out.steps[i]?.body ?? "" })),
    });
  } catch (err) {
    console.error("[followup-draft]", err);
    return Response.json({ error: userMessage(err instanceof ScoutError ? err : null, "Couldn't draft follow-ups right now. Try again in a minute.") }, { status: 502 });
  }
}

export async function PUT(request: Request, { params }: Ctx) {
  if (!fromThisSite(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const got = await signedIn(request, params);
  if (got.error) return got.error;
  const { user, lead, id } = got;
  if ((STOPS_SEQUENCE as string[]).includes(lead.status)) return Response.json({ error: "This lead has already answered, so there's nothing to follow up." }, { status: 409 });
  let body: { steps?: unknown };
  try {
    body = await readJson(request, 40_000);
  } catch (err) {
    return badRequest(err)!;
  }
  const steps = parseSteps(body.steps).filter((s) => s.body);
  if (!steps.length) return Response.json({ error: "Each follow-up needs a message" }, { status: 400 });
  const database = await db();
  const now = Date.now();
  // Days count from the first message; a lead not contacted yet counts from now.
  const base = lead.contacted_at ?? now;
  await database.batch([
    database.prepare("UPDATE follow_ups SET status = 'cancelled' WHERE lead_id = ? AND status IN ('scheduled', 'due')").bind(id),
    ...steps
      .sort((a, b) => a.day - b.day)
      .map((s, i) =>
        database
          .prepare("INSERT INTO follow_ups (id, lead_id, user_id, step, channel, subject, body, due_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)")
          .bind(randomId(12), id, user.id, i + 1, s.channel, s.channel === "email" ? s.subject : null, s.channel === "email" ? withOptOut(s.body!) : s.body, Math.max(base + s.day * DAY, now), now),
      ),
  ]);
  return Response.json({ ok: true, scheduled: steps.length });
}

export async function DELETE(request: Request, { params }: Ctx) {
  if (!fromThisSite(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const got = await signedIn(request, params, false);
  if (got.error) return got.error;
  await (await db()).prepare("UPDATE follow_ups SET status = 'cancelled' WHERE lead_id = ? AND status IN ('scheduled', 'due')").bind(got.id).run();
  return Response.json({ ok: true });
}

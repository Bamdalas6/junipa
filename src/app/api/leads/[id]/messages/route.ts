import { randomId, currentUser, fromThisSite } from "@/lib/auth";
import { db } from "@/lib/db";
import { badRequest, rateLimit, readJson } from "@/lib/guard";
import { cleanChannel, ownLead, text } from "@/lib/leads";

export const dynamic = "force-dynamic";

// POST { channel, subject?, body, followUpId? } -> logs a message the user just sent.
// A Found lead becomes Contacted; a follow-up sent from the "due" list is marked sent.

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  if (!fromThisSite(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const limited = rateLimit(request, "lead-messages", 300, 10 * 60_000);
  if (limited) return limited;
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;
  if (!(await ownLead(user.id, id))) return Response.json({ error: "Lead not found" }, { status: 404 });
  let body: { channel?: unknown; subject?: unknown; body?: unknown; followUpId?: unknown };
  try {
    body = await readJson(request, 40_000);
  } catch (err) {
    return badRequest(err)!;
  }
  const message = text(body.body, 8000);
  if (!message) return Response.json({ error: "Message is empty" }, { status: 400 });
  const channel = cleanChannel(body.channel);
  const followUpId = typeof body.followUpId === "string" ? body.followUpId.slice(0, 40) : null;
  const database = await db();
  const now = Date.now();
  const statements = [
    database
      .prepare("INSERT INTO lead_messages (id, lead_id, user_id, channel, subject, body, kind, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(randomId(12), id, user.id, channel, text(body.subject, 300), message, followUpId ? "follow_up" : "message", now),
    database
      .prepare("UPDATE leads SET status = CASE WHEN status = 'found' THEN 'contacted' ELSE status END, contacted_at = COALESCE(contacted_at, ?), channel = COALESCE(channel, ?), updated_at = ? WHERE id = ?")
      .bind(now, channel, now, id),
  ];
  if (followUpId) {
    statements.push(database.prepare("UPDATE follow_ups SET status = 'sent', sent_at = ? WHERE id = ? AND lead_id = ? AND status IN ('scheduled', 'due')").bind(now, followUpId, id));
  }
  await database.batch(statements);
  return Response.json({ ok: true });
}

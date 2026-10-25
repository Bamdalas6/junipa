import { currentUser, fromThisSite } from "@/lib/auth";
import { db } from "@/lib/db";
import { badRequest, readJson } from "@/lib/guard";
import { isStatus, ownLead, text } from "@/lib/leads";
import { STOPS_SEQUENCE } from "@/lib/leads-shared";

export const dynamic = "force-dynamic";

// One lead.
//   PATCH  { status?, notes? } -> moving to Replied, Interested, Signed up or Not interested stops its follow-ups
//   DELETE                     -> removes the lead with its messages and follow-ups

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  if (!fromThisSite(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;
  const lead = await ownLead(user.id, id);
  if (!lead) return Response.json({ error: "Lead not found" }, { status: 404 });
  let body: { status?: unknown; notes?: unknown };
  try {
    body = await readJson(request, 20_000);
  } catch (err) {
    return badRequest(err)!;
  }
  if (body.status !== undefined && !isStatus(body.status)) return Response.json({ error: "Invalid status" }, { status: 400 });
  const database = await db();
  const now = Date.now();
  const status = body.status as string | undefined;
  const statements = [
    database
      .prepare("UPDATE leads SET status = COALESCE(?, status), notes = CASE WHEN ? THEN ? ELSE notes END, contacted_at = CASE WHEN ? IS NOT NULL AND ? != 'found' THEN COALESCE(contacted_at, ?) ELSE contacted_at END, updated_at = ? WHERE id = ?")
      .bind(status ?? null, body.notes !== undefined ? 1 : 0, text(body.notes, 4000), status ?? null, status ?? "", now, now, id),
  ];
  if (status && (STOPS_SEQUENCE as string[]).includes(status)) {
    statements.push(database.prepare("UPDATE follow_ups SET status = 'cancelled' WHERE lead_id = ? AND status IN ('scheduled', 'due')").bind(id));
  }
  await database.batch(statements);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, { params }: Ctx) {
  if (!fromThisSite(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;
  if (!(await ownLead(user.id, id))) return Response.json({ error: "Lead not found" }, { status: 404 });
  const database = await db();
  await database.batch([
    database.prepare("DELETE FROM follow_ups WHERE lead_id = ?").bind(id),
    database.prepare("DELETE FROM lead_messages WHERE lead_id = ?").bind(id),
    database.prepare("DELETE FROM leads WHERE id = ?").bind(id),
  ]);
  return Response.json({ ok: true });
}

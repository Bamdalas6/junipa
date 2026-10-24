import { currentUser, fromThisSite } from "@/lib/auth";
import { db } from "@/lib/db";
import { badRequest, rateLimit, readJson } from "@/lib/guard";

export const dynamic = "force-dynamic";

// The signed-in user's saved workspaces (the research for each website they ran).
//   GET                -> [{ domain, name, industry, updatedAt }]
//   GET ?domain=x.com  -> the full workspace, or null
//   PUT { workspace }  -> saves it (the newer copy wins)
//   DELETE ?domain=x   -> deletes one; DELETE ?all=1 deletes all

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const MAX_BYTES = 900_000; // D1 rows hold up to 2 MB; a workspace is usually 10-100 KB.
const noStore = { "Cache-Control": "private, no-store" };

async function signedIn(request: Request) {
  const user = await currentUser(request);
  return user ?? Response.json({ error: "Sign in to save your research." }, { status: 401 });
}

export async function GET(request: Request) {
  const user = await signedIn(request);
  if (user instanceof Response) return user;
  const domain = new URL(request.url).searchParams.get("domain")?.toLowerCase();
  const database = await db();
  if (domain) {
    if (!DOMAIN.test(domain)) return Response.json({ error: "Invalid domain" }, { status: 400 });
    const row = await database.prepare("SELECT data FROM workspaces WHERE user_id = ? AND domain = ?").bind(user.id, domain).first<{ data: string }>();
    return new Response(row?.data ?? "null", { headers: { "Content-Type": "application/json", ...noStore } });
  }
  const { results } = await database
    .prepare("SELECT domain, updated_at, json_extract(data, '$.profile.name') AS name, json_extract(data, '$.industry') AS industry FROM workspaces WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100")
    .bind(user.id)
    .all<{ domain: string; updated_at: number; name: string | null; industry: string | null }>();
  return Response.json(
    results.map((r) => ({ domain: r.domain, name: r.name ?? r.domain, industry: r.industry ?? "other", updatedAt: r.updated_at })),
    { headers: noStore },
  );
}

export async function PUT(request: Request) {
  if (!fromThisSite(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const limited = rateLimit(request, "workspaces-save", 300, 10 * 60_000);
  if (limited) return limited;
  const user = await signedIn(request);
  if (user instanceof Response) return user;
  let body: { workspace?: { domain?: unknown; updatedAt?: unknown; demo?: unknown } };
  try {
    body = await readJson(request, MAX_BYTES);
  } catch (err) {
    return badRequest(err)!;
  }
  const ws = body.workspace;
  const domain = typeof ws?.domain === "string" ? ws.domain.toLowerCase() : "";
  if (!ws || !DOMAIN.test(domain) || ws.demo === true) return Response.json({ error: "Invalid workspace" }, { status: 400 });
  const updatedAt = Math.min(Number(ws.updatedAt) || Date.now(), Date.now() + 60_000);
  // Only overwrite with a newer copy, so an old tab can't undo work saved from another device.
  await (await db())
    .prepare(
      "INSERT INTO workspaces (user_id, domain, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, domain) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at WHERE excluded.updated_at >= workspaces.updated_at",
    )
    .bind(user.id, domain, JSON.stringify(ws), updatedAt)
    .run();
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!fromThisSite(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const user = await signedIn(request);
  if (user instanceof Response) return user;
  const params = new URL(request.url).searchParams;
  const database = await db();
  if (params.get("all") === "1") await database.prepare("DELETE FROM workspaces WHERE user_id = ?").bind(user.id).run();
  else {
    const domain = params.get("domain")?.toLowerCase() ?? "";
    if (!DOMAIN.test(domain)) return Response.json({ error: "Invalid domain" }, { status: 400 });
    await database.prepare("DELETE FROM workspaces WHERE user_id = ? AND domain = ?").bind(user.id, domain).run();
  }
  return Response.json({ ok: true });
}

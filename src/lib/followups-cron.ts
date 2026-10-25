import { SCHEMA } from "./db-schema";

// The hourly Cron Trigger (see custom-worker.ts). It turns scheduled follow-ups whose day
// has come into "due" ones, which the pipeline page lists for one-click sending, and keeps
// each user under a daily limit so outreach stays at a pace inboxes and platforms accept.
// Anything over the limit stays scheduled and comes up in a later run.

interface Statement {
  bind(...values: unknown[]): Statement;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta?: { changes?: number } } | unknown>;
}
interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
}

const DAY = 86_400_000;

export async function runFollowUpCron(database: Database, now = Date.now(), dailyLimit = 30) {
  await database.batch(SCHEMA.map((sql) => database.prepare(sql)));

  // Safety net: a lead that answered (or said no) never gets another follow-up.
  const stopped = (await database
    .prepare(
      "UPDATE follow_ups SET status = 'cancelled' WHERE status IN ('scheduled', 'due') AND lead_id IN (SELECT id FROM leads WHERE status IN ('replied', 'interested', 'signed_up', 'not_interested'))",
    )
    .run()) as { meta?: { changes?: number } };

  // Follow-ups are part of Pro: only Pro subscribers' come due. Anyone else's stay
  // scheduled, so they pick up again if the person subscribes (again).
  const { results: waiting } = await database
    .prepare(
      `SELECT f.user_id, COUNT(*) AS n FROM follow_ups f
       JOIN subscriptions s ON s.user_id = f.user_id AND s.plan = 'pro' AND s.status IN ('active', 'trialing', 'past_due')
         AND (s.current_period_end IS NULL OR s.current_period_end > ?)
       WHERE f.status = 'scheduled' AND f.due_at <= ? GROUP BY f.user_id`,
    )
    .bind(now - 3 * DAY, now)
    .all<{ user_id: string; n: number }>();

  let marked = 0;
  let heldBack = 0;
  for (const { user_id, n } of waiting) {
    // How many this user already got in the last 24 hours (due or sent).
    const recent =
      (await database
        .prepare("SELECT COUNT(*) AS n FROM follow_ups WHERE user_id = ? AND due_marked_at > ?")
        .bind(user_id, now - DAY)
        .first<{ n: number }>())?.n ?? 0;
    const room = Math.max(0, dailyLimit - recent);
    const take = Math.min(room, n);
    if (take > 0) {
      await database
        .prepare(
          "UPDATE follow_ups SET status = 'due', due_marked_at = ? WHERE id IN (SELECT id FROM follow_ups WHERE user_id = ? AND status = 'scheduled' AND due_at <= ? ORDER BY due_at LIMIT ?)",
        )
        .bind(now, user_id, now, take)
        .run();
    }
    marked += take;
    heldBack += n - take;
  }
  return { cancelled: stopped?.meta?.changes ?? 0, marked, heldBack, users: waiting.length };
}

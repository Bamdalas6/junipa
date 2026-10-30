import { RANGES, type Range } from "./analytics-stats";
import { planOf } from "./billing";
import { db } from "./db";
import { isPlan } from "./plans";

// Money for the /mama dashboard, read from the payments ledger and the subscriptions table.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Money as whole cents per currency, e.g. { USD: 5800 }. */
export type Money = Record<string, number>;

export interface PaymentStats {
  range: Range;
  collected: Money;
  previous: Money;
  allTime: Money;
  payments: number;
  /** Cents per bucket in the main currency (USD), for the chart. */
  series: { at: number; cents: number; count: number }[];
  byProduct: { key: string; cents: number; count: number }[];
  /** Monthly recurring revenue from paying subscribers: yearly plans count as a twelfth. */
  mrr: Money;
  subscribers: { active: number; pastDue: number; cancelling: number; canceled: number };
  checkouts: { started: number; completed: number };
  recent: { at: number; email: string | null; product: string; kind: string; cents: number; currency: string }[];
  customers: { email: string | null; plan: string; interval: string; status: string; since: number; periodEnd: number | null; cancelling: boolean; amount: string | null; currency: string | null }[];
}

const add = (m: Money, currency: string, cents: number) => {
  m[currency] = (m[currency] ?? 0) + cents;
  return m;
};
const toMoney = (rows: { currency: string; cents: number }[]) => rows.reduce<Money>((m, r) => add(m, r.currency, r.cents), {});

export async function paymentStats(range: Range, tz: number): Promise<PaymentStats> {
  const now = Date.now();
  const { buckets, hourly } = RANGES[range];
  const bucketMs = hourly ? HOUR : DAY;
  const offset = tz * 60_000;
  const current = hourly ? Math.floor(now / HOUR) * HOUR : Math.floor((now + offset) / DAY) * DAY - offset;
  const start = current - (buckets - 1) * bucketMs;
  const prevStart = start - buckets * bucketMs;
  const database = await db();
  const q = <T>(sql: string, ...args: unknown[]) =>
    database
      .prepare(sql)
      .bind(...args)
      .all<T>()
      .then((r) => r.results);

  const [collected, previous, allTime, count, series, byProduct, subs, checkouts, recent, customers] = await Promise.all([
    q<{ currency: string; cents: number }>("SELECT currency, SUM(amount_cents) AS cents FROM payments WHERE paid_at >= ? GROUP BY currency", start),
    q<{ currency: string; cents: number }>("SELECT currency, SUM(amount_cents) AS cents FROM payments WHERE paid_at >= ? AND paid_at < ? GROUP BY currency", prevStart, start),
    q<{ currency: string; cents: number }>("SELECT currency, SUM(amount_cents) AS cents FROM payments GROUP BY currency"),
    q<{ n: number }>("SELECT COUNT(*) AS n FROM payments WHERE paid_at >= ?", start),
    q<{ b: number; cents: number; n: number }>(
      "SELECT CAST((paid_at - ?) / ? AS INTEGER) AS b, SUM(amount_cents) AS cents, COUNT(*) AS n FROM payments WHERE paid_at >= ? AND currency = 'USD' GROUP BY b",
      start,
      bucketMs,
      start,
    ),
    q<{ key: string; cents: number; count: number }>(
      "SELECT product AS key, SUM(amount_cents) AS cents, COUNT(*) AS count FROM payments WHERE paid_at >= ? GROUP BY product ORDER BY cents DESC",
      start,
    ),
    q<{ plan: string; status: string; cancel_at_period_end: number; interval: string; amount: string | null; currency: string | null }>(
      "SELECT plan, status, cancel_at_period_end, interval, amount, currency FROM subscriptions",
    ),
    q<{ started: number; completed: number }>(
      "SELECT COUNT(*) AS started, (SELECT COUNT(*) FROM payments WHERE kind = 'new' AND paid_at >= ?) AS completed FROM billing_checkouts WHERE created_at >= ?",
      start,
      start,
    ),
    q<{ paid_at: number; email: string | null; product: string; kind: string; amount_cents: number; currency: string }>(
      "SELECT p.paid_at, u.email, p.product, p.kind, p.amount_cents, p.currency FROM payments p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.paid_at DESC LIMIT 50",
    ),
    q<{ email: string | null; plan: string; interval: string; status: string; created_at: number; current_period_end: number | null; cancel_at_period_end: number; amount: string | null; currency: string | null }>(
      "SELECT u.email, s.plan, s.interval, s.status, s.created_at, s.current_period_end, s.cancel_at_period_end, s.amount, s.currency FROM subscriptions s LEFT JOIN users u ON u.id = s.user_id ORDER BY s.created_at DESC LIMIT 100",
    ),
  ]);

  const chart = Array.from({ length: buckets }, (_, i) => ({ at: start + i * bucketMs, cents: 0, count: 0 }));
  for (const r of series) if (chart[r.b]) Object.assign(chart[r.b], { cents: r.cents, count: r.n });

  const mrr: Money = {};
  const subscribers = { active: 0, pastDue: 0, cancelling: 0, canceled: 0 };
  for (const s of subs) {
    if (s.status === "canceled" || s.status === "unpaid") {
      subscribers.canceled++;
      continue;
    }
    if (s.status === "past_due") subscribers.pastDue++;
    else subscribers.active++;
    if (s.cancel_at_period_end) subscribers.cancelling++;
    // The amount Bachs reported, or the plan's listed price if it didn't say.
    const listed = isPlan(s.plan) ? (s.interval === "yearly" ? planOf(s.plan).yearly : planOf(s.plan).monthly) : 0;
    const cents = Math.round((Number(s.amount) || listed) * 100);
    if (s.status !== "trialing" && cents > 0) add(mrr, (s.currency || "USD").toUpperCase(), s.interval === "yearly" ? Math.round(cents / 12) : cents);
  }

  return {
    range,
    collected: toMoney(collected),
    previous: toMoney(previous),
    allTime: toMoney(allTime),
    payments: count[0]?.n ?? 0,
    series: chart,
    byProduct,
    mrr,
    subscribers,
    checkouts: { started: checkouts[0]?.started ?? 0, completed: checkouts[0]?.completed ?? 0 },
    recent: recent.map((r) => ({ at: r.paid_at, email: r.email, product: r.product, kind: r.kind, cents: r.amount_cents, currency: r.currency })),
    customers: customers.map((c) => ({
      email: c.email,
      plan: c.plan,
      interval: c.interval,
      status: c.status,
      since: c.created_at,
      periodEnd: c.current_period_end,
      cancelling: !!c.cancel_at_period_end,
      amount: c.amount,
      currency: c.currency,
    })),
  };
}

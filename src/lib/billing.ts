import { db } from "./db";
import { bachs, provider } from "./payments";
import { PLAN_LIST, isInterval, isPlan, type BillingStatus, type Entitled, type Interval, type Plan, type PlanId } from "./plans";

// Subscriptions on Bachs. A subscription starts when the customer completes a hosted
// checkout for one of the four recurring products (BACHS_PRODUCT_STARTER_MONTHLY, ...).
// Junia keeps a copy in D1 and re-reads it from Bachs every few hours and after each
// renewal date, so cancellations and failed payments take effect without webhooks.
//
// Founding members keep their price: a subscription stays on the product (and price) it
// started on. To charge new customers more, create new products and point the
// BACHS_PRODUCT_* settings at them; existing subscriptions are never moved.

const PRODUCT_ENV: Record<`${PlanId}_${Interval}`, string> = {
  starter_monthly: "BACHS_PRODUCT_STARTER_MONTHLY",
  starter_yearly: "BACHS_PRODUCT_STARTER_YEARLY",
  pro_monthly: "BACHS_PRODUCT_PRO_MONTHLY",
  pro_yearly: "BACHS_PRODUCT_PRO_YEARLY",
};
const PRICE_ENV: Record<`${PlanId}_${Interval}`, string> = {
  starter_monthly: "REACHLY_PRICE_STARTER_MONTHLY",
  starter_yearly: "REACHLY_PRICE_STARTER_YEARLY",
  pro_monthly: "REACHLY_PRICE_PRO_MONTHLY",
  pro_yearly: "REACHLY_PRICE_PRO_YEARLY",
};

export const productId = (plan: PlanId, interval: Interval) => process.env[PRODUCT_ENV[`${plan}_${interval}`]]?.trim() || "";

export function plans(): Plan[] {
  const prices = Object.fromEntries(Object.entries(PRICE_ENV).map(([k, env]) => [k, Number(process.env[env]) || undefined]).filter(([, v]) => v));
  return PLAN_LIST(prices);
}
export const planOf = (id: PlanId) => plans().find((p) => p.id === id)!;

export function subscriptionsEnabled() {
  return provider() === "bachs" && Object.values(PRODUCT_ENV).every((env) => process.env[env]?.trim());
}

/** Which plan and cadence a Bachs product ID belongs to. */
function fromProduct(id: string | undefined): { plan: PlanId; interval: Interval } | null {
  if (!id) return null;
  for (const [key, env] of Object.entries(PRODUCT_ENV)) {
    if (process.env[env]?.trim() === id) {
      const [plan, interval] = key.split("_");
      if (isPlan(plan) && isInterval(interval)) return { plan, interval };
    }
  }
  return null;
}

/* ---------- Bachs objects (fields as documented at docs.bachs.io) ---------- */

interface BachsSubscription {
  id: string;
  status?: string; // trialing | active | past_due | unpaid | canceled
  customer?: { customer_id?: string; email?: string } | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  amount?: string;
  currency?: string;
  product?: { id?: string } | null;
  metadata?: Record<string, string> | null;
}

/** Statuses that keep paid access. past_due is a grace period while Bachs retries the card. */
const PAYING = new Set(["active", "trialing", "past_due"]);
const STALE_MS = 6 * 3_600_000;

interface Row {
  user_id: string;
  subscription_id: string;
  customer_id: string | null;
  plan: string;
  interval: string;
  status: string;
  current_period_end: number | null;
  cancel_at_period_end: number;
  checked_at: number;
}

async function save(userId: string, s: BachsSubscription) {
  const which = fromProduct(s.product?.id) ?? (isPlan(s.metadata?.plan) && isInterval(s.metadata?.interval) ? { plan: s.metadata!.plan as PlanId, interval: s.metadata!.interval as Interval } : null);
  if (!which) throw new Error(`Subscription ${s.id} is for an unknown product`);
  const now = Date.now();
  const periodEnd = s.current_period_end ? Date.parse(s.current_period_end) || null : null;
  await (await db())
    .prepare(
      `INSERT INTO subscriptions (user_id, subscription_id, customer_id, plan, interval, status, current_period_end, cancel_at_period_end, amount, currency, checked_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET subscription_id = excluded.subscription_id, customer_id = COALESCE(excluded.customer_id, subscriptions.customer_id),
         plan = excluded.plan, interval = excluded.interval, status = excluded.status, current_period_end = excluded.current_period_end,
         cancel_at_period_end = excluded.cancel_at_period_end, amount = excluded.amount, currency = excluded.currency, checked_at = excluded.checked_at, updated_at = excluded.updated_at`,
    )
    .bind(userId, s.id, s.customer?.customer_id ?? null, which.plan, which.interval, String(s.status ?? "active"), periodEnd, s.cancel_at_period_end ? 1 : 0, s.amount ?? null, s.currency ?? null, now, now, now)
    .run();
}

/** The user's subscription, refreshed from Bachs when it may have changed. */
async function current(userId: string): Promise<Row | null> {
  const database = await db();
  let row = await database.prepare("SELECT * FROM subscriptions WHERE user_id = ?").bind(userId).first<Row>();
  if (!row || provider() !== "bachs") return row;
  const due = Date.now() - row.checked_at > STALE_MS || (row.current_period_end !== null && row.current_period_end < Date.now());
  if (due && row.status !== "canceled") {
    try {
      await save(userId, await bachs<BachsSubscription>(`/v1/subscriptions/${encodeURIComponent(row.subscription_id)}`));
      row = await database.prepare("SELECT * FROM subscriptions WHERE user_id = ?").bind(userId).first<Row>();
    } catch (e) {
      // Bachs unreachable: keep the last known state for now and try again next time.
      console.error("[billing] refresh failed:", (e as Error).message);
    }
  }
  return row;
}

/** The plan this user can use right now. */
export async function entitlement(userId: string): Promise<Entitled> {
  const row = await current(userId);
  return row && PAYING.has(row.status) && isPlan(row.plan) ? row.plan : "free";
}

export async function billingStatus(userId: string | null): Promise<BillingStatus> {
  const row = userId ? await current(userId) : null;
  const paying = !!row && PAYING.has(row.status) && isPlan(row.plan);
  return {
    enabled: subscriptionsEnabled(),
    plan: paying ? (row!.plan as PlanId) : "free",
    interval: paying && isInterval(row!.interval) ? row!.interval : null,
    status: row?.status ?? null,
    periodEnd: row?.current_period_end ?? null,
    cancelAtPeriodEnd: !!row?.cancel_at_period_end,
    plans: plans(),
  };
}

/* ---------- Checkout, confirmation and the customer portal ---------- */

export async function startSubscription(opts: { userId: string; email: string; plan: PlanId; interval: Interval; successUrl: string; cancelUrl: string }) {
  const product = productId(opts.plan, opts.interval);
  if (!product) throw new Error("Plan not set up");
  const d = await bachs<{ checkout_id?: string; checkout_url?: string; id?: string; url?: string }>("/v1/checkout-sessions", {
    method: "POST",
    body: JSON.stringify({
      product_cart: [{ product_id: product, quantity: 1 }],
      customer: { email: opts.email },
      customer_creation: "always",
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      reference: `sub:${opts.userId}:${opts.plan}:${opts.interval}:${Date.now()}`.slice(0, 128),
      // Copied onto the subscription by Bachs, so it can be matched back to this account.
      metadata: { product: "subscription", user_id: opts.userId, plan: opts.plan, interval: opts.interval },
    }),
  });
  const url = d.checkout_url ?? d.url;
  const id = d.checkout_id ?? d.id;
  if (!url || !id) throw new Error("Bachs returned no checkout URL");
  const host = new URL(url);
  if (host.protocol !== "https:" || !(host.hostname === "bachs.io" || host.hostname.endsWith(".bachs.io"))) throw new Error(`Unexpected checkout URL host: ${host.hostname}`);
  await (await db())
    .prepare("INSERT INTO billing_checkouts (checkout_id, user_id, plan, interval, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, opts.userId, opts.plan, opts.interval, Date.now())
    .run();
  return url;
}

/**
 * After checkout: finds the subscription that this user's checkout created and saves it.
 * Without a checkout ID (Bachs doesn't always add one to the return address), uses the
 * user's most recent checkout from the last two hours.
 */
export async function confirmSubscription(userId: string, checkoutId?: string): Promise<boolean> {
  const database = await db();
  const ck = checkoutId
    ? await database.prepare("SELECT checkout_id FROM billing_checkouts WHERE checkout_id = ? AND user_id = ?").bind(checkoutId, userId).first<{ checkout_id: string }>()
    : await database
        .prepare("SELECT checkout_id FROM billing_checkouts WHERE user_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1")
        .bind(userId, Date.now() - 2 * 3_600_000)
        .first<{ checkout_id: string }>();
  if (!ck) return false;
  const session = await bachs<{ status?: string; payment_status?: string }>(`/v1/checkout-sessions/${encodeURIComponent(ck.checkout_id)}`);
  if (!/^complete/.test(String(session.status ?? ""))) return false;
  // The subscription carries our metadata and Bachs' own checkout_id key.
  const page = await bachs<{ items?: BachsSubscription[] }>("/v1/subscriptions?limit=100");
  const sub = (page.items ?? []).find((s) => s.metadata?.checkout_id === ck.checkout_id) ?? (page.items ?? []).find((s) => s.metadata?.user_id === userId && PAYING.has(String(s.status)));
  if (!sub || sub.metadata?.user_id !== userId) return false;
  await save(userId, sub);
  return true;
}

/** A short-lived link to Bachs' customer portal (change plan, card, cancel). */
export async function portalUrl(userId: string): Promise<string | null> {
  const row = await current(userId);
  if (!row?.customer_id) return null;
  const d = await bachs<{ url?: string }>(`/v1/customers/${encodeURIComponent(row.customer_id)}/portal-sessions`, { method: "POST" });
  if (!d.url) return null;
  const host = new URL(d.url);
  return host.protocol === "https:" && (host.hostname === "bachs.io" || host.hostname.endsWith(".bachs.io")) ? d.url : null;
}

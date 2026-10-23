import crypto from "node:crypto";

// Paid unlock for the last two steps (decision makers + outreach), sold per
// campaign in two tiers. Paystack takes the payment; the server then signs an
// unlock token tied to workspace + campaign + tier, and /api/run checks it and
// applies the tier's limits before running paid phases.

export type TierId = "starter" | "pro";

export interface Tier {
  id: TierId;
  name: string;
  price: number; // USD charged (after any founding discount)
  listPrice: number; // USD before the discount
  blurb: string;
  accounts: number; // prospect accounts that get decision makers
  peoplePerAccount: number;
  verifiedEmails: boolean;
  features: string[];
  highlight?: boolean;
}

export const CURRENCY = "USD";

/**
 * Founding-customer offer: REACHLY_FOUNDING_DISCOUNT=50 takes 50% off every plan at
 * checkout (the server charges and verifies the discounted price). Turn it off by
 * removing the setting once the founding spots (REACHLY_FOUNDING_SPOTS, default 20)
 * are taken; the site doesn't count them for you.
 */
export const FOUNDING = {
  percent: Math.min(90, Math.max(0, Math.round(Number(process.env.REACHLY_FOUNDING_DISCOUNT) || 0))),
  spots: Math.max(1, Math.round(Number(process.env.REACHLY_FOUNDING_SPOTS) || 20)),
};
const charged = (list: number) => (FOUNDING.percent ? Math.round(list * (100 - FOUNDING.percent)) / 100 : list);

export const TIERS: Record<TierId, Tier> = {
  starter: {
    id: "starter",
    name: "Starter",
    price: charged(Number(process.env.REACHLY_PRICE_STARTER_USD || 19)),
    listPrice: Number(process.env.REACHLY_PRICE_STARTER_USD || 19),
    blurb: "For testing a new audience",
    accounts: 8,
    peoplePerAccount: 1,
    verifiedEmails: false,
    features: ["Decision makers for up to 8 accounts", "1 key person per account", "4-touch DM, email and WhatsApp sequence", "One-click send links and CSV export"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: charged(Number(process.env.REACHLY_PRICE_PRO_USD || 49)),
    listPrice: Number(process.env.REACHLY_PRICE_PRO_USD || 49),
    blurb: "For running a full campaign",
    accounts: 20,
    peoplePerAccount: 2,
    verifiedEmails: true,
    features: ["Decision makers for up to 20 accounts", "Up to 2 people per account", "Verified work emails where available", "4-touch DM, email and WhatsApp sequence", "One-click send links and CSV export"],
    highlight: true,
  },
};

export const isTier = (t: unknown): t is TierId => t === "starter" || t === "pro";

/** One-time social growth plan. Unlocks the full plan for the same handles for 30 days. */
export const SOCIAL = {
  id: "social",
  name: "Social growth plan",
  price: charged(Number(process.env.REACHLY_PRICE_SOCIAL_USD || 9)),
  listPrice: Number(process.env.REACHLY_PRICE_SOCIAL_USD || 9),
  days: 30,
  features: [
    "Rewritten bio for every account",
    "Top fixes, ranked by impact",
    "Content pillars with post ideas",
    "What to post and when, per platform",
    "10 hooks, hashtags and collab ideas",
    "A 30-day checklist and KPIs",
  ],
};

/** Which processor takes payments. Bachs wins when both keys are set. */
export function provider(): "bachs" | "paystack" | null {
  const bachsKey = process.env.BACHS_SECRET_KEY;
  if (bachsKey) {
    // A sandbox key on the live site would let Bachs' test cards unlock real campaigns.
    if (process.env.NODE_ENV === "production" && bachsKey.startsWith("sk_sandbox_") && process.env.REACHLY_ALLOW_SANDBOX !== "1") {
      console.error("[payments] BACHS_SECRET_KEY is a sandbox key in production; payments are switched off. Use sk_live_..., or set REACHLY_ALLOW_SANDBOX=1 on a test deployment.");
      return null;
    }
    return "bachs";
  }
  if (process.env.PAYSTACK_SECRET_KEY) return "paystack";
  return null;
}

export function paymentsEnabled() {
  return provider() !== null;
}

const PAID_PHASES = new Set(["contacts", "outreach"]);
export const isPaidPhase = (phase: string) => PAID_PHASES.has(phase);

/** Free "test unlock" tokens: only while Paystack isn't connected, and never in production unless switched on. */
export function testUnlockAllowed() {
  return !paymentsEnabled() && (process.env.NODE_ENV !== "production" || process.env.REACHLY_ALLOW_TEST_UNLOCK === "1");
}

// Test unlocks stop working the moment real payments are switched on.
const isTestRef = (ref: string | undefined) => !ref || ref.startsWith("test_");

function signingSecret() {
  const secret = process.env.REACHLY_SIGNING_SECRET || process.env.BACHS_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY;
  if (secret) return secret;
  // A fixed fallback would let anyone forge unlock tokens, so production refuses to run without a secret.
  if (process.env.NODE_ENV === "production") throw new Error("Set REACHLY_SIGNING_SECRET (a long random string) before running in production.");
  return "reachly-dev-only-secret";
}

/** Token = base64url("domain|campaign|tier|reference|expiry") + "." + HMAC. Valid for a year. */
export function signUnlock(domain: string, campaign: string, tier: TierId, reference: string) {
  const payload = [domain, campaign, tier, reference, Date.now() + 365 * 24 * 3600 * 1000].join("|");
  const sig = crypto.createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

/** Returns the tier the token unlocks for this workspace + campaign, or null. */
export function verifyUnlock(token: string | undefined, domain: string, campaign: string | undefined): TierId | null {
  if (!token || !campaign || token.length > 600) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const payload = Buffer.from(body, "base64url").toString();
  const expected = crypto.createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const [d, c, tier, ref, exp] = payload.split("|");
  if (isTestRef(ref) && !testUnlockAllowed()) return null;
  return d === domain && c === campaign && isTier(tier) && Number(exp) > Date.now() ? tier : null;
}

/* ---------- Social plan unlocks + sealing ---------- */

/** Token = base64url("social|key|reference|expiry") + "." + HMAC, valid 30 days for one set of handles. */
export function signSocial(key: string, reference: string) {
  const payload = ["social", key, reference, Date.now() + SOCIAL.days * 24 * 3600 * 1000].join("|");
  const sig = crypto.createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export function verifySocial(token: string | undefined, key: string) {
  if (!token || token.length > 600) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const payload = Buffer.from(body, "base64url").toString();
  const expected = crypto.createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  const [kind, k, ref, exp] = payload.split("|");
  if (isTestRef(ref) && !testUnlockAllowed()) return false;
  return kind === "social" && k === key && Number(exp) > Date.now();
}

/** Stable id for a set of handles, so the same accounts can be re-run while unlocked. */
export function handlesKey(handles: { platform: string; handle: string }[]) {
  const source = handles
    .map((h) => `${h.platform}:${h.handle.toLowerCase()}`)
    .sort()
    .join(",");
  return crypto.createHash("sha256").update(source).digest("hex").slice(0, 20);
}

// The locked part of a plan goes to the browser encrypted (AES-256-GCM), so it
// can't be read before payment and the server doesn't need a database.
const sealKey = () => crypto.createHash("sha256").update(`${signingSecret()}|seal`).digest();

export function seal(data: unknown) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", sealKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function unseal<T>(sealed: string): T {
  const raw = Buffer.from(sealed, "base64url");
  const decipher = crypto.createDecipheriv("aes-256-gcm", sealKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")) as T;
}

/* ---------- Bachs (checkout sessions) ---------- */
// docs.bachs.io: the server creates a checkout session for the exact campaign and
// plan (metadata), the buyer pays on Bachs' hosted page, and on return the server
// reads the session back and only then signs the unlock. Sandbox keys start
// sk_sandbox_, live keys sk_live_.

const bachsBase = () => (process.env.BACHS_SECRET_KEY?.startsWith("sk_live_") ? "https://api.bachs.io" : "https://sandbox-api.bachs.io");

async function bachs<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${bachsBase()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.BACHS_SECRET_KEY}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Bachs error ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  // Responses may come wrapped in { data } or bare.
  return (json.data && typeof json.data === "object" ? json.data : json) as T;
}

// Shape of a checkout session as the Bachs sandbox returns it (checked 2026-10-23).
interface BachsCheckout {
  checkout_id?: string;
  id?: string;
  checkout_url?: string;
  url?: string;
  status?: string; // "open" until paid
  payment_status?: string; // "requires_payment_method" until paid
  amount?: string; // decimal string, e.g. "19.00"
  currency?: string;
  charge?: { status?: string; amount_paid?: string; currency?: string } | null;
  metadata?: Record<string, string> | null;
}

async function bachsCreate(opts: { amountUsd: number; email: string; successUrl: string; cancelUrl: string; reference: string; metadata: Record<string, string> }) {
  const data = await bachs<BachsCheckout>("/v1/checkout-sessions", {
    method: "POST",
    body: JSON.stringify({
      pricing: { currency: CURRENCY, amount: opts.amountUsd.toFixed(2) },
      customer: { email: opts.email },
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      reference: opts.reference.slice(0, 128),
      metadata: opts.metadata,
    }),
  });
  const url = data.checkout_url ?? data.url;
  const id = data.checkout_id ?? data.id;
  if (!url || !id) throw new Error("Bachs returned no checkout URL");
  // Only ever send buyers to Bachs' own checkout over HTTPS.
  const host = new URL(url);
  if (host.protocol !== "https:" || !(host.hostname === "bachs.io" || host.hostname.endsWith(".bachs.io"))) throw new Error(`Unexpected checkout URL host: ${host.hostname}`);
  return { url, reference: id };
}

/** Reads a checkout back from Bachs. Returns its metadata only if it was paid in full.
 * A paid checkout reads status "completed" and payment_status "succeeded". Its amount and
 * currency stay the USD price we set, even when the buyer paid in local currency (e.g. NGN). */
async function bachsPaid(checkoutId: string, minUsd: number): Promise<Record<string, string> | null> {
  if (!/^chk_[A-Za-z0-9_-]{4,80}$/.test(checkoutId)) return null;
  const d = await bachs<BachsCheckout>(`/v1/checkout-sessions/${encodeURIComponent(checkoutId)}`);
  const status = String(d.status ?? "").toLowerCase();
  const payment = String(d.payment_status ?? "").toLowerCase();
  const charge = String(d.charge?.status ?? "").toLowerCase();
  const paid = payment === "succeeded" && (status === "completed" || status === "complete") && (!charge || charge === "succeeded");
  const priced = String(d.currency ?? "").toUpperCase() === CURRENCY && Number(d.amount ?? 0) >= minUsd - 0.001;
  return paid && priced ? (d.metadata ?? {}) : null;
}

/* ---------- Paystack ---------- */

const PAYSTACK = "https://api.paystack.co";

async function paystack<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PAYSTACK}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
  if (!res.ok || !json.status || !json.data) throw new Error(json.message || `Paystack error ${res.status}`);
  return json.data;
}

const cents = (usd: number) => Math.round(usd * 100);

function paystackUrl(url: string) {
  const u = new URL(url);
  if (u.protocol !== "https:" || !(u.hostname === "paystack.com" || u.hostname.endsWith(".paystack.com") || u.hostname.endsWith(".paystack.co"))) throw new Error(`Unexpected checkout URL host: ${u.hostname}`);
  return url;
}

function parseMeta<T>(meta: unknown): T | undefined {
  if (typeof meta !== "string") return meta as T | undefined;
  try {
    return JSON.parse(meta || "{}") as T;
  } catch {
    return undefined;
  }
}

export async function startCheckout(opts: { domain: string; campaign: string; tier: TierId; email: string; callbackUrl: string; cancelUrl?: string }) {
  const tier = TIERS[opts.tier];
  if (provider() === "bachs")
    return bachsCreate({
      amountUsd: tier.price,
      email: opts.email,
      successUrl: opts.callbackUrl,
      cancelUrl: opts.cancelUrl ?? opts.callbackUrl,
      reference: `${opts.domain}:${opts.campaign}:${tier.id}:${Date.now()}`,
      metadata: { product: "campaign", domain: opts.domain, campaign: opts.campaign, tier: tier.id },
    });
  const data = await paystack<{ authorization_url: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: opts.email,
      amount: cents(tier.price),
      currency: CURRENCY,
      callback_url: opts.callbackUrl,
      metadata: { domain: opts.domain, campaign: opts.campaign, tier: tier.id },
    }),
  });
  return { url: paystackUrl(data.authorization_url), reference: data.reference };
}

/** Confirms a Paystack payment succeeded for this workspace + campaign; returns the tier paid for. */
export async function confirmPayment(reference: string, domain: string, campaign: string): Promise<TierId | null> {
  if (provider() === "bachs") {
    // The cheapest plan sets the floor here; the tier in our own metadata then decides the plan.
    const meta = await bachsPaid(reference, Math.min(TIERS.starter.price, TIERS.pro.price));
    if (!meta || meta.product !== "campaign" || meta.domain !== domain || meta.campaign !== campaign || !isTier(meta.tier)) return null;
    // Re-check the amount against that tier (a Starter payment never unlocks Pro).
    return (await bachsPaid(reference, TIERS[meta.tier].price)) ? meta.tier : null;
  }
  type Meta = { domain?: string; campaign?: string; tier?: string };
  const data = await paystack<{ status: string; amount: number; currency: string; metadata?: Meta | string }>(`/transaction/verify/${encodeURIComponent(reference)}`);
  const meta = parseMeta<Meta>(data.metadata);
  if (data.status !== "success" || data.currency !== CURRENCY || meta?.domain !== domain || meta?.campaign !== campaign || !isTier(meta?.tier)) return null;
  return data.amount >= cents(TIERS[meta.tier].price) ? meta.tier : null;
}

export async function startSocialCheckout(opts: { key: string; email: string; callbackUrl: string; cancelUrl?: string }) {
  if (provider() === "bachs")
    return bachsCreate({
      amountUsd: SOCIAL.price,
      email: opts.email,
      successUrl: opts.callbackUrl,
      cancelUrl: opts.cancelUrl ?? opts.callbackUrl,
      reference: `social:${opts.key}:${Date.now()}`,
      metadata: { product: SOCIAL.id, key: opts.key },
    });
  const data = await paystack<{ authorization_url: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: opts.email,
      amount: cents(SOCIAL.price),
      currency: CURRENCY,
      callback_url: opts.callbackUrl,
      metadata: { product: SOCIAL.id, key: opts.key },
    }),
  });
  return { url: paystackUrl(data.authorization_url), reference: data.reference };
}

export async function confirmSocialPayment(reference: string, key: string) {
  if (provider() === "bachs") {
    const meta = await bachsPaid(reference, SOCIAL.price);
    return !!meta && meta.product === SOCIAL.id && meta.key === key;
  }
  type Meta = { product?: string; key?: string };
  const data = await paystack<{ status: string; amount: number; currency: string; metadata?: Meta | string }>(`/transaction/verify/${encodeURIComponent(reference)}`);
  const meta = parseMeta<Meta>(data.metadata);
  return data.status === "success" && data.currency === CURRENCY && meta?.product === SOCIAL.id && meta?.key === key && data.amount >= cents(SOCIAL.price);
}

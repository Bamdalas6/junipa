"use client";

import { Check, CreditCard, Landmark, Loader2, Lock, ShieldCheck } from "lucide-react";
import { CONTACT } from "@/lib/contact";
import { rememberCheckout } from "@/lib/pending-pay";
import { useEffect, useState } from "react";
import { Badge, Button } from "./ui";

export interface Tier {
  id: "starter" | "pro";
  name: string;
  price: number; // charged, after any founding discount
  listPrice: number;
  blurb: string;
  accounts: number;
  peoplePerAccount: number;
  verifiedEmails: boolean;
  features: string[];
  highlight?: boolean;
}

export interface PayConfig {
  enabled: boolean;
  /** Free test unlocks work (payments off, and on your own computer or switched on by hand). */
  testUnlock?: boolean;
  provider?: "bachs" | "paystack" | null;
  founding?: { percent: number; spots: number } | null;
  currency: string;
  tiers: Tier[];
  social?: { id: string; name: string; price: number; listPrice: number; days: number; features: string[] };
}

export const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);

export function usePayConfig() {
  const [config, setConfig] = useState<PayConfig | null>(null);
  useEffect(() => {
    fetch("/api/pay/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);
  return config;
}

/** Shown in place of the paid steps until this campaign is unlocked. */
export function Paywall({
  brand,
  domain,
  industry,
  demo,
  prospects,
  campaign,
  campaignId,
  onUnlocked,
}: {
  brand: string;
  domain: string;
  industry: string;
  demo: boolean;
  prospects: number;
  campaign?: string;
  campaignId: string;
  onUnlocked: (token: string, tier: string) => void;
}) {
  const config = usePayConfig();
  const [tier, setTier] = useState<"starter" | "pro">("pro");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chosen = config?.tiers.find((t) => t.id === tier);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/pay/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, email, industry, campaign: campaignId, tier }),
      });
      const data = (await res.json()) as { url?: string; reference?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Couldn't start the payment.");
      if (data.reference) rememberCheckout({ kind: "campaign", ref: data.reference, domain, campaign: campaignId });
      window.location.href = data.url; // the processor's hosted checkout page
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the payment.");
      setBusy(false);
    }
  }

  async function testUnlock() {
    setBusy(true);
    setError("");
    if (demo) {
      onUnlocked("demo", tier); // demo runs only return sample data, so nothing to protect
      return;
    }
    try {
      const res = await fetch("/api/pay/test-unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain, campaign: campaignId, tier }) });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) throw new Error(data.error || "Couldn't unlock.");
      onUnlocked(data.token, tier);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't unlock.");
      setBusy(false);
    }
  }

  return (
    <div className="card-raised rise overflow-hidden">
      <div className="border-b border-line p-6 sm:p-8">
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">
            <Lock className="size-3" /> Steps 5 and 6 · per campaign
          </Badge>
          {config?.founding && <Badge tone="good">Founding customer · {config.founding.percent}% off</Badge>}
        </span>
        <h2 className="mt-4 text-[24px] font-semibold leading-tight tracking-[-0.025em] sm:text-[28px]">Unlock decision makers and outreach</h2>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
          Scout found {prospects} prospect{prospects === 1 ? "" : "s"} for {brand}
          {campaign ? ` in the ${campaign.toLowerCase()} campaign` : ""}. Pick a plan to see who decides at each one and get a ready-to-send sequence. You pay once
          for this campaign.
        </p>
      </div>

      <div className="grid gap-4 p-6 sm:p-8 md:grid-cols-2" role="radiogroup" aria-label="Plan">
        {(config?.tiers ?? []).map((t) => {
          const on = t.id === tier;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setTier(t.id)}
              className={`relative rounded-[10px] border p-5 text-left transition-all ${on ? "border-accent bg-white shadow-[0_0_0_3px_#4c5bd41f]" : "border-line bg-white hover:border-line-2"}`}
            >
              {t.highlight && (
                <span className="absolute -top-2.5 right-4 inline-flex items-center gap-1 rounded bg-accent-soft px-1.5 py-px font-mono text-[11px] text-accent ring-1 ring-accent/15">
                  most popular
                </span>
              )}
              <div className="flex items-center justify-between">
                <p className="text-[16px] font-semibold">{t.name}</p>
                <span className={`grid size-5 place-items-center rounded-full border-2 ${on ? "border-accent" : "border-line-2"}`}>{on && <span className="size-2.5 rounded-full bg-accent" />}</span>
              </div>
              <p className="text-[12.5px] text-muted">{t.blurb}</p>
              <p className="mt-4 flex items-baseline gap-1.5">
                <span className="text-[40px] font-semibold leading-none tracking-[-0.04em]">{usd(t.price)}</span>
                {t.listPrice > t.price && <span className="text-[15px] text-faint line-through">{usd(t.listPrice)}</span>}
                <span className="text-[12.5px] text-muted">/ campaign</span>
              </p>
              <ul className="mt-4 space-y-2">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[13px] text-ink-2">
                    <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full ${on ? "bg-accent-soft text-accent" : "bg-good-soft text-good"}`}>
                      <Check className="size-2.5" strokeWidth={3} />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
        {!config && [0, 1].map((i) => <div key={i} className="skeleton h-72 rounded-[10px]" />)}
      </div>

      <div className="border-t border-line bg-subtle p-6 sm:p-8">
        {config?.enabled ? (
          <form onSubmit={pay} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block flex-1">
              <span className="text-[12.5px] font-medium text-ink-2">Email for your receipt</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@brand.com"
                autoComplete="email"
                className="mt-1.5 h-11 w-full rounded-[10px] border border-line bg-white px-3.5 text-[14px] outline-none focus:border-accent focus:ring-3 focus:ring-accent/10"
              />
            </label>
            <Button type="submit" variant="primary" size="lg" disabled={busy || !chosen}>
              {busy ? <Loader2 className="spin size-4" /> : <Lock className="size-4" />}
              Pay {chosen ? usd(chosen.price) : ""} · {chosen?.name}
            </Button>
          </form>
        ) : !demo && config && !config.testUnlock ? (
          <p className="rounded-[10px] border border-line bg-white p-4 text-[14px] text-ink-2">
            Decision makers and outreach open very soon. Your research so far is saved in this browser, so come back to pick up where you left off.
          </p>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <p className="flex-1 rounded-[10px] border border-warn/25 bg-warn-soft/70 p-3 text-[12.5px] text-ink-2">
              {demo ? (
                <>This is a demo workspace, so unlocking is free.</>
              ) : (
                <>
                  Payments aren&apos;t connected yet. Add <code className="rounded bg-white px-1 font-mono text-[11.5px]">BACHS_SECRET_KEY</code> to take real payments. Until then you can unlock for testing.
                </>
              )}
            </p>
            <Button variant="primary" size="lg" onClick={testUnlock} disabled={busy || !chosen}>
              {busy ? <Loader2 className="spin size-4" /> : <Lock className="size-4" />}
              {demo ? `Unlock ${chosen?.name ?? ""} demo (free)` : `Unlock ${chosen?.name ?? ""} for testing`}
            </Button>
          </div>
        )}
        {error && <p className="mt-3 text-[13px] text-bad">{error}</p>}
        <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-good" /> Secure checkout by {config?.provider === "paystack" ? "Paystack" : "Bachs"}
          </span>
          <span className="inline-flex items-center gap-1">
            <CreditCard className="size-3.5" /> Card
          </span>
          <span>
            Payment trouble?{" "}
            <a href={`mailto:${CONTACT.support}`} className="text-accent hover:underline">
              {CONTACT.support}
            </a>
          </span>
          {config?.provider === "paystack" && (
            <span className="inline-flex items-center gap-1">
              <Landmark className="size-3.5" /> Bank transfer
            </span>
          )}
          <span>Charged in USD, once per campaign</span>
        </p>
      </div>
    </div>
  );
}

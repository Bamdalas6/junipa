"use client";

import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import type { BillingStatus, Interval, PlanId } from "@/lib/plans";
import { money, subscribe } from "@/lib/useBilling";
import { useAuth } from "./Auth";

/** Monthly / yearly switch. Yearly is eleven months' price: one month free. */
export function IntervalToggle({ value, onChange }: { value: Interval; onChange: (v: Interval) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-white p-1" role="radiogroup" aria-label="Billing period">
      {(["monthly", "yearly"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium ${value === v ? "bg-ink text-white" : "text-ink-2 hover:bg-subtle"}`}
        >
          {v === "monthly" ? "Monthly" : "Yearly"}
          {v === "yearly" && <span className={`rounded px-1 py-px font-mono text-[10.5px] ${value === v ? "bg-white/20" : "bg-good-soft text-good"}`}>1 month free</span>}
        </button>
      ))}
    </div>
  );
}

/** The two subscription plans with a checkout button each (paywall and billing page). */
export function PlanCards({ billing, back, compact }: { billing: BillingStatus | null; back?: string; compact?: boolean }) {
  const { open } = useAuth();
  const [interval, setPeriod] = useState<Interval>("monthly");
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState("");
  const plans = billing?.plans ?? [];

  const choose = async (plan: PlanId) => {
    setBusy(plan);
    setError("");
    const err = await subscribe(plan, interval, open, back);
    if (err) setError(err);
    setBusy(null);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <IntervalToggle value={interval} onChange={setPeriod} />
        <p className="text-[12.5px] text-muted">Founding members keep their price for as long as they stay subscribed.</p>
      </div>
      <div className={`mt-4 grid gap-3 ${compact ? "md:grid-cols-2" : "lg:grid-cols-2"}`}>
        {plans.map((p) => {
          const price = interval === "monthly" ? p.monthly : p.yearly;
          const current = billing?.plan === p.id;
          return (
            <div key={p.id} className={`flex flex-col rounded-[12px] border p-5 ${p.highlight ? "border-accent/40 bg-white shadow-[0_0_0_3px_#4f46e510]" : "border-line bg-white"}`}>
              <div className="flex items-center gap-2">
                <h3 className="text-[16px] font-semibold">{p.name}</h3>
                {p.highlight && <span className="rounded bg-accent-soft px-1.5 py-px font-mono text-[11px] text-accent">most popular</span>}
                {current && <span className="rounded bg-good-soft px-1.5 py-px font-mono text-[11px] text-good">your plan</span>}
              </div>
              <p className="mt-3 flex items-baseline gap-1.5">
                <span className="text-[34px] font-semibold leading-none tracking-[-0.03em]">{money(price)}</span>
                <span className="font-mono text-[12px] text-muted">/ {interval === "monthly" ? "month" : "year"}</span>
              </p>
              {interval === "yearly" && <p className="mt-1 text-[12px] text-good">{money(p.monthly * 12 - p.yearly)} less than paying monthly</p>}
              <p className="mt-2 text-[14px] text-muted">{p.blurb}</p>
              <ul className="mt-4 flex-1 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[13.5px]">
                    <Check className={`mt-0.5 size-4 shrink-0 ${p.highlight ? "text-accent" : "text-good"}`} />
                    {f}
                  </li>
                ))}
              </ul>
              {billing && !billing.enabled ? (
                <p className="mt-5 rounded-lg border border-line bg-subtle px-3 py-2.5 text-center text-[13px] text-ink-2">Subscriptions open very soon.</p>
              ) : billing?.plan !== "free" ? (
                <a href="/billing" className="mt-5 inline-flex h-10 items-center justify-center rounded-lg border border-line-2 bg-white text-[14px] font-semibold hover:border-ink/30">
                  {current ? "Manage your plan" : `Switch to ${p.name}`}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => choose(p.id)}
                  disabled={!!busy || !billing}
                  className={`mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg text-[14px] font-semibold disabled:opacity-60 ${p.highlight ? "bg-ink text-white hover:bg-ink-2" : "border border-line-2 bg-white hover:border-ink/30"}`}
                >
                  {busy === p.id && <Loader2 className="spin size-4" />} Get {p.name}
                </button>
              )}
            </div>
          );
        })}
        {!billing && [0, 1].map((i) => <div key={i} className="skeleton h-80 rounded-[12px]" />)}
      </div>
      {error && <p className="mt-3 text-[13px] text-bad">{error}</p>}
      <p className="mt-3 text-[12px] text-faint">
        Renews automatically until you cancel; cancel any time from Billing. By subscribing you agree to our{" "}
        <a href="/terms" className="underline hover:text-ink">
          Terms
        </a>
        .
      </p>
    </div>
  );
}

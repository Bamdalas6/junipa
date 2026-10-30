"use client";

import { ArrowLeft, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CONTACT } from "@/lib/contact";
import type { BillingStatus } from "@/lib/plans";
import { money, useBilling } from "@/lib/useBilling";
import { AccountButton, useAuth } from "./Auth";
import { PlanCards } from "./Plans";
import { ThemeToggle } from "./ThemeToggle";
import { Button, Logo } from "./ui";

// Billing: the current plan, a link to Bachs' customer portal to change or cancel it,
// and the plans for anyone not subscribed. With `confirming`, this is the page Bachs
// sends people back to after checkout: it saves the new subscription first.

const day = (t: number) => new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

export default function BillingView({ confirming }: { confirming?: boolean }) {
  const { user, ready, open } = useAuth();
  const { status, refresh } = useBilling([user]);
  const [confirm, setConfirm] = useState<"" | "working" | "done" | "pending" | "failed">(confirming ? "working" : "");
  const [portalBusy, setPortalBusy] = useState(false);
  const [error, setError] = useState("");
  const tried = useRef(false);

  // Back from checkout: confirm with Bachs (it can take a few seconds to settle).
  useEffect(() => {
    if (!confirming || !ready || !user || tried.current) return;
    tried.current = true;
    const checkoutId = new URL(window.location.href).searchParams.get("checkout_id") ?? undefined;
    (async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const res = await fetch("/api/billing/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checkoutId }) }).catch(() => null);
        const d = (await res?.json().catch(() => ({}))) as { confirmed?: boolean; error?: string } | undefined;
        if (d?.confirmed) {
          setConfirm("done");
          refresh();
          window.history.replaceState(null, "", "/billing");
          return;
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
      setConfirm("pending");
    })();
  }, [confirming, ready, user, refresh]);

  const manage = async () => {
    setPortalBusy(true);
    setError("");
    const res = await fetch("/api/billing/portal", { method: "POST" }).catch(() => null);
    const d = (await res?.json().catch(() => ({}))) as { url?: string; error?: string } | undefined;
    if (d?.url) window.location.href = d.url;
    else {
      setError(d?.error ?? "Couldn't open billing right now.");
      setPortalBusy(false);
    }
  };

  return (
    <main className="lp lp-app min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1000px] items-center gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Home">
            <Logo compact />
          </Link>
          <span className="text-line-2">/</span>
          <span className="text-sm font-medium">Billing</span>
          <span className="flex-1" />
          <ThemeToggle className="size-8" />
          <AccountButton signInClassName="max-sm:hidden" />
        </div>
      </header>

      <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
          <ArrowLeft className="size-3.5" /> Home
        </Link>
        <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">Billing</h1>

        {!ready ? (
          <Loader2 className="spin mt-8 size-5 text-muted" />
        ) : !user ? (
          <div className="mt-6 rounded-[12px] border border-line bg-white p-6">
            <p className="text-[15px]">Sign in to see your plan.</p>
            <Button variant="primary" className="mt-4" onClick={() => open({ mode: "signin" })}>
              Sign in
            </Button>
          </div>
        ) : (
          <>
            {confirm === "working" && (
              <p className="mt-5 flex items-center gap-2 rounded-[12px] border border-line bg-white p-4 text-[14px]">
                <Loader2 className="spin size-4" /> Confirming your subscription with Bachs…
              </p>
            )}
            {confirm === "done" && (
              <p className="mt-5 flex items-center gap-2 rounded-[12px] border border-good/30 bg-good-soft p-4 text-[14px] text-good">
                <CheckCircle2 className="size-4" /> You&apos;re subscribed. Decision makers and outreach are open on every campaign.
              </p>
            )}
            {confirm === "pending" && (
              <p className="mt-5 rounded-[12px] border border-warn/30 bg-warn-soft p-4 text-[14px] text-ink-2">
                Bachs hasn&apos;t confirmed the payment yet. If you completed checkout, refresh this page in a minute. Still waiting after that? Email{" "}
                <a href={`mailto:${CONTACT.support}`} className="text-accent hover:underline">
                  {CONTACT.support}
                </a>
                .
              </p>
            )}

            <CurrentPlan status={status} onManage={manage} busy={portalBusy} />
            {error && <p className="mt-2 text-[13px] text-bad">{error}</p>}
            <p className="mt-3 text-[13px] text-muted">
              Questions about a charge or your plan? Email{" "}
              <a href={`mailto:${CONTACT.support}`} className="text-accent hover:underline">
                {CONTACT.support}
              </a>
              .
            </p>

            {status?.plan === "free" && (
              <section className="mt-8">
                <h2 className="text-[17px] font-semibold">Choose a plan</h2>
                <p className="mt-1 text-[14px] text-muted">Research stays free. Subscribe for decision makers, outreach and results tracking on every campaign.</p>
                <div className="mt-4">
                  <PlanCards billing={status} back="/billing" />
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function CurrentPlan({ status, onManage, busy }: { status: BillingStatus | null; onManage: () => void; busy: boolean }) {
  if (!status) return <div className="skeleton mt-6 h-28 rounded-[12px]" />;
  const plan = status.plans.find((p) => p.id === status.plan);
  return (
    <section className="mt-6 flex flex-col gap-4 rounded-[12px] border border-line bg-white p-5 sm:flex-row sm:items-center">
      <div className="flex-1">
        <p className="font-mono text-[11.5px] text-muted">Your plan</p>
        <p className="mt-1 text-[20px] font-semibold">
          {plan ? `${plan.name} · ${status.interval === "yearly" ? `${money(plan.yearly)} a year` : `${money(plan.monthly)} a month`}` : "Free"}
        </p>
        <p className="mt-0.5 text-[13.5px] text-muted">
          {!plan
            ? "Brand research, competitors, audiences and prospects. Pipeline for up to 25 leads."
            : status.status === "past_due"
              ? "Your last payment didn't go through. Bachs will retry; update your card to keep access."
              : status.cancelAtPeriodEnd && status.periodEnd
                ? `Cancelled. Access continues until ${day(status.periodEnd)}.`
                : status.periodEnd
                  ? `Renews on ${day(status.periodEnd)}.`
                  : "Active."}
        </p>
      </div>
      {plan && (
        <Button variant="secondary" onClick={onManage} disabled={busy}>
          {busy ? <Loader2 className="spin size-3.5" /> : <ExternalLink className="size-3.5" />} Manage subscription
        </Button>
      )}
    </section>
  );
}

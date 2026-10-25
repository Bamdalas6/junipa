"use client";

import { useCallback, useEffect, useState } from "react";
import type { BillingStatus, Interval, PlanId } from "./plans";

// Subscriptions in the browser: the user's plan, and starting a checkout.

export function useBilling(deps: unknown[] = []) {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const refresh = useCallback(
    () =>
      fetch("/api/billing", { cache: "no-store" })
        .then((r) => r.json())
        .then((d: BillingStatus) => setStatus(d))
        .catch(() => setStatus(null)),
    [],
  );
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, ...deps]);
  return { status, refresh };
}

type OpenAuth = (opts: { mode?: "signup" | "signin"; reason?: string; onDone?: () => void }) => void;

/**
 * Sends the user to Bachs' checkout for a plan. Signed out: asks them to create an
 * account first, then carries on. Returns an error message to show, if any.
 */
export async function subscribe(plan: PlanId, interval: Interval, openAuth: OpenAuth, back = window.location.pathname + window.location.search): Promise<string | null> {
  const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, interval, back }) }).catch(() => null);
  const d = ((await res?.json().catch(() => ({}))) ?? {}) as { url?: string; error?: string; signIn?: boolean; manage?: boolean };
  if (res?.status === 401 && d.signIn) {
    openAuth({ mode: "signup", reason: "Create your free account, then you'll go straight to checkout.", onDone: () => void subscribe(plan, interval, openAuth, back) });
    return null;
  }
  if (d.manage) {
    window.location.href = "/billing";
    return null;
  }
  if (!res?.ok || !d.url) return d.error ?? "Couldn't start the checkout. Try again in a moment.";
  window.location.href = d.url;
  return null;
}

export const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);

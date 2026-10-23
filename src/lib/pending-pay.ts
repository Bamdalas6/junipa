"use client";

// Bachs doesn't tell us which checkout a returning buyer just paid, so the browser
// remembers the checkout it started. The server still confirms that checkout with
// Bachs and matches it to the exact campaign (or social plan) before unlocking.

const KEY = "reachly:pay:pending";
const MAX_AGE = 3 * 60 * 60 * 1000; // a checkout expires after an hour; allow slack

type Target = { kind: "campaign"; domain: string; campaign: string } | { kind: "social"; key: string };
type Pending = Target & { ref: string; at: number };

/** The checkout ID the processor returned, before sending the buyer to pay. */
export function rememberCheckout(p: Target & { ref: string }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...p, at: Date.now() }));
  } catch {}
}

/** The remembered checkout for this campaign or plan, if it's recent. */
export function pendingCheckout(match: Target): string | undefined {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null") as Pending | null;
    if (!p || Date.now() - p.at > MAX_AGE || p.kind !== match.kind) return undefined;
    if (p.kind === "campaign" && match.kind === "campaign" && p.domain === match.domain && p.campaign === match.campaign) return p.ref;
    if (p.kind === "social" && match.kind === "social" && p.key === match.key) return p.ref;
  } catch {}
  return undefined;
}

export function clearPendingCheckout() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

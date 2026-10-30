"use client";

import { ArrowLeft, ArrowRight, Check, Link2, Loader2, Lock, ShieldCheck, X, Printer, RotateCw, Sparkles } from "lucide-react";
import { clearPendingCheckout, pendingCheckout, rememberCheckout } from "@/lib/pending-pay";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Market } from "@/lib/geo";
import { getIndustry } from "@/lib/industries";
import type { ProfileRead, SocialPlan } from "@/lib/schema";
import { PLATFORMS, parseHandle, profileUrl, type Platform } from "@/lib/social-shared";
import { useRuns } from "@/lib/useRun";
import { IndustryPicker } from "./CommandBar";
import { usePayConfig, usd } from "./Paywall";
import { MarketPicker } from "./MarketPicker";
import { AccountButton } from "./Auth";
import { ThemeToggle } from "./ThemeToggle";
import { Activity } from "./parts";
import { Button, CopyButton, Instagram, Linkedin, Logo, safeHref } from "./ui";

type Account = { platform: Platform; handle: string; followers: string; posts: string };
type Preview = {
  summary: string;
  audits: { platform: Platform; handle: string; score: number; verdict: string }[];
  counts: { pillars: number; hooks: number; hashtags: number; collabs: number; weeks: number };
};
type Result = { key: string; unlocked: boolean; profiles: ProfileRead[]; plan?: SocialPlan; preview?: Preview; sealed?: string; price?: number };

const TOKENS = "reachly:social:tokens";
const readTokens = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(TOKENS) ?? "{}");
  } catch {
    return {};
  }
};
const saveToken = (key: string, token: string) => {
  try {
    localStorage.setItem(TOKENS, JSON.stringify({ ...readTokens(), [key]: token }));
  } catch {
    /* storage unavailable */
  }
};

/** Same id the server uses for a set of handles (sha256 of "platform:handle" pairs). */
async function handlesKey(handles: { platform: string; handle: string }[]) {
  const source = handles
    .map((h) => `${h.platform}:${h.handle.toLowerCase()}`)
    .sort()
    .join(",");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 20);
}

const STORE = "reachly:social";

export function PlatformIcon({ platform, className = "size-4" }: { platform: Platform; className?: string }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className, "aria-hidden": true };
  switch (platform) {
    case "instagram":
      return <Instagram className={className} />;
    case "linkedin":
      return <Linkedin className={className} />;
    case "tiktok":
      return (
        <svg {...common}>
          <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" />
          <path d="M14 3c.5 2.8 2.4 4.6 5 5" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path d="M4 4l16 16M20 4L4 20" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common}>
          <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
          <path d="m10.5 9.5 4 2.5-4 2.5z" fill="currentColor" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...common}>
          <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8a0 0 0 0 1 0 0" />
        </svg>
      );
  }
}

const TONE: Record<Platform, string> = {
  instagram: "bg-pink-soft text-pink",
  tiktok: "bg-subtle text-ink",
  x: "bg-subtle text-ink",
  youtube: "bg-bad-soft text-bad",
  linkedin: "bg-accent-soft text-accent",
  facebook: "bg-info-soft text-info",
};

export default function SocialView({
  initialHandles,
  initialIndustry = "",
  initialMarket,
  initialBrand = "",
  paidKey,
  reference,
  autoStart,
}: {
  initialHandles: Partial<Record<Platform, string>>;
  initialIndustry?: string;
  initialMarket?: Market;
  initialBrand?: string;
  paidKey?: string;
  reference?: string;
  /** Start the plan straight away (e.g. a profile link pasted on the landing page). */
  autoStart?: boolean;
}) {
  const prefilled = Object.values(initialHandles).some(Boolean);
  const [accounts, setAccounts] = useState<Account[]>(() =>
    Object.entries(initialHandles).flatMap(([p, h]) => {
      const r = h ? parseHandle(h, p as Platform) : null;
      return r ? [{ platform: (r.platform ?? p) as Platform, handle: r.handle, followers: "", posts: "" }] : [];
    }),
  );
  const [links, setLinks] = useState("");
  const [linkNote, setLinkNote] = useState("");
  const [autoRun, setAutoRun] = useState(Boolean(autoStart && prefilled));
  const [industry, setIndustry] = useState(initialIndustry);
  const [market, setMarket] = useState<Market | null>(initialMarket ?? null);
  const [brand, setBrand] = useState(initialBrand);
  const [goal, setGoal] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const { run, get } = useRuns();
  const state = get("social");
  const [payNote, setPayNote] = useState<"" | "verifying" | "failed">("");

  // Opens the sealed plan once we hold a valid unlock token for these handles.
  async function openPlan(r: Result, token: string) {
    if (!r.sealed) return;
    const res = await fetch("/api/social/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sealed: r.sealed, token }) });
    const data = (await res.json()) as { plan?: SocialPlan; error?: string };
    if (!res.ok || !data.plan) throw new Error(data.error || "Couldn't open the plan.");
    saveToken(r.key, token);
    setResult({ ...r, unlocked: true, plan: data.plan, sealed: undefined, preview: undefined });
  }

  // Back from checkout: confirm the payment, then open the plan saved before checkout.
  const resultKey = result?.key;
  useEffect(() => {
    if (!reference || !paidKey || !result || result.unlocked || resultKey !== paidKey) return;
    const ref = reference === "pending" ? pendingCheckout({ kind: "social", key: paidKey }) : reference;
    if (!ref) return setPayNote("failed");
    let cancelled = false;
    setPayNote("verifying");
    fetch(`/api/pay/verify?${new URLSearchParams({ product: "social", reference: ref, key: paidKey })}`)
      .then((r) => r.json())
      .then(async (d: { paid?: boolean; token?: string }) => {
        if (cancelled) return;
        if (!d.paid || !d.token) return setPayNote("failed");
        clearPendingCheckout();
        await openPlan(result, d.token);
        setPayNote("");
        const url = new URL(window.location.href);
        ["reference", "trxref", "key"].forEach((k) => url.searchParams.delete(k));
        window.history.replaceState(null, "", url);
      })
      .catch(() => !cancelled && setPayNote("failed"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference, paidKey, resultKey]);

  // Restore the last plan from this browser (skipped when arriving with new handles).
  useEffect(() => {
    if (prefilled) return;
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "null");
      if (saved?.result?.key && Array.isArray(saved.accounts)) {
        setResult(saved.result);
        setAccounts(saved.accounts);
        setIndustry(saved.industry ?? "");
        setMarket(saved.market ?? null);
        setBrand(saved.brand ?? "");
        setGoal(saved.goal ?? "");
        setDone(saved.done ?? {});
      }
    } catch {
      /* nothing saved */
    }
  }, [prefilled]);

  useEffect(() => {
    if (!result) return;
    try {
      localStorage.setItem(STORE, JSON.stringify({ result, accounts, industry, market, brand, goal, done }));
    } catch {
      /* storage unavailable */
    }
  }, [result, accounts, industry, market, brand, goal, done]);

  /** Pulls profile links out of pasted text. Returns how many new accounts were added. */
  function addLinks(text: string) {
    const found: Account[] = [];
    const unknown: string[] = [];
    for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
      const r = parseHandle(token);
      if (r?.platform) found.push({ platform: r.platform, handle: r.handle, followers: "", posts: "" });
      else unknown.push(token);
    }
    if (found.length)
      setAccounts((list) => {
        const next = [...list];
        for (const f of found) if (!next.some((x) => x.platform === f.platform && x.handle.toLowerCase() === f.handle.toLowerCase())) next.push(f);
        return next.slice(0, 6);
      });
    setLinkNote(
      unknown.length
        ? unknown.some((u) => u.startsWith("@") || !u.includes("."))
          ? "Paste the full profile link (for example instagram.com/yourbrand) so Scout knows which platform it is."
          : "Scout reads Instagram, TikTok, X, YouTube, LinkedIn and Facebook profile links."
        : "",
    );
    setError("");
    return found.length;
  }

  const filled = useMemo(() => accounts.map((a) => ({ platform: a.platform, handle: a.handle, followers: a.followers, postsPerWeek: a.posts })), [accounts]);

  async function start() {
    if (filled.length === 0) return setError("Paste at least one social media profile link.");
    setError("");
    setResult(null);
    setDone({});
    // Same handles paid for in the last 30 days stay unlocked.
    const unlock = readTokens()[await handlesKey(filled)];
    run<Result>("social", { handles: filled, industry: industry || undefined, market: market ?? undefined, goal, brand, unlock }, (r) => setResult(r), "/api/social");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (links.trim() && addLinks(links)) {
      setLinks("");
      setAutoRun(true);
      return;
    }
    await start();
  }

  // Pasting links starts the plan on its own after a short pause.
  useEffect(() => {
    if (!autoRun || accounts.length === 0 || state.status === "running") return;
    const t = setTimeout(() => {
      setAutoRun(false);
      start();
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, accounts, state.status]);

  const update = (i: number, k: "followers" | "posts", v: string) => setAccounts((list) => list.map((a, j) => (j === i ? { ...a, [k]: v } : a)));

  const busy = state.status === "running";
  const settled = !!result && !busy;
  const input = "h-11 rounded-lg border border-line-2 bg-white px-3.5 text-[14px] outline-none placeholder:text-faint focus:border-[#0d99ff] focus:shadow-[0_0_0_3px_#0d99ff26]";

  return (
    <main className="lp lp-app min-h-dvh overflow-x-clip">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-md print:hidden">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-8 border-x border-line px-5 sm:px-8">
          <Link href="/">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-8 text-[14px] font-medium sm:flex">
            <Link href="/" className="hover:text-accent">
              Find customers
            </Link>
            <span className="text-accent">Grow socials</span>
          </nav>
          <span className="flex-1" />
          <ThemeToggle />
          <AccountButton signInClassName="max-sm:hidden" />
          <Link href="/" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-2 bg-white px-4 text-[14px] font-semibold hover:border-ink/30">
            <ArrowLeft className="size-3.5" /> Home
          </Link>
        </div>
      </header>

      {/* Hero: paste your links */}
      <Band className="print:hidden">
        <div className="grid gap-12 py-14 lg:grid-cols-[minmax(0,1fr)_400px] lg:py-20">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 font-mono text-[12px] text-muted">
              <span className="relative flex size-2">
                <span className="ping-soft absolute inline-flex size-full rounded-full bg-[#0ACF83]" />
                <span className="relative inline-flex size-2 rounded-full bg-[#0ACF83]" />
              </span>
              scout · social growth
            </p>
            <h1 className="mt-6 text-[40px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[54px]">
              Grow your
              <br />
              social accounts.
            </h1>
            <p className="mt-6 max-w-[560px] text-[17px] leading-[1.55] text-muted sm:text-[19px]">
              Paste your profile links. Scout audits each account and builds a plan for your niche and market: bio rewrites, content pillars, what to post and when,
              hooks, hashtags, collabs and a 30-day calendar.
            </p>

            <form onSubmit={submit} className="mt-9 max-w-[620px]">
              <label htmlFor="links" className="sr-only">
                Paste your social media links
              </label>
              <div className="flex items-center gap-2 rounded-xl border border-line-2 bg-white p-1.5 shadow-[0_1px_2px_#1214170f,0_12px_32px_-18px_#12141740] focus-within:border-[#0d99ff] focus-within:shadow-[0_0_0_3px_#0d99ff26]">
                <Link2 className="ml-2 size-4 shrink-0 text-faint" />
                <input
                  id="links"
                  value={links}
                  onChange={(e) => {
                    setLinks(e.target.value);
                    setLinkNote("");
                  }}
                  onPaste={(e) => {
                    if (addLinks(e.clipboardData.getData("text"))) {
                      e.preventDefault();
                      setLinks("");
                      setAutoRun(true);
                    }
                  }}
                  placeholder="instagram.com/yourbrand, tiktok.com/@yourbrand…"
                  inputMode="url"
                  autoFocus={!prefilled}
                  className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
                />
                {links.trim() && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (addLinks(links)) {
                        setLinks("");
                        setAutoRun(true);
                      }
                    }}
                  >
                    Add
                  </Button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[12px] text-muted">
                <span>works with</span>
                {PLATFORMS.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1">
                    <PlatformIcon platform={p.id} className="size-3.5" /> {p.label.replace(" (Twitter)", "")}
                  </span>
                ))}
              </div>
              {linkNote && <p className="mt-2.5 text-[13px] text-warn">{linkNote}</p>}

              {accounts.length > 0 && (
                <ul className="mt-6 overflow-hidden rounded-[10px] border border-line bg-white">
                  {accounts.map((a, i) => (
                    <li key={a.platform + a.handle} className="rise grid gap-2 border-b border-line px-4 py-3 last:border-0 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                      <a href={profileUrl(a.platform, a.handle)} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2.5">
                        <span className={`grid size-8 shrink-0 place-items-center rounded-md ${TONE[a.platform]}`}>
                          <PlatformIcon platform={a.platform} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-medium">{a.platform === "linkedin" ? a.handle : `@${a.handle}`}</span>
                          <span className="font-mono text-[11.5px] text-muted">{PLATFORMS.find((p) => p.id === a.platform)?.label}</span>
                        </span>
                      </a>
                      <div className="flex gap-2">
                        <input
                          value={a.followers}
                          onChange={(e) => update(i, "followers", e.target.value)}
                          placeholder="Followers"
                          aria-label={`${a.handle} followers (optional)`}
                          className="h-9 w-28 rounded-lg border border-line-2 px-3 text-[13px] outline-none placeholder:text-faint focus:border-[#0d99ff]"
                        />
                        <input
                          value={a.posts}
                          onChange={(e) => update(i, "posts", e.target.value)}
                          placeholder="Posts/wk"
                          aria-label={`${a.handle} posts per week (optional)`}
                          className="h-9 w-24 rounded-lg border border-line-2 px-3 text-[13px] outline-none placeholder:text-faint focus:border-[#0d99ff]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setAccounts((list) => list.filter((_, j) => j !== i))}
                        className="grid size-8 place-items-center justify-self-end rounded-lg text-muted hover:bg-paper hover:text-bad"
                        aria-label={`Remove ${a.handle}`}
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[12px] text-muted">niche</span>
                <IndustryPicker value={industry} onChange={setIndustry} />
                <span className="ml-1 font-mono text-[12px] text-muted">target market</span>
                <MarketPicker value={market} onChange={setMarket} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand name (optional)" aria-label="Brand name" className={`${input} w-full sm:w-52`} />
                <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Goal, e.g. more DM orders" aria-label="Goal" className={`${input} min-w-0 flex-1`} />
              </div>
              <p className="mt-3 text-[13px] leading-[1.55] text-muted">
                Optional: add followers and posts per week (Instagram, TikTok and Facebook keep these private), and pick your industry, or Scout will work out your niche.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button type="submit" size="lg" disabled={busy}>
                  {busy ? "Planning…" : result ? "Re-run plan" : "Get my growth plan"} <ArrowRight className="size-4" />
                </Button>
                <span className="font-mono text-[12px] text-muted">free audit preview</span>
              </div>
              {error && <p className="mt-3 text-[13px] text-bad">{error}</p>}
            </form>
          </div>

          <PlanSpec accounts={accounts} />
        </div>
      </Band>

      {(busy || state.status === "error") && (
        <Band className="print:hidden">
          <div className="py-10">
            <Activity run={state} label="is auditing your accounts" rows={4} />
          </div>
        </Band>
      )}

      {(payNote || (settled && !industry)) && (
        <Band className="print:hidden">
          <div className="space-y-3 py-6">
            {payNote === "verifying" && <p className="rounded-[10px] border border-accent/20 bg-accent-soft px-4 py-3 text-[13.5px] text-accent">Confirming your payment…</p>}
            {payNote === "failed" && (
              <p className="rounded-[10px] border border-bad/20 bg-bad-soft px-4 py-3 text-[13.5px] text-bad">We couldn&apos;t confirm that payment. If you were charged, refresh this page in a minute.</p>
            )}
            {settled && !industry && (
              <p className="flex flex-wrap items-center gap-2 rounded-[10px] border border-warn/25 bg-warn-soft px-4 py-3 text-[13.5px] text-ink-2">
                <Sparkles className="size-3.5 text-warn" /> Scout guessed your niche from the account name. Pick your industry above and re-run for a sharper plan.
              </p>
            )}
          </div>
        </Band>
      )}

      {result && !busy && result.unlocked && result.plan && (
        <PlanView result={{ profiles: result.profiles, plan: result.plan }} industry={industry} done={done} onDone={(k, v) => setDone((d) => ({ ...d, [k]: v }))} />
      )}
      {result && !busy && !result.unlocked && result.preview && <LockedPlan result={result} onUnlocked={(token) => openPlan(result, token)} />}

      <footer className="print:hidden">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-4 border-x border-line px-5 pb-16 pt-12 sm:px-8">
          <Logo />
          <span className="flex-1" />
          <span className="font-mono text-[12px] text-muted">© 2026 Junia · social growth plans</span>
        </div>
      </footer>
    </main>
  );
}

/* ---------- Layout ---------- */

/** A full-width band with hairline borders, holding a framed column (same canvas as the landing page). */
function Band({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={`border-b border-line print:border-0 ${className}`}>
      <div className="mx-auto max-w-[1180px] border-x border-line px-5 sm:px-8 print:border-0">{children}</div>
    </section>
  );
}

function BandHead({ label, title, body, action }: { label: string; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="grid gap-6 py-12 lg:grid-cols-2 lg:gap-16 lg:py-16">
      <div>
        <p className="font-mono text-[12px] text-muted">{label}</p>
        <h2 className="mt-4 text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[36px]">{title}</h2>
      </div>
      {(body || action) && (
        <div className="flex flex-col justify-end gap-4">
          {body && <p className="max-w-[480px] text-[15.5px] leading-[1.6] text-muted">{body}</p>}
          {action}
        </div>
      )}
    </div>
  );
}

function SubHead({ label, title, action }: { label: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-end gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[12px] text-muted">{label}</p>
        <h3 className="mt-3 text-[22px] font-semibold tracking-[-0.02em]">{title}</h3>
      </div>
      {action}
    </div>
  );
}

/** Edge-to-edge grid of cells split by hairlines; the outer edges are clipped so only inner lines show. */
function Cells({ cols, children }: { cols: 2 | 3 | 4; children: React.ReactNode }) {
  const grid = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return (
    <div className="-mx-5 overflow-hidden border-t border-line sm:-mx-8">
      <div className={`-mb-px -mr-px grid ${grid} *:border-b *:border-r *:border-line`}>{children}</div>
    </div>
  );
}

/** What the plan contains, shown as a run file like the landing page's code panel. */
function PlanSpec({ accounts }: { accounts: Account[] }) {
  const k = (t: string) => <span className="text-[#9aa6ff]">{t}</span>;
  const v = (t: string) => <span className="text-[#7ee0b5]">{t}</span>;
  const handles = accounts.length ? accounts.map((a) => (a.platform === "linkedin" ? a.handle : `@${a.handle}`)).join(", ") : "@yourbrand";
  const lines: React.ReactNode[] = [
    <span key="c" className="text-[#6b7079]"># growth.plan</span>,
    <>{k("accounts")}: [{v(handles)}]</>,
    <>{k("audit")}:    {"{"} score: {v("0-100")}, fixes: {v("ranked")} {"}"}</>,
    <>{k("bio")}:      {v("rewrite per account")}</>,
    <>{k("pillars")}:  {v("3")}, {k("hooks")}: {v("10")}</>,
    <>{k("hashtags")}: {v("15-25")}</>,
    <>{k("collabs")}:  {v("4-6")}</>,
    <>{k("calendar")}: {v("30 days")}</>,
  ];
  return (
    <div className="mx-auto w-full max-w-[400px] min-w-0 lg:pt-6">
      <div className="overflow-hidden rounded-[10px] bg-[#121417] shadow-[0_24px_48px_-24px_#12141766]">
        <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
          <span className="size-2.5 rounded-full bg-[#fff]/15" />
          <span className="size-2.5 rounded-full bg-[#fff]/15" />
          <span className="size-2.5 rounded-full bg-[#fff]/15" />
          <span className="flex-1" />
          <span className="font-mono text-[12px] text-[#81868d]">growth.plan</span>
        </div>
        <pre className="scroll-thin overflow-x-auto px-5 py-5 font-mono text-[13px] leading-[1.75] text-[#e0e2e5]">
          {lines.map((line, i) => (
            <div key={i} className="truncate">
              {line}
            </div>
          ))}
        </pre>
      </div>
      <p className="mt-4 font-mono text-[12px] text-muted">scores free · full plan unlocks once</p>
    </div>
  );
}

/* ---------- Results ---------- */

function LockedPlan({ result, onUnlocked }: { result: Result; onUnlocked: (token: string) => Promise<void> }) {
  const preview = result.preview!;
  const config = usePayConfig();
  const social = config?.social;
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const price = usd(social?.price ?? result.price ?? 9);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/pay/init", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product: "social", key: result.key, email }) });
      const data = (await res.json()) as { url?: string; reference?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Couldn't start the payment.");
      if (data.reference) rememberCheckout({ kind: "social", ref: data.reference, key: result.key });
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the payment.");
      setBusy(false);
    }
  }

  async function testUnlock() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/pay/test-unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product: "social", key: result.key }) });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) throw new Error(data.error || "Couldn't unlock.");
      await onUnlocked(data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't unlock.");
      setBusy(false);
    }
  }

  const c = preview.counts;
  return (
    <div className="rise">
      <Band>
        <BandHead label="audit ready · free preview" title="Your audit is ready." body={preview.summary} />
        <Cells cols={2}>
          {preview.audits.map((a) => (
            <div key={a.platform + a.handle} className="flex items-center gap-4 px-5 py-7 sm:px-8">
              <ScoreRing score={a.score} />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[15px] font-semibold">
                  <PlatformIcon platform={a.platform} className="size-3.5" /> {a.platform === "linkedin" ? a.handle : `@${a.handle}`}
                </p>
                <p className="mt-0.5 text-[14px] text-muted">{a.verdict}</p>
              </div>
            </div>
          ))}
        </Cells>
      </Band>

      <Band>
        <div className="-mx-5 grid sm:-mx-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="px-5 py-12 sm:px-8 lg:py-16">
            <p className="font-mono text-[12px] text-muted">locked</p>
            <h2 className="mt-4 text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[36px]">Your full growth plan is ready.</h2>
            <p className="mt-4 text-[15.5px] leading-[1.6] text-muted">Unlock to see exactly what to fix, post and say.</p>
            <div aria-hidden className="mt-8 select-none">
              <div className="overflow-hidden rounded-[10px] border border-line bg-white">
                {[
                  ["New bio for each account", `${preview.audits.length} rewrite${preview.audits.length === 1 ? "" : "s"}`],
                  ["Fixes ranked by impact", `${preview.audits.length * 4}+ actions`],
                  ["Content pillars with post ideas", `${c.pillars} pillars`],
                  ["Hooks that stop the scroll", `${c.hooks} hooks`],
                  ["Hashtags and keywords", `${c.hashtags} tags`],
                  ["Collaboration ideas", `${c.collabs} ideas`],
                  ["30-day checklist", `${c.weeks} weeks`],
                ].map(([label, count]) => (
                  <div key={label} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                    <Lock className="size-3.5 shrink-0 text-faint" />
                    <span className="flex-1 text-[14px] text-ink-2">{label}</span>
                    <span className="font-mono text-[12px] text-muted">{count}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-ink-2 blur-[4px]">“Stop scrolling if you&apos;ve ever bought an outfit that looked nothing like the photo. Here&apos;s how ours actually fits…”</p>
            </div>
          </div>
          <div className="border-t border-line bg-white px-5 py-12 sm:px-8 lg:border-l lg:border-t-0 lg:py-16">
            <p className="font-mono text-[12px] text-muted">social growth plan</p>
            <p className="mt-5 flex items-baseline gap-2">
              <span className="text-[44px] font-semibold leading-none tracking-[-0.04em]">{price}</span>
              <span className="font-mono text-[12px] text-muted">one-time</span>
            </p>
            <p className="mt-3 text-[15px] text-muted">Re-run these accounts free for {social?.days ?? 30} days.</p>
            <ul className="mt-6 space-y-3">
              {(social?.features ?? []).map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[14.5px]">
                  <Check className="mt-0.5 size-4 shrink-0 text-good" /> {f}
                </li>
              ))}
            </ul>
            {config?.enabled ? (
              <form onSubmit={pay} className="mt-8 space-y-2.5">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email for your receipt"
                  autoComplete="email"
                  className="h-11 w-full rounded-lg border border-line-2 bg-white px-3.5 text-[14px] outline-none placeholder:text-faint focus:border-[#0d99ff] focus:shadow-[0_0_0_3px_#0d99ff26]"
                />
                <Button type="submit" size="lg" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="spin size-4" /> : <Lock className="size-4" />} Unlock plan · {price}
                </Button>
              </form>
            ) : config && !config.testUnlock ? (
              <p className="mt-8 rounded-lg border border-line bg-white p-3.5 text-[13.5px] text-ink-2">The full plan opens very soon. Your free summary and scores above are yours to keep.</p>
            ) : (
              <div className="mt-8 space-y-2.5">
                <p className="rounded-lg border border-warn/25 bg-warn-soft p-3 text-[13px] text-ink-2">Payments are in test mode, so you can unlock for free.</p>
                <Button size="lg" className="w-full" onClick={testUnlock} disabled={busy || !config}>
                  {busy ? <Loader2 className="spin size-4" /> : <Lock className="size-4" />} Unlock for testing
                </Button>
              </div>
            )}
            {error && <p className="mt-2 text-[13px] text-bad">{error}</p>}
            <p className="mt-5 flex items-center gap-1.5 font-mono text-[12px] text-muted">
              <ShieldCheck className="size-3.5 text-good" /> secure checkout by {config?.provider === "paystack" ? "Paystack" : "Bachs"}
            </p>
          </div>
        </div>
      </Band>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const color = score >= 70 ? "#0b8a4c" : score >= 45 ? "#d97706" : "#dc2626";
  return (
    <svg viewBox="0 0 56 56" className="size-14 shrink-0" role="img" aria-label={`Score ${score} out of 100`}>
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--color-line)" strokeWidth="5" />
      <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 28 28)" />
      <text x="28" y="32.5" textAnchor="middle" className="fill-ink font-mono text-[13px] font-medium">
        {score}
      </text>
    </svg>
  );
}

function Bullets({ items, dot }: { items: string[]; dot: string }) {
  return (
    <ul className="mt-2 space-y-1.5 text-[14px] text-ink-2">
      {items.map((s) => (
        <li key={s} className="flex gap-2">
          <span className={`mt-[8px] size-1 shrink-0 rounded-full ${dot}`} />
          {s}
        </li>
      ))}
    </ul>
  );
}

function PlanView({ result, industry, done, onDone }: { result: { profiles: ProfileRead[]; plan: SocialPlan }; industry: string; done: Record<string, boolean>; onDone: (k: string, v: boolean) => void }) {
  const { plan, profiles } = result;
  const read = (p: Platform, h: string) => profiles.find((x) => x.platform === p && x.handle.toLowerCase() === h.toLowerCase());
  const total = plan.plan.reduce((n, w) => n + w.tasks.length, 0);
  const ticked = Object.values(done).filter(Boolean).length;

  return (
    <div className="rise">
      <Band>
        <BandHead
          label={`plan ready · ${industry ? getIndustry(industry).label.toLowerCase() : "niche detected by Scout"}`}
          title="Your growth plan."
          body={plan.summary}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {profiles.map((p) => (
                <a key={p.platform + p.handle} href={safeHref(p.url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-line-2 bg-white px-3 py-1.5 text-[13px] hover:border-ink/30">
                  <PlatformIcon platform={p.platform} className="size-3.5" />
                  <span className="font-medium">{p.platform === "linkedin" ? p.handle : `@${p.handle}`}</span>
                  <span className="font-mono text-[11.5px] text-muted">{p.followers ?? (p.readable ? "public profile" : "stats hidden")}</span>
                </a>
              ))}
              <Button size="sm" variant="secondary" onClick={() => window.print()} className="print:hidden">
                <Printer className="size-3.5" /> Print / PDF
              </Button>
            </div>
          }
        />
        <Cells cols={2}>
          {plan.audits.map((a) => (
            <div key={a.platform + a.handle} className="break-inside-avoid px-5 py-8 sm:px-8">
              <div className="flex items-start gap-4">
                <ScoreRing score={a.score} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[16px] font-semibold">
                    <PlatformIcon platform={a.platform} className="size-3.5" /> {a.platform === "linkedin" ? a.handle : `@${a.handle}`}
                  </p>
                  <p className="mt-0.5 text-[14px] text-muted">{a.verdict}</p>
                  {read(a.platform, a.handle)?.followers && <p className="mt-1 font-mono text-[12px] text-ink-2">{read(a.platform, a.handle)?.followers}</p>}
                </div>
              </div>
              {a.strengths.length > 0 && (
                <div className="mt-6">
                  <p className="font-mono text-[12px] text-muted">working</p>
                  <Bullets items={a.strengths} dot="bg-good" />
                </div>
              )}
              <div className="mt-6">
                <p className="font-mono text-[12px] text-muted">fix first</p>
                <ol className="mt-2 space-y-1.5 text-[14px] text-ink-2">
                  {a.fixes.map((f, i) => (
                    <li key={f} className="flex gap-2.5">
                      <span className="mt-0.5 font-mono text-[12px] text-warn">{String(i + 1).padStart(2, "0")}</span>
                      {f}
                    </li>
                  ))}
                </ol>
              </div>
              <div className="mt-6 rounded-[10px] border border-line bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[12px] text-muted">new bio</p>
                  <CopyButton text={a.bio} />
                </div>
                <p className="mt-2 whitespace-pre-line text-[14.5px]">{a.bio}</p>
              </div>
            </div>
          ))}
        </Cells>
      </Band>

      <Band>
        <BandHead label="01 · content pillars" title="Content pillars" />
        <Cells cols={3}>
          {plan.pillars.map((p) => (
            <div key={p.name} className="break-inside-avoid px-5 py-8 sm:px-8">
              <p className="text-[18px] font-semibold tracking-[-0.015em]">{p.name}</p>
              <p className="mt-1.5 text-[14px] leading-[1.55] text-muted">{p.why}</p>
              <ul className="mt-5 space-y-2 text-[14px] text-ink-2">
                {p.ideas.map((i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-mono text-accent">→</span>
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Cells>
      </Band>

      <Band>
        <BandHead label="02 · cadence" title="What to post and when" />
        <div className="pb-12">
          <div className="scroll-thin overflow-x-auto rounded-[10px] border border-line bg-white">
            <table className="w-full min-w-[560px] text-left text-[14px]">
              <thead className="font-mono text-[12px] text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 font-normal">platform</th>
                  <th className="px-4 py-2.5 font-normal">volume</th>
                  <th className="px-4 py-2.5 font-normal">formats</th>
                  <th className="px-4 py-2.5 font-normal">best times</th>
                </tr>
              </thead>
              <tbody>
                {plan.cadence.map((c) => (
                  <tr key={c.platform} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <PlatformIcon platform={c.platform} className="size-3.5" /> {PLATFORMS.find((p) => p.id === c.platform)?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{c.perWeek}</td>
                    <td className="px-4 py-3 text-ink-2">{c.formats.join(", ")}</td>
                    <td className="px-4 py-3 font-mono text-[12.5px] text-ink-2">{c.bestTimes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Band>

      <Band>
        <div className="-mx-5 grid sm:-mx-8 md:grid-cols-2">
          <div className="break-inside-avoid px-5 py-12 sm:px-8">
            <SubHead label="03 · hooks" title="Hooks that stop the scroll" action={<CopyButton text={plan.hooks.join("\n")} label="Copy all" />} />
            <ol className="space-y-2.5 text-[14.5px] text-ink-2">
              {plan.hooks.map((h, i) => (
                <li key={h} className="flex gap-3">
                  <span className="w-5 shrink-0 font-mono text-[12px] text-faint">{String(i + 1).padStart(2, "0")}</span>
                  <span>“{h}”</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="border-t border-line md:border-l md:border-t-0">
            <div className="break-inside-avoid px-5 py-12 sm:px-8">
              <SubHead label="04 · hashtags" title="Hashtags and keywords" action={<CopyButton text={plan.hashtags.join(" ")} label="Copy all" />} />
              <div className="flex flex-wrap gap-1.5">
                {plan.hashtags.map((t) => (
                  <span key={t} className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[12.5px] text-accent">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="break-inside-avoid border-t border-line px-5 py-12 sm:px-8">
              <SubHead label="05 · collabs" title="Collaborations" />
              <ul className="space-y-4 text-[14px]">
                {plan.collabs.map((c) => (
                  <li key={c.who}>
                    <p className="font-semibold">{c.who}</p>
                    <p className="mt-0.5 text-ink-2">{c.idea}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Band>

      <Band>
        <BandHead
          label="06 · calendar"
          title="Your 30-day plan"
          action={
            <span className="font-mono text-[12px] text-muted">
              {ticked}/{total} done
            </span>
          }
        />
        <Cells cols={4}>
          {plan.plan.map((w) => (
            <div key={w.week} className="break-inside-avoid px-5 py-8 sm:px-8">
              <p className="font-mono text-[12px] text-accent">week {w.week}</p>
              <p className="mt-2 text-[17px] font-semibold tracking-[-0.015em]">{w.focus}</p>
              <ul className="mt-4 space-y-2.5">
                {w.tasks.map((t) => {
                  const k = `${w.week}:${t}`;
                  return (
                    <li key={t}>
                      <label className="flex cursor-pointer gap-2.5 text-[14px] text-ink-2">
                        <input type="checkbox" checked={!!done[k]} onChange={(e) => onDone(k, e.target.checked)} className="mt-1 size-3.5 shrink-0 accent-accent" />
                        <span className={done[k] ? "text-faint line-through" : ""}>{t}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </Cells>
      </Band>

      <Band>
        <BandHead label="07 · kpis" title="Track these for 30 days" />
        <Cells cols={4}>
          {plan.kpis.map((k) => (
            <div key={k.metric} className="px-5 py-10 sm:px-8">
              <p className="text-[28px] font-semibold leading-none tracking-[-0.03em]">{k.target}</p>
              <p className="mt-3 text-[14.5px] leading-[1.5] text-muted">{k.metric}</p>
            </div>
          ))}
        </Cells>
      </Band>

      <Band className="print:hidden">
        <div className="flex flex-col gap-5 py-12 lg:flex-row lg:items-center">
          <div className="flex-1">
            <p className="text-[17px] font-semibold">Want customers, not just followers?</p>
            <p className="mt-1.5 max-w-[620px] text-[15px] leading-[1.55] text-muted">Scout can find real prospects who buy from brands like yours.</p>
          </div>
          <Link href="/" className="inline-flex h-11 items-center gap-1.5 self-start rounded-lg bg-ink px-5 text-[14.5px] font-semibold text-white hover:bg-ink-2 lg:self-auto">
            Find customers <ArrowRight className="size-4" />
          </Link>
        </div>
        <p className="pb-8 font-mono text-[12px] text-faint">
          <RotateCw className="mr-1.5 inline size-3" />
          re-run after a few weeks of posting to update the plan
        </p>
      </Band>
      <p className="hidden px-5 text-[11px] text-faint print:block">{profiles.map((p) => profileUrl(p.platform, p.handle)).join("  ·  ")}</p>
    </div>
  );
}

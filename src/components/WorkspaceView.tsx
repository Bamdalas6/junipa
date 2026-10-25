"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Lock,
  BadgeCheck,
  Building2,
  Download,
  ExternalLink,
  Info,
  KanbanSquare,
  Lightbulb,
  Mail,
  Plus,
  Search,
  Swords,
  Target,
  Trash2,
  TrendingUp,
  Users,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getIndustry } from "@/lib/industries";
import { handlesFromUrls } from "@/lib/social-shared";
import type { Account, Competitors, Contact, Contacts, Outreach, Profile, RunRequest, Segment, Segments } from "@/lib/schema";
import { deleteCloudWorkspaces, newer, pullWorkspace, pushWorkspace } from "@/lib/cloud";
import { logSent, trackLeads, type NewLead } from "@/lib/leads-client";
import { useBilling } from "@/lib/useBilling";
import type { LeadChannel } from "@/lib/leads-shared";
import { deleteWorkspace, loadWorkspace, newWorkspace, saveWorkspace, type Workspace } from "@/lib/store";
import { useRuns, type RunState } from "@/lib/useRun";
import { clearPendingCheckout, pendingCheckout } from "@/lib/pending-pay";
import { MarketPicker, marketLabel } from "./MarketPicker";
import { Paywall } from "./Paywall";
import { PlanCards } from "./Plans";
import { TestimonialAsk } from "./TestimonialAsk";
import { AccountButton, useAuth } from "./Auth";
import { ThemeToggle } from "./ThemeToggle";
import type { Market } from "@/lib/geo";
import { Activity, EditableText, LogRow, RerunButton, Section, StatusIcon, TagList, type StepStatus } from "./parts";
import { AgentMark, Badge, Button, ChannelChip, CopyButton, Favicon, Instagram, Linkedin, LiveDot, Logo, flag, fmtSecs, igHandle, plainEmail, safeHref } from "./ui";

const MAX_SEGMENTS = 3;

type StepId = "brand" | "competitors" | "audiences" | "prospects" | "people" | "outreach";
const STEP_IDS: StepId[] = ["brand", "competitors", "audiences", "prospects", "people", "outreach"];
const PAID: StepId[] = ["people", "outreach"];

export default function WorkspaceView({
  domain,
  industry,
  goal,
  demo = false,
  initialStep,
  reference,
  campaign,
  market,
}: {
  domain: string;
  industry: string;
  goal: string;
  demo?: boolean;
  initialStep?: string;
  reference?: string;
  campaign?: string;
  market?: Market;
}) {
  const router = useRouter();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [live, setLive] = useState<boolean | null>(null);
  const [activeSeg, setActiveSeg] = useState<string | null>(campaign ?? null);
  const { run, get, reset, runs } = useRuns();
  const [step, setStep] = useState<StepId>(STEP_IDS.includes(initialStep as StepId) ? (initialStep as StepId) : "brand");
  const [payNote, setPayNote] = useState<"" | "verifying" | "paid" | "failed">("");
  const { user, ready: authReady, open: openAuth } = useAuth();
  const signedIn = !!user;
  // A Starter or Pro subscription opens the paid steps on every campaign.
  const { status: billing } = useBilling([user]);
  const subscribed = !!billing && billing.plan !== "free";

  // One step per screen; the step lives in the URL so refresh and back work.
  const goto = useCallback((next: StepId) => {
    setStep(next);
    const url = new URL(window.location.href);
    url.searchParams.set("step", next);
    url.searchParams.delete("reference");
    url.searchParams.delete("trxref");
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Boot: learn whether the server runs live research, then load or create the workspace
  // (the newer of this browser's copy and the account's, when signed in).
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    Promise.all([
      fetch("/api/status")
        .then((r) => r.json())
        .catch(() => ({ live: false })),
      signedIn ? pullWorkspace(domain) : Promise.resolve(null),
    ])
      .then(([s, cloud]: [{ live: boolean }, Workspace | null]) => {
        if (cancelled) return;
        setLive(s.live);
        const stored = newer(loadWorkspace(domain), cloud);
        if (stored && market && JSON.stringify(market) !== JSON.stringify(stored.market ?? null)) {
          // A new market was picked on the landing page: keep the brand profile, redo market research.
          setWs({ ...stored, market, competitors: undefined, segments: undefined, selected: [], accounts: {}, picked: {}, contacts: {}, outreach: {} });
        } else setWs(stored ?? newWorkspace(domain, industry, goal, demo || !s.live, market));
        // The market now lives in the workspace; drop it from the URL so a reload can't re-apply it.
        const url = new URL(window.location.href);
        if (["market", "country", "region"].some((k) => url.searchParams.has(k))) {
          ["market", "country", "region"].forEach((k) => url.searchParams.delete(k));
          window.history.replaceState(null, "", url);
        }
      });
    return () => {
      cancelled = true;
    };
    // Signing in later doesn't reload the workspace; its changes are pushed from here on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, industry, goal, demo, authReady]);

  useEffect(() => {
    if (!ws) return;
    saveWorkspace(ws);
    if (signedIn) pushWorkspace(ws);
  }, [ws, signedIn]);

  const update = useCallback((fn: (w: Workspace) => Workspace) => setWs((w) => (w ? fn(w) : w)), []);

  const base = useMemo(
    () => (ws ? { domain: ws.domain, industry: ws.industry, goal: ws.goal, profile: ws.profile, competitors: ws.competitors, demo: ws.demo, market: ws.market } : null),
    [ws],
  );

  const runProfile = useCallback(() => {
    if (!base) return;
    run<Profile>("profile", { ...base, phase: "profile", profile: undefined }, (profile) => update((w) => ({ ...w, profile })));
  }, [base, run, update]);

  const runCompetitors = useCallback(() => {
    if (!base) return;
    run<Competitors>("competitors", { ...base, phase: "competitors" }, (competitors) => update((w) => ({ ...w, competitors })));
  }, [base, run, update]);

  const runSegments = useCallback(() => {
    if (!base) return;
    run<Segments>("segments", { ...base, phase: "segments" }, (segments) =>
      update((w) => ({ ...w, segments, selected: segments.segments.slice(0, 2).map((s) => s.id) })),
    );
  }, [base, run, update]);

  const runAccounts = useCallback(
    (seg: Segment) => {
      if (!base) return;
      run<{ accounts: Account[] }>(`accounts:${seg.id}`, { ...base, phase: "accounts", segment: seg }, ({ accounts }) =>
        update((w) => ({
          ...w,
          accounts: { ...w.accounts, [seg.id]: accounts },
          // Every prospect is picked: a subscription finds decision makers for all of them.
          picked: { ...w.picked, [seg.id]: accounts.map((a) => a.name) },
        })),
      );
    },
    [base, run, update],
  );

  const runContactsAndOutreach = useCallback(
    (seg: Segment) => {
      if (!base || !ws) return;
      const picked = new Set(ws.picked[seg.id] ?? []);
      const accounts = (ws.accounts[seg.id] ?? []).filter((a) => picked.has(a.name));
      const req: RunRequest = { ...base, phase: "contacts", segment: seg, accounts, unlock: ws.unlocks?.[seg.id]?.token };
      run<Contacts>(`contacts:${seg.id}`, req, (contacts) => update((w) => ({ ...w, contacts: { ...w.contacts, [seg.id]: contacts } })));
      run<Outreach>(`outreach:${seg.id}`, { ...req, phase: "outreach" }, (outreach) => update((w) => ({ ...w, outreach: { ...w.outreach, [seg.id]: outreach } })));
    },
    [base, ws, run, update],
  );

  // Steps 1-3 run on their own, one after another. The brand profile is free to try;
  // after it, a free account is needed (the server enforces this too).
  const profileRun = get("profile");
  const compRun = get("competitors");
  const segRun = get("segments");
  const needsAccount = !!ws && !ws.demo && authReady && !signedIn;
  const askAccount = useCallback(
    () => openAuth({ mode: "signup", reason: "Your brand profile is ready. Create a free account to see your competitors, audiences and prospects. It takes a few seconds." }),
    [openAuth],
  );
  const asked = useRef(false);
  useEffect(() => {
    if (!ws) return;
    if (!ws.profile) {
      if (profileRun.status === "idle") runProfile();
    } else if (needsAccount) {
      if (!asked.current && !ws.competitors) {
        asked.current = true;
        askAccount();
      }
    } else if (!ws.competitors) {
      if (compRun.status === "idle") runCompetitors();
    } else if (!ws.segments && segRun.status === "idle") runSegments();
  }, [ws, needsAccount, askAccount, profileRun.status, compRun.status, segRun.status, runProfile, runCompetitors, runSegments]);

  const allSegs = useMemo(() => ws?.segments?.segments ?? [], [ws?.segments]);
  const selectedSegs = useMemo(() => allSegs.filter((s) => ws?.selected.includes(s.id)), [allSegs, ws?.selected]);
  const launched = selectedSegs.filter((s) => ws?.accounts[s.id] || get(`accounts:${s.id}`).status !== "idle");
  const seg = launched.find((s) => s.id === activeSeg) ?? launched[0];

  // Results tracking: decision makers go into the pipeline as they arrive, and every
  // message sent from here is logged on its lead (see /w/[domain]/pipeline).
  const canTrack = signedIn && !!ws && !ws.demo;
  const [tracked, setTracked] = useState<Record<string, "added" | "limit">>({});
  const [trackNote, setTrackNote] = useState("");
  const importing = useRef(new Set<string>());
  const profileLine = ws?.profile ? `${ws.profile.name}: ${ws.profile.oneLiner}` : undefined;
  const toLead = useCallback(
    (s: Segment, a: Account, c: Contact | null): NewLead => ({
      campaign: s.id,
      account: a.name,
      name: c?.name ?? "Team",
      role: c?.role || undefined,
      email: c?.email || undefined,
      linkedin: c?.linkedin || undefined,
      instagram: a.instagram || undefined,
      context: { why: a.why, signal: a.signal || undefined, angle: s.angle, brand: profileLine, website: a.website || undefined },
    }),
    [profileLine],
  );
  useEffect(() => {
    if (!canTrack || !ws || !seg || !ws.contacts[seg.id] || ws.leadsImported?.[seg.id] || importing.current.has(seg.id)) return;
    const id = seg.id;
    importing.current.add(id);
    const picked = new Set(ws.picked[id] ?? []);
    const people = (ws.accounts[id] ?? [])
      .filter((a) => picked.has(a.name))
      .flatMap((a) => {
        const found = ws.contacts[id].contacts.filter((c) => c.account.toLowerCase() === a.name.toLowerCase());
        return found.length ? found.map((c) => toLead(seg, a, c)) : [toLead(seg, a, null)];
      });
    trackLeads(ws.domain, people)
      .then((r) => {
        update((w) => ({ ...w, leadsImported: { ...w.leadsImported, [id]: true } }));
        if (r.overLimit) setTrackNote(`${r.overLimit} decision makers weren't added to your pipeline: the free plan holds 25 leads.`);
      })
      .catch(() => importing.current.delete(id));
  }, [canTrack, ws, seg, toLead, update]);
  const logSend = useCallback(
    (s: Segment, a: Account, c: Contact | null, channel: LeadChannel, body: string, subject?: string) => {
      if (!canTrack || !ws || !body) return;
      logSent(ws.domain, toLead(s, a, c), { channel, subject, body })
        .then((r) => r.overLimit && setTrackNote("That message wasn't added to your pipeline: the free plan holds 25 leads."))
        .catch(() => {});
    },
    [canTrack, ws, toLead],
  );
  const trackProspect = useCallback(
    (s: Segment, a: Account) => {
      if (!canTrack || !ws) return;
      trackLeads(ws.domain, [toLead(s, a, null)])
        .then((r) => setTracked((t) => ({ ...t, [a.name]: r.ids.length ? "added" : "limit" })))
        .catch(() => {});
    },
    [canTrack, ws, toLead],
  );

  // Back from checkout: confirm the payment on the server, then store the signed unlock.
  const wsDomain = ws?.domain;
  const hasUnlock = !!(campaign && ws?.unlocks?.[campaign]);
  useEffect(() => {
    if (!wsDomain || !reference || !campaign || hasUnlock) return;
    const ref = reference === "pending" ? pendingCheckout({ kind: "campaign", domain: wsDomain, campaign }) : reference;
    if (!ref) {
      setPayNote("failed");
      return;
    }
    let cancelled = false;
    setPayNote("verifying");
    fetch(`/api/pay/verify?${new URLSearchParams({ reference: ref, domain: wsDomain, campaign })}`)
      .then((r) => r.json())
      .then((d: { paid?: boolean; token?: string; tier?: string }) => {
        if (cancelled) return;
        if (d.paid && d.token) {
          clearPendingCheckout();
          update((w) => ({ ...w, unlocks: { ...w.unlocks, [campaign]: { token: d.token!, tier: d.tier ?? "starter", at: Date.now() } } }));
          setPayNote("paid");
        } else setPayNote("failed");
      })
      .catch(() => !cancelled && setPayNote("failed"));
    return () => {
      cancelled = true;
    };
  }, [wsDomain, hasUnlock, reference, campaign, update]);

  // Once unlocked (a subscription, or a campaign bought earlier), the paid steps start on their own.
  useEffect(() => {
    if (!ws || !seg || !(ws.unlocks?.[seg.id] || (subscribed && !ws.demo)) || (step !== "people" && step !== "outreach")) return;
    if (!ws.accounts[seg.id] || ws.contacts[seg.id] || get(`contacts:${seg.id}`).status !== "idle") return;
    runContactsAndOutreach(seg);
  }, [ws, seg, step, get, runContactsAndOutreach, subscribed]);

  if (!ws || live === null) return <BootScreen />;

  const ind = getIndustry(ws.industry);
  const stepStatus = (key: string, has: boolean, prereq: boolean): StepStatus => {
    const r = get(key);
    if (r.status === "running") return "running";
    if (r.status === "error") return "error";
    if (has) return "done";
    return prereq ? "waiting" : "locked";
  };

  const sk = seg?.id ?? "";
  const s1 = stepStatus("profile", !!ws.profile, true);
  const s2 = stepStatus("competitors", !!ws.competitors, !!ws.profile);
  const s3: StepStatus = segRun.status === "running" ? "running" : segRun.status === "error" ? "error" : ws.segments ? (launched.length ? "done" : "needs-you") : ws.competitors ? "waiting" : "locked";
  const acc = seg ? stepStatus(`accounts:${sk}`, !!ws.accounts[sk], true) : "locked";
  const s4: StepStatus = acc === "done" && !ws.contacts[sk] && get(`contacts:${sk}`).status === "idle" ? "needs-you" : acc;
  const s5 = seg ? stepStatus(`contacts:${sk}`, !!ws.contacts[sk], !!ws.accounts[sk]) : "locked";
  const s6 = seg ? stepStatus(`outreach:${sk}`, !!ws.outreach[sk], !!ws.accounts[sk]) : "locked";

  const dur = (key: string) => {
    const r = runs[key];
    return r?.startedAt && r.finishedAt && r.status === "done" ? fmtSecs(r.finishedAt - r.startedAt) : undefined;
  };

  const steps: { id: string; label: string; status: StepStatus; icon: typeof Search; meta?: string }[] = [
    { id: "brand", label: "Brand profile", status: s1, icon: Building2, meta: dur("profile") },
    { id: "competitors", label: "Competitors", status: s2, icon: Swords, meta: dur("competitors") },
    { id: "audiences", label: "Audiences", status: s3, icon: Target, meta: dur("segments") },
    { id: "prospects", label: "Prospects", status: s4, icon: Search, meta: dur(`accounts:${sk}`) },
    { id: "people", label: "Decision makers", status: s5, icon: Users, meta: dur(`contacts:${sk}`) },
    { id: "outreach", label: "Sequences", status: s6, icon: Workflow, meta: dur(`outreach:${sk}`) },
  ];

  const unlock = seg ? ws.unlocks?.[seg.id] : undefined;
  const unlocked = !!unlock || (subscribed && !ws.demo);
  const tierName = subscribed && !ws.demo ? (billing?.plan === "pro" ? "Pro" : "Starter") : unlock?.tier === "pro" ? "Pro" : "Starter";
  const avail: Record<StepId, boolean> = {
    brand: true,
    competitors: !!ws.profile || compRun.status !== "idle",
    audiences: !!ws.competitors || segRun.status !== "idle",
    prospects: launched.length > 0,
    people: !!(seg && ws.accounts[seg.id]),
    outreach: !!(seg && ws.accounts[seg.id]),
  };
  // Changing the market re-runs everything that depends on it (the brand profile stays).
  const changeMarket = (m: Market | null) => {
    const next = m ?? undefined;
    if (JSON.stringify(next ?? null) === JSON.stringify(ws.market ?? null)) return;
    const hasResearch = !!(ws.competitors || ws.segments);
    if (hasResearch && !confirm(`Re-run competitors, audiences and prospects for ${marketLabel(m, ws.profile?.countryCode)}?`)) return;
    reset();
    setActiveSeg(null);
    update((w) => ({ ...w, market: next, competitors: undefined, segments: undefined, selected: [], accounts: {}, picked: {}, contacts: {}, outreach: {} }));
    if (hasResearch) goto("competitors");
  };

  const launchProspecting = () => {
    selectedSegs.forEach((s) => {
      if (!ws.accounts[s.id]) runAccounts(s);
    });
    setActiveSeg(selectedSegs[0]?.id ?? null);
    goto("prospects");
  };
  const proceedToPeople = () => {
    if (seg && unlocked && !ws.contacts[seg.id] && get(`contacts:${seg.id}`).status === "idle") runContactsAndOutreach(seg);
    goto("people");
  };

  const prospectCount = Object.values(ws.accounts).reduce((n, a) => n + a.length, 0);
  const leadCount = Object.values(ws.contacts).reduce((n, c) => n + c.contacts.length, 0);
  const verified = Object.values(ws.contacts).reduce((n, c) => n + c.contacts.filter((x) => x.email).length, 0);
  const contactedCount = Object.values(ws.contacted).filter(Boolean).length;
  const doneSteps = steps.filter((s) => s.status === "done").length;
  const running = Object.entries(runs).find(([, r]) => r.status === "running");
  const segName = (id: string) => allSegs.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="lp lp-app min-h-dvh">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur-md">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-5">
          <Link href="/" aria-label="Home">
            <Logo compact />
          </Link>
          <span className="text-line-2 max-sm:hidden">/</span>
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <Favicon domain={ws.domain} name={ws.profile?.name ?? ws.domain} size={20} />
            <span className="truncate font-medium">{ws.profile?.name ?? ws.domain}</span>
            <span className="hidden sm:inline">
              <Badge>
                {ind.emoji} {ind.short}
              </Badge>
            </span>
          </span>
          <span className="flex-1" />
          <span className="hidden max-w-[360px] items-center gap-2 truncate whitespace-nowrap rounded-lg border border-line bg-subtle px-2.5 py-1 text-xs text-ink-2 lg:inline-flex">
            {running ? <LiveDot tone="accent" /> : <span className="size-2 rounded-full bg-good" />}
            {running ? (
              <>
                Autopilot running <span className="font-mono text-muted">· {runLabel(running[0], segName)}</span>
              </>
            ) : (
              <>
                Idle <span className="font-mono text-muted">· {doneSteps}/6 steps</span>
              </>
            )}
          </span>
          <ThemeToggle className="size-8" />
          <AccountButton signInClassName="max-sm:hidden" />
          {/* Phones: the demo banner and step status already say this; give the brand name the room. */}
          <span className="max-sm:hidden">
            {ws.demo ? (
              <Badge tone="warn" dot>
                Demo data
              </Badge>
            ) : (
              <Badge tone="good" dot>
                Live
              </Badge>
            )}
          </span>
          <Button variant="secondary" size="sm" disabled={leadCount === 0} onClick={() => exportCsv(ws)}>
            <Download className="size-3.5" /> <span className="hidden sm:inline">Export</span>
          </Button>
          {!ws.demo && (
            <Link href={`/w/${ws.domain}/pipeline`} className="inline-flex h-7 items-center gap-1 rounded-lg border border-line-2 bg-white px-2.5 text-xs font-medium hover:border-ink/30" aria-label="Pipeline">
              <KanbanSquare className="size-3.5" /> <span className="hidden sm:inline">Pipeline</span>
            </Link>
          )}
        </div>
        <nav className="scroll-thin flex gap-1 overflow-x-auto border-t border-line px-3 py-2 lg:hidden" aria-label="Steps">
          {steps.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={!avail[s.id as StepId]}
              onClick={() => goto(s.id as StepId)}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium disabled:opacity-40 ${step === s.id ? "bg-ink text-white" : "text-ink-2 hover:bg-paper"}`}
            >
              <StatusIcon status={s.status} size={14} />
              {s.label}
              {PAID.includes(s.id as StepId) && !unlocked && <Lock className="size-3 opacity-60" />}
            </button>
          ))}
        </nav>
      </header>

      <div className="grid lg:grid-cols-[232px_minmax(0,1fr)] xl:grid-cols-[232px_minmax(0,1fr)_340px]">
        {/* Sidebar */}
        <aside className="hidden border-r border-line lg:block">
          <div className="sticky top-14 flex h-[calc(100dvh-56px)] flex-col gap-6 overflow-y-auto p-4">
            <div>
              <p className="mb-2 px-2 font-mono text-[12px] text-muted">pipeline</p>
              <nav className="space-y-0.5" aria-label="Steps">
                {steps.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!avail[s.id as StepId]}
                    onClick={() => goto(s.id as StepId)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] disabled:cursor-not-allowed ${step === s.id ? "bg-accent-soft font-medium text-accent" : avail[s.id as StepId] ? "text-ink-2 hover:bg-paper" : "text-faint"}`}
                  >
                    <StatusIcon status={s.status} size={16} />
                    <span className="flex-1 truncate">{s.label}</span>
                    {PAID.includes(s.id as StepId) && !unlocked ? <Lock className="size-3 text-faint" /> : s.meta && <span className="font-mono text-[10.5px] text-faint">{s.meta}</span>}
                    {s.status === "needs-you" && <span className="size-1.5 rounded-full bg-warn" />}
                  </button>
                ))}
              </nav>
            </div>

            {launched.length > 0 && (
              <div>
                <p className="mb-2 px-2 font-mono text-[12px] text-muted">campaigns</p>
                <div className="space-y-0.5">
                  {launched.map((s) => (
                    <button key={s.id} onClick={() => setActiveSeg(s.id)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] ${seg?.id === s.id ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-paper"}`}>
                      <span>{s.emoji}</span>
                      <span className="flex-1 truncate">{s.name}</span>
                      <span className="font-mono text-[10.5px] text-faint">{ws.accounts[s.id]?.length ?? "…"}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-auto space-y-3">
              <div className="rounded-[10px] border border-line bg-white p-3.5">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Outreach progress</span>
                  <span className="font-mono">
                    {contactedCount}/{leadCount}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${leadCount ? Math.min(100, (100 * contactedCount) / leadCount) : 0}%` }} />
                </div>
                {!ws.demo && (
                  <Link href={`/w/${ws.domain}/pipeline`} className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-accent hover:underline">
                    <KanbanSquare className="size-3.5" /> Track replies in your pipeline
                  </Link>
                )}
              </div>
              <button
                onClick={() => {
                  if (confirm(`Delete the research for ${ws.domain}?`)) {
                    deleteWorkspace(ws.domain);
                    if (signedIn) deleteCloudWorkspaces(ws.domain);
                    router.push("/");
                  }
                }}
                className="flex items-center gap-2 px-2 text-xs text-muted hover:text-bad"
              >
                <Trash2 className="size-3.5" /> Delete workspace
              </button>
            </div>
          </div>
        </aside>

        {/* Main column */}
        <main className="min-w-0 space-y-5 px-4 py-6 sm:px-6 lg:px-8">
          {ws.demo && (
            <DemoBanner
              live={!!live}
              example={ws.domain.endsWith(".example")}
              onSwitch={() => {
                reset();
                setActiveSeg(null);
                setWs(newWorkspace(ws.domain, ws.industry, ws.goal, false, ws.market));
              }}
            />
          )}

          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.03em] sm:text-[32px]">{ws.profile?.name ?? ws.domain}</h1>
              {ws.profile?.countryCode && <span className="text-lg">{flag(ws.profile.countryCode)}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
              {ws.domain.endsWith(".example") ? (
                <span>{ws.domain}</span>
              ) : (
                <a href={`https://${ws.domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-ink">
                  {ws.domain} <ExternalLink className="size-3" />
                </a>
              )}
              <span className="text-line-2">•</span>
              <span>{ind.label}</span>
              <span className="text-line-2">•</span>
              <span className="inline-flex items-center gap-1.5">
                Target
                <MarketPicker value={ws.market ?? null} onChange={changeMarket} autoCountry={ws.profile?.countryCode} commitOnDone />
              </span>
              <span className="text-line-2">•</span>
              <span className="font-mono text-[12px]">Created {new Date(ws.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              {ws.goal && (
                <>
                  <span className="text-line-2">•</span>
                  <span>
                    Goal: <span className="text-ink-2">{ws.goal}</span>
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line md:grid-cols-4">
            <Kpi label="Competitors" value={ws.competitors?.competitors.length ?? 0} icon={Swords} />
            <Kpi label="Audiences" value={allSegs.length} sub={launched.length ? `${launched.length} active` : undefined} icon={Target} />
            <Kpi label="Prospects found" value={prospectCount} icon={Building2} />
            <Kpi label="Decision makers" value={leadCount} sub={leadCount ? `${verified} with email` : undefined} icon={BadgeCheck} />
          </div>

          {/* Phones have the step tabs in the top bar; the diagram would only scroll sideways there. */}
          <div className="max-sm:hidden">
            <PipelineGraph steps={steps} current={step} avail={avail} locked={!unlocked} onGo={goto} />
          </div>

          {payNote === "verifying" && <Notice tone="accent">Confirming your payment…</Notice>}
          {payNote === "paid" && <Notice tone="good">Payment confirmed. Decision makers and outreach are unlocked for this workspace.</Notice>}
          {payNote === "failed" && <Notice tone="bad">We couldn&apos;t confirm that payment. If you were charged, refresh this page in a minute or contact support.</Notice>}

          {(step === "prospects" || step === "people" || step === "outreach") && launched.length > 1 && (
            <div className="flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Campaign">
              <span className="mr-1 font-mono text-[12px] text-muted">campaign</span>
              {launched.map((s) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={seg?.id === s.id}
                  onClick={() => setActiveSeg(s.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[13px] font-medium transition-colors ${seg?.id === s.id ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:border-line-2"}`}
                >
                  {s.emoji} {s.name}
                  {get(`accounts:${s.id}`).status === "running" && <LiveDot tone="accent" />}
                </button>
              ))}
            </div>
          )}

          {step === "brand" && (
            <Section id="brand" n={1} title="Brand profile" subtitle={ws.profile?.oneLiner ?? `Reading ${ws.domain} and its socials`} status={s1} meta={dur("profile")} actions={ws.profile && <RerunButton onClick={runProfile} disabled={profileRun.status === "running"} />}>
              <Activity run={profileRun} onRetry={runProfile} label="is reading your website" />
              {ws.profile && profileRun.status !== "running" && <ProfileView p={ws.profile} growHref={socialHref(ws)} onChange={(profile) => update((w) => ({ ...w, profile }))} />}
              {ws.profile && profileRun.status !== "running" && needsAccount && (
                <div className="mt-5">
                  <AccountNotice onClick={askAccount} />
                </div>
              )}
            </Section>
          )}

          {step === "competitors" && (
            <Section
              id="competitors"
              n={2}
              title="Competitor landscape"
              subtitle={ws.competitors ? `${ws.competitors.competitors.length} brands competing for the same buyers` : "Who you're up against"}
              status={s2}
              meta={dur("competitors")}
              actions={ws.competitors && <RerunButton onClick={runCompetitors} disabled={compRun.status === "running"} />}
            >
              {!ws.competitors && compRun.status === "idle" && needsAccount && ws.profile && <AccountNotice onClick={askAccount} />}
              {!ws.competitors && compRun.status === "idle" && !(needsAccount && ws.profile) && <p className="text-[13.5px] text-muted">Starts as soon as the brand profile is ready.</p>}
              <Activity run={compRun} onRetry={runCompetitors} rows={4} label="is mapping competitors" />
              {ws.competitors && compRun.status !== "running" && (
                <CompetitorsView c={ws.competitors} onRemove={(i) => update((w) => ({ ...w, competitors: w.competitors && { ...w.competitors, competitors: w.competitors.competitors.filter((_, j) => j !== i) } }))} />
              )}
            </Section>
          )}

          {step === "audiences" && (
            <Section
              id="audiences"
              n={3}
              title="Audience segments"
              subtitle={ws.segments ? `Select up to ${MAX_SEGMENTS} segments to launch as campaigns` : "Groups most likely to buy"}
              status={s3}
              meta={dur("segments")}
              actions={ws.segments && <RerunButton onClick={runSegments} disabled={segRun.status === "running"} />}
            >
              {!ws.segments && segRun.status === "idle" && <p className="text-[13.5px] text-muted">Starts as soon as competitors are mapped.</p>}
              <Activity run={segRun} onRetry={runSegments} rows={3} label="is modelling audiences" />
              {ws.segments && segRun.status !== "running" && (
                <SegmentsView
                  ws={ws}
                  running={selectedSegs.some((s) => get(`accounts:${s.id}`).status === "running")}
                  defaultChannel={ws.industry === "fashion" ? "instagram" : "email"}
                  onToggle={(id) =>
                    update((w) => ({
                      ...w,
                      selected: w.selected.includes(id) ? w.selected.filter((x) => x !== id) : w.selected.length >= MAX_SEGMENTS ? w.selected : [...w.selected, id],
                    }))
                  }
                  onAdd={(s) => update((w) => ({ ...w, segments: w.segments && { segments: [...w.segments.segments, s] }, selected: w.selected.length < MAX_SEGMENTS ? [...w.selected, s.id] : w.selected }))}
                  onLaunch={launchProspecting}
                />
              )}
            </Section>
          )}

          {step === "prospects" && (
            <Section
              id="prospects"
              n={4}
              title="Prospect accounts"
              subtitle={seg ? (ws.accounts[seg.id] ? `${ws.accounts[seg.id].length} ${seg.name.toLowerCase()} matched` : `Searching for ${seg.name.toLowerCase()}`) : "Launch a segment to start prospecting"}
              status={s4}
              meta={dur(`accounts:${sk}`)}
              actions={seg && ws.accounts[seg.id] && <RerunButton onClick={() => runAccounts(seg)} disabled={get(`accounts:${seg.id}`).status === "running"} label="Search again" />}
            >
              {seg && (
                <>
                  <Activity run={get(`accounts:${seg.id}`)} onRetry={() => runAccounts(seg)} rows={5} label={`is finding ${seg.name.toLowerCase()}`} />
                  {ws.accounts[seg.id] && get(`accounts:${seg.id}`).status !== "running" && (
                    <AccountsView
                      demo={ws.demo}
                      accounts={ws.accounts[seg.id]}
                      picked={ws.picked[seg.id] ?? []}
                      onPick={(names) => update((w) => ({ ...w, picked: { ...w.picked, [seg.id]: names } }))}
                      busy={get(`contacts:${seg.id}`).status === "running"}
                      hasNext={!!ws.contacts[seg.id]}
                      unlocked={unlocked}
                      onTrack={canTrack ? (a) => trackProspect(seg, a) : undefined}
                      tracked={tracked}
                      onNext={() => {
                        if (unlocked && ws.contacts[seg.id]) runContactsAndOutreach(seg);
                        proceedToPeople();
                      }}
                    />
                  )}
                </>
              )}
            </Section>
          )}

          {PAID.includes(step) && !unlocked && !ws.demo && (
            <section className="card p-5 sm:p-6">
              <h2 className="text-[18px] font-semibold">Decision makers and outreach</h2>
              <p className="mt-1 max-w-2xl text-[14px] text-muted">
                Scout finds the people who decide at {seg ? `all ${(ws.picked[seg.id] ?? []).length} of your prospect accounts` : "all your prospect accounts"}, confirms each on a public page, and writes the outreach. Starter and Pro unlock every decision maker, on every campaign.
              </p>
              <div className="mt-5">
                <PlanCards billing={billing} compact />
              </div>
            </section>
          )}
          {PAID.includes(step) && !unlocked && ws.demo && (
            <Paywall
              brand={ws.profile?.name ?? ws.domain}
              domain={ws.domain}
              industry={ws.industry}
              demo={ws.demo}
              prospects={seg ? (ws.picked[seg.id] ?? []).length : 0}
              campaign={seg?.name}
              campaignId={seg?.id ?? ""}
              onUnlocked={(token, tier) => seg && update((w) => ({ ...w, unlocks: { ...w.unlocks, [seg.id]: { token, tier, at: Date.now() } } }))}
            />
          )}

          {step === "people" && unlocked && (
            <Section id="people" n={5} title="Decision makers" subtitle={`${seg && ws.contacts[seg.id] ? `${ws.contacts[seg.id].contacts.length} people confirmed on public pages` : "The person who signs off"} · ${tierName} plan`} status={s5} meta={dur(`contacts:${sk}`)}>
              {seg && (
                <>
                  <Activity run={get(`contacts:${seg.id}`)} onRetry={() => runContactsAndOutreach(seg)} rows={4} label="is identifying decision makers" />
                  {trackNote && <p className="mb-3 text-[12.5px] text-warn">{trackNote}</p>}
                  {ws.contacts[seg.id] && get(`contacts:${seg.id}`).status !== "running" && (
                    <ContactsView
                      demo={ws.demo}
                      data={ws.contacts[seg.id]}
                      accounts={ws.accounts[seg.id] ?? []}
                      picked={ws.picked[seg.id] ?? []}
                      outreach={ws.outreach[seg.id]}
                      contacted={ws.contacted}
                      onContacted={(key, v) => update((w) => ({ ...w, contacted: { ...w.contacted, [key]: v } }))}
                      onSent={(a, c, channel, body, subject) => logSend(seg, a, c, channel, body, subject)}
                    />
                  )}
                </>
              )}
            </Section>
          )}

          {step === "outreach" && unlocked && (
            <Section
              id="outreach"
              n={6}
              title="Outreach sequence"
              subtitle={seg && ws.outreach[seg.id] ? `${ws.outreach[seg.id].steps.length}-touch sequence for ${seg.name.toLowerCase()}` : "Multichannel messages, written for each segment"}
              status={s6}
              meta={dur(`outreach:${sk}`)}
              actions={seg && ws.outreach[seg.id] && <RerunButton onClick={() => runContactsAndOutreach(seg)} label="Regenerate" />}
            >
              {seg && (
                <>
                  <Activity run={get(`outreach:${seg.id}`)} onRetry={() => runContactsAndOutreach(seg)} rows={3} label="is drafting your sequence" />
                  {ws.outreach[seg.id] && get(`outreach:${seg.id}`).status !== "running" && (
                    <OutreachView
                      o={ws.outreach[seg.id]}
                      sample={{ name: ws.contacts[seg.id]?.contacts[0]?.name ?? "Ada", company: ws.contacts[seg.id]?.contacts[0]?.account ?? ws.accounts[seg.id]?.[0]?.name ?? "their company" }}
                      onChange={(o) => update((w) => ({ ...w, outreach: { ...w.outreach, [seg.id]: o } }))}
                    />
                  )}
                </>
              )}
            </Section>
          )}

          {step === "outreach" && unlocked && seg && ws.outreach[seg.id] && <TestimonialAsk domain={ws.domain} brand={ws.profile?.name ?? ws.domain} />}

          <StepNav
            step={step}
            back={STEP_IDS[STEP_IDS.indexOf(step) - 1]}
            onBack={(id) => goto(id)}
            next={
              step === "brand"
                ? { label: "Continue to competitors", disabled: !ws.profile, onClick: () => goto("competitors") }
                : step === "competitors"
                  ? { label: "Continue to audiences", disabled: !ws.competitors, onClick: () => goto("audiences") }
                  : step === "audiences"
                    ? launched.length
                      ? { label: "Continue to prospects", onClick: () => goto("prospects") }
                      : { label: "Launch prospecting", disabled: ws.selected.length === 0 || !ws.segments, onClick: launchProspecting }
                    : step === "prospects"
                      ? { label: unlocked ? "Continue to decision makers" : "Unlock decision makers", disabled: !avail.people, onClick: proceedToPeople, icon: unlocked ? undefined : "lock" }
                      : step === "people"
                        ? unlocked
                          ? { label: "Continue to outreach", onClick: () => goto("outreach") }
                          : undefined
                        : unlocked && leadCount > 0
                          ? { label: "Export leads (CSV)", onClick: () => exportCsv(ws), icon: "done" }
                          : undefined
            }
          />
        </main>

        {/* Agent activity rail */}
        <aside className="hidden border-l border-line xl:block">
          <div className="sticky top-14 h-[calc(100dvh-56px)] overflow-y-auto p-4">
            <AgentRail runs={runs} segName={segName} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function runLabel(key: string, segName: (id: string) => string) {
  const [phase, id] = key.split(":");
  const names: Record<string, string> = {
    profile: "Brand profile",
    competitors: "Competitor scan",
    segments: "Audience modelling",
    accounts: "Prospect search",
    contacts: "Decision makers",
    outreach: "Sequence writer",
  };
  return id ? `${names[phase]} · ${segName(id)}` : (names[phase] ?? key);
}

function BootScreen() {
  return (
    <div className="lp lp-app grid min-h-dvh place-items-center">
      <div className="flex items-center gap-3 font-mono text-[13px] text-muted">
        <AgentMark size={18} active /> Loading workspace…
      </div>
    </div>
  );
}

function DemoBanner({ live, example, onSwitch }: { live: boolean; example: boolean; onSwitch: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-warn/25 bg-warn-soft px-4 py-3 text-sm sm:flex-row sm:items-center">
      <Info className="size-4 shrink-0 text-warn" />
      <p className="flex-1 text-ink-2">
        <span className="font-medium text-ink">Demo workspace.</span> Companies and people below are fictional sample data.
        {!live && (
          <>
            {" "}
            Live research is offline right now, so this workspace uses sample data.
          </>
        )}
      </p>
      {live &&
        (example ? (
          <Link href="/" className="text-sm font-medium text-accent hover:underline">
            Research your own brand →
          </Link>
        ) : (
          <Button size="sm" variant="primary" onClick={onSwitch}>
            Switch to live research <ArrowRight className="size-3.5" />
          </Button>
        ))}
    </div>
  );
}

function Kpi({ label, value, sub, icon: Icon }: { label: string; value: number; sub?: string; icon: typeof Search }) {
  return (
    <div className="bg-white px-4 py-4 sm:px-5">
      <div className="flex items-center justify-between font-mono text-[12px] text-muted">
        {label.toLowerCase()}
        <Icon className="size-3.5 text-faint" />
      </div>
      <p key={value} className="rise mt-3 text-[30px] font-semibold leading-none tabular-nums tracking-[-0.04em]">
        {value}
      </p>
      <p className="mt-2 h-4 font-mono text-[11.5px] text-muted">{sub}</p>
    </div>
  );
}

function Notice({ tone, children }: { tone: "good" | "bad" | "accent"; children: React.ReactNode }) {
  const t = { good: "border-good/20 bg-good-soft text-good", bad: "border-bad/20 bg-bad-soft text-bad", accent: "border-accent/20 bg-accent-soft text-accent" }[tone];
  return <div className={`rounded-[10px] border px-4 py-3 text-[13.5px] ${t}`}>{children}</div>;
}

function StepNav({
  step,
  back,
  onBack,
  next,
}: {
  step: StepId;
  back?: StepId;
  onBack: (id: StepId) => void;
  next?: { label: string; onClick: () => void; disabled?: boolean; icon?: "lock" | "done" };
}) {
  const names: Record<StepId, string> = { brand: "Brand", competitors: "Competitors", audiences: "Audiences", prospects: "Prospects", people: "Decision makers", outreach: "Outreach" };
  return (
    <div className="sticky bottom-0 z-20 -mx-4 flex items-center gap-3 border-t border-line bg-paper/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      {back ? (
        <Button variant="secondary" onClick={() => onBack(back)}>
          <ArrowLeft className="size-3.5" /> <span className="hidden sm:inline">{names[back]}</span>
          <span className="sm:hidden">Back</span>
        </Button>
      ) : (
        <span />
      )}
      <span className="flex-1 text-center font-mono text-[11px] text-faint">
        <span className="max-sm:hidden">
          Step {STEP_IDS.indexOf(step) + 1} of {STEP_IDS.length}
        </span>
      </span>
      {next && (
        // On the smallest phones the label shortens rather than pushing the button off screen.
        <Button variant="primary" onClick={next.onClick} disabled={next.disabled} className="min-w-0 shrink!">
          {next.icon === "lock" && <Lock className="size-3.5 shrink-0" />}
          {next.icon === "done" && <CheckCircle2 className="size-3.5 shrink-0" />}
          <span className="truncate">{next.label}</span>
          {!next.icon && <ArrowRight className="size-3.5 shrink-0" />}
        </Button>
      )}
    </div>
  );
}

function PipelineGraph({
  steps,
  current,
  avail,
  locked,
  onGo,
}: {
  steps: { id: string; label: string; status: StepStatus; icon: typeof Search; meta?: string }[];
  current: StepId;
  avail: Record<StepId, boolean>;
  locked: boolean;
  onGo: (id: StepId) => void;
}) {
  return (
    <div className="card scroll-thin overflow-x-auto px-5 py-4">
      <div className="flex min-w-[640px] items-center">
        {steps.map((s, i) => {
          const next = steps[i + 1];
          const flowing = s.status === "done" && next && (next.status === "running" || next.status === "needs-you");
          return (
            <div key={s.id} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                onClick={() => onGo(s.id as StepId)}
                disabled={!avail[s.id as StepId]}
                aria-current={current === s.id ? "step" : undefined}
                className="group relative flex flex-col items-center gap-1.5 disabled:cursor-not-allowed"
              >
                {PAID.includes(s.id as StepId) && locked && (
                  <span className="absolute -right-1 -top-1 z-10 grid size-4 place-items-center rounded-full border border-line bg-white text-faint">
                    <Lock className="size-2.5" />
                  </span>
                )}
                <span
                  className={`grid size-10 place-items-center rounded-[10px] border transition-all ${current === s.id ? "ring-2 ring-accent ring-offset-2" : ""} ${
                    s.status === "done"
                      ? "border-good/25 bg-good-soft text-good"
                      : s.status === "running"
                        ? "border-accent/30 bg-accent-soft text-accent shadow-[0_0_0_4px_#4c5bd414]"
                        : s.status === "needs-you"
                          ? "border-warn/30 bg-warn-soft text-warn"
                          : s.status === "error"
                            ? "border-bad/25 bg-bad-soft text-bad"
                            : "border-line bg-subtle text-faint"
                  }`}
                >
                  <s.icon className={`size-4 ${s.status === "running" ? "pulse-dot" : ""}`} />
                </span>
                <span className={`whitespace-nowrap text-[11.5px] font-medium ${current === s.id ? "text-accent" : s.status === "locked" ? "text-faint" : "text-ink-2 group-enabled:group-hover:text-ink"}`}>{s.label}</span>
                <span className="h-3 font-mono text-[10px] text-faint">{s.status === "running" ? "running…" : s.status === "needs-you" ? "your move" : s.meta}</span>
              </button>
              {next && (
                <div
                  aria-hidden
                  className={`mx-2 -mt-9 h-0.5 min-w-4 flex-1 rounded-full ${flowing ? "flow-line" : s.status === "done" ? "bg-good/60" : "bg-[repeating-linear-gradient(90deg,#dcdce1_0_4px,transparent_4px_8px)]"}`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgentRail({ runs, segName }: { runs: Record<string, RunState>; segName: (id: string) => string }) {
  const entries = Object.entries(runs)
    .filter(([, r]) => r.startedAt)
    .sort((a, b) => (b[1].startedAt ?? 0) - (a[1].startedAt ?? 0));
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <AgentMark size={18} active={entries.some(([, r]) => r.status === "running")} />
        <p className="font-mono text-[12px] text-muted">agent activity</p>
        <span className="flex-1" />
        <span className="font-mono text-[10.5px] text-faint">{entries.length} runs</span>
      </div>
      {entries.length === 0 && <p className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-muted">Runs from this session appear here, with every search and page Scout reads.</p>}
      <ol className="space-y-2.5">
        {entries.map(([key, r]) => (
          <li key={key} className={`overflow-hidden rounded-[10px] border bg-white ${r.status === "running" ? "border-accent/30" : "border-line"}`}>
            <div className="flex items-center gap-2 px-3 py-2">
              <StatusIcon status={r.status === "running" ? "running" : r.status === "error" ? "error" : "done"} size={14} />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{runLabel(key, segName)}</span>
              <span className="font-mono text-[10.5px] text-faint">{r.finishedAt && r.startedAt ? fmtSecs(r.finishedAt - r.startedAt) : r.status === "running" ? "live" : ""}</span>
            </div>
            {r.logs.length > 0 && (
              <div className="bg-[#121417] px-3 py-2 font-mono text-[10.5px] leading-4">
                {(r.status === "running" ? r.logs.slice(-5) : r.logs.slice(-3)).map((l, i, arr) => (
                  <LogRow key={l.at + l.text} line={l} start={r.startedAt} last={r.status === "running" && i === arr.length - 1} />
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------- Step views ---------- */

/** Link to the social growth tool, prefilled with the accounts found in the brand profile. */
function socialHref(ws: Workspace) {
  const q = new URLSearchParams({ industry: ws.industry, brand: ws.profile?.name ?? "" });
  for (const [platform, handle] of Object.entries(handlesFromUrls((ws.profile?.socials ?? []).map((s) => s.url)))) if (handle) q.set(platform, handle);
  if (ws.market?.scope === "worldwide") q.set("market", "worldwide");
  if (ws.market?.scope === "country" && ws.market.country) {
    q.set("country", ws.market.country);
    if (ws.market.region) q.set("region", ws.market.region);
  }
  return `/social?${q}`;
}

function ProfileView({ p, onChange, growHref }: { p: Profile; onChange: (p: Profile) => void; growHref: string }) {
  const tier = { budget: "Budget", mid: "Mid-range", premium: "Premium", luxury: "Luxury", unknown: "Unknown" }[p.priceTier];
  const facts: [string, string][] = [
    ["Category", p.category],
    ["Market", `${flag(p.countryCode)} ${p.country}`],
    ["Price tier", tier],
    ["Channels", `${p.channels.length} active`],
  ];
  return (
    <div className="rise grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <div className="min-w-0">
        <p className="text-[14.5px] leading-relaxed text-ink-2">
          <EditableText value={p.description} multiline onSave={(description) => onChange({ ...p, description })} />
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k} className="bg-white p-3">
              <dt className="font-mono text-[10.5px] tracking-wider text-faint">{k.toUpperCase()}</dt>
              <dd className="mt-1 truncate text-[13px] font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <Field label="Offerings">
          <TagList items={p.offerings} onRemove={(i) => onChange({ ...p, offerings: p.offerings.filter((_, j) => j !== i) })} onAdd={(v) => onChange({ ...p, offerings: [...p.offerings, v] })} />
        </Field>
        <Field label="Sales channels">
          <TagList items={p.channels} />
        </Field>
        <Field label="Buyer search terms">
          <TagList items={p.keywords} tone="accent" onRemove={(i) => onChange({ ...p, keywords: p.keywords.filter((_, j) => j !== i) })} onAdd={(v) => onChange({ ...p, keywords: [...p.keywords, v] })} />
        </Field>
        {p.socials.length > 0 && (
          <Field label="Sources">
            <div className="flex flex-wrap gap-1.5">
              {p.socials.map((s) =>
                s.url.includes(".example") || !safeHref(s.url) ? (
                  <Badge key={s.url}>{s.platform}</Badge>
                ) : (
                  <a key={s.url} href={safeHref(s.url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[12px] text-ink-2 hover:border-line-2 hover:text-ink">
                    {s.platform} <ExternalLink className="size-3" />
                  </a>
                ),
              )}
            </div>
          </Field>
        )}
        <Link
          href={growHref}
          className="mt-5 inline-flex items-center gap-2 rounded-[10px] border border-accent/20 bg-accent-soft/60 px-3.5 py-2.5 text-[13px] font-medium text-accent hover:bg-accent-soft"
        >
          <TrendingUp className="size-3.5" /> Get a growth plan for these social accounts <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <div className="grid content-start gap-3">
        <Insight title="Strengths" icon={TrendingUp} tone="good" items={p.strengths} />
        <Insight title="Growth opportunities" icon={Lightbulb} tone="accent" items={p.gaps} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <p className="mb-2 font-mono text-[10.5px] font-medium tracking-wider text-faint">{label.toUpperCase()}</p>
      {children}
    </div>
  );
}

function Insight({ title, icon: Icon, tone, items }: { title: string; icon: typeof Search; tone: "good" | "accent"; items: string[] }) {
  return (
    <div className="rounded-[10px] border border-line bg-white p-4">
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        <span className={`grid size-6 place-items-center rounded-md ${tone === "good" ? "bg-good-soft text-good" : "bg-accent-soft text-accent"}`}>
          <Icon className="size-3.5" />
        </span>
        {title}
      </p>
      <ul className="mt-3 space-y-2 text-[13px] text-ink-2">
        {items.map((s) => (
          <li key={s} className="flex gap-2">
            <span className={`mt-[7px] size-1 shrink-0 rounded-full ${tone === "good" ? "bg-good" : "bg-accent"}`} />
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompetitorsView({ c, onRemove }: { c: Competitors; onRemove: (i: number) => void }) {
  const order = { high: 0, medium: 1, low: 2 };
  const rows = c.competitors.map((x, i) => ({ ...x, i })).sort((a, b) => order[a.threat] - order[b.threat]);
  return (
    <div className="rise space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <p className="text-[13.5px] leading-relaxed text-ink-2">{c.summary}</p>
        <div className="rounded-[10px] border border-accent/15 bg-accent-soft/60 p-3.5">
          <p className="font-mono text-[10.5px] font-medium tracking-wider text-accent">WHITESPACE</p>
          <p className="mt-1 text-[13.5px] text-ink">{c.whitespace}</p>
        </div>
      </div>
      {/* Phones and tablets: one card per competitor. */}
      <ul className="overflow-hidden rounded-[10px] border border-line lg:hidden">
        {rows.map((x) => (
          <li key={x.name} className="border-b border-line px-3.5 py-3 last:border-0">
            <div className="flex items-start gap-2.5">
              <Favicon domain={x.domain} name={x.name} size={24} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{x.name}</p>
                <p className="text-[12px] text-muted">
                  {x.location}
                  {x.priceTier && x.priceTier !== "unknown" ? ` · ${x.priceTier}` : ""}
                </p>
              </div>
              <Badge tone={x.threat === "high" ? "bad" : x.threat === "medium" ? "warn" : "plain"} dot>
                {x.threat}
              </Badge>
              <button onClick={() => onRemove(x.i)} className="-mr-1 grid size-8 shrink-0 place-items-center rounded-md text-faint hover:bg-white hover:text-bad" aria-label={`Remove ${x.name}`} title="Not a competitor">
                <X className="size-3.5" />
              </button>
            </div>
            <p className="mt-2 text-[13px] text-ink-2">{x.positioning}</p>
            <p className="mt-0.5 text-[12px] text-muted">{x.overlap}</p>
            {!x.domain.endsWith(".example") && (
              <a href={safeHref(x.domain)} target="_blank" rel="noreferrer" className="mt-1.5 inline-block font-mono text-[11.5px] text-muted hover:text-accent">
                {x.domain}
              </a>
            )}
          </li>
        ))}
      </ul>
      <div className="scroll-thin hidden overflow-x-auto rounded-[10px] border border-line lg:block">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="bg-subtle text-[11px] text-muted">
            <tr className="border-b border-line">
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">Positioning</th>
              <th className="px-3 py-2 font-medium">Price</th>
              <th className="px-3 py-2 font-medium">Overlap</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.name} className="group border-b border-line last:border-0 hover:bg-subtle/70">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Favicon domain={x.domain} name={x.name} size={24} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{x.name}</p>
                      {x.domain.endsWith(".example") ? (
                        <p className="font-mono text-[11px] text-faint">{x.domain}</p>
                      ) : (
                        <a href={safeHref(x.domain)} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-muted hover:text-accent">
                          {x.domain}
                        </a>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-ink-2">{x.location}</td>
                <td className="max-w-[280px] px-3 py-2.5">
                  <p className="text-ink-2">{x.positioning}</p>
                  <p className="text-[12px] text-muted">{x.overlap}</p>
                </td>
                <td className="px-3 py-2.5 capitalize text-ink-2">{x.priceTier}</td>
                <td className="px-3 py-2.5">
                  <Badge tone={x.threat === "high" ? "bad" : x.threat === "medium" ? "warn" : "plain"} dot>
                    {x.threat}
                  </Badge>
                </td>
                <td className="pr-2">
                  <button onClick={() => onRemove(x.i)} className="grid size-6 place-items-center rounded-md text-faint opacity-0 hover:bg-white hover:text-bad group-hover:opacity-100" aria-label={`Remove ${x.name}`} title="Not a competitor">
                    <X className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FitMeter({ fit }: { fit: Segment["fit"] }) {
  const n = fit === "strong" ? 3 : fit === "good" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-2.5 w-1 rounded-full ${i < n ? "bg-accent" : "bg-line-2"}`} />
        ))}
      </span>
      {fit === "experimental" ? "test" : fit} fit
    </span>
  );
}

function SegmentsView({
  ws,
  running,
  defaultChannel,
  onToggle,
  onAdd,
  onLaunch,
}: {
  ws: Workspace;
  running: boolean;
  defaultChannel: Segment["bestChannel"];
  onToggle: (id: string) => void;
  onAdd: (s: Segment) => void;
  onLaunch: () => void;
}) {
  const [custom, setCustom] = useState("");
  const segs = ws.segments?.segments ?? [];
  const pending = ws.selected.filter((id) => !ws.accounts[id]);
  return (
    <div className="rise">
      <div className="grid gap-3 md:grid-cols-2">
        {segs.map((s) => {
          const on = ws.selected.includes(s.id);
          const full = !on && ws.selected.length >= MAX_SEGMENTS;
          return (
            <button
              key={s.id}
              onClick={() => onToggle(s.id)}
              disabled={full}
              aria-pressed={on}
              className={`rounded-[10px] border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-45 ${on ? "border-accent bg-white shadow-[0_0_0_3px_#4c5bd41f]" : "border-line bg-white hover:border-line-2"}`}
            >
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-subtle text-lg">{s.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold">{s.name}</p>
                  {s.job && <p className="text-[12.5px] text-muted">{s.job}</p>}
                </div>
                <span className={`grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors ${on ? "border-accent bg-accent text-[#fff]" : "border-line-2 bg-white"}`}>
                  {on && (
                    <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="m2.5 6.2 2.3 2.3 4.7-5" />
                    </svg>
                  )}
                </span>
              </div>
              {s.pain && (
                <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-[12.5px]">
                  <div className="grid grid-cols-[44px_1fr] gap-2">
                    <dt className="font-mono text-[10.5px] tracking-wider text-faint">PAIN</dt>
                    <dd className="text-ink-2">{s.pain}</dd>
                  </div>
                  <div className="grid grid-cols-[44px_1fr] gap-2">
                    <dt className="font-mono text-[10.5px] tracking-wider text-faint">HOOK</dt>
                    <dd className="text-ink-2">{s.angle}</dd>
                  </div>
                </dl>
              )}
              <div className="mt-3 flex items-center gap-3">
                <ChannelChip channel={s.bestChannel} />
                <FitMeter fit={s.fit} />
                <span className="flex-1" />
                <span className="font-mono text-[11px] text-muted">~{s.estimatedAccounts} accts</span>
              </div>
            </button>
          );
        })}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const name = custom.trim();
            if (!name) return;
            onAdd({ id: `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name, emoji: "🎯", estimatedAccounts: "?", job: "", pain: "", angle: "", bestChannel: defaultChannel, fit: "good" });
            setCustom("");
          }}
          className="flex min-h-28 flex-col justify-center gap-2 rounded-[10px] border border-dashed border-line-2 p-4"
        >
          <label htmlFor="custom-seg" className="text-[13px] font-medium">
            Custom segment
          </label>
          <div className="flex gap-2">
            <input id="custom-seg" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. Hotel gift shops" className="h-9 min-w-0 flex-1 rounded-lg border border-line px-3 text-sm outline-none focus:border-accent focus:ring-3 focus:ring-accent/10" />
            <Button type="submit" variant="secondary">
              <Plus className="size-3.5" /> Add
            </Button>
          </div>
        </form>
      </div>
      <div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-[10px] border border-line bg-subtle px-4 py-3 sm:flex-row sm:items-center">
        <p className="text-[13px] text-ink-2">
          <span className="font-mono font-medium text-ink">
            {ws.selected.length}/{MAX_SEGMENTS}
          </span>{" "}
          segments selected. Each launches a prospecting campaign.
        </p>
        <Button variant="primary" onClick={onLaunch} disabled={pending.length === 0 || running}>
          {running ? "Prospecting…" : "Launch prospecting"} <ArrowRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function AccountsView({
  demo,
  accounts,
  picked,
  onPick,
  onNext,
  busy,
  hasNext,
  unlocked,
  onTrack,
  tracked = {},
}: {
  demo: boolean;
  unlocked: boolean;
  accounts: Account[];
  picked: string[];
  onPick: (names: string[]) => void;
  onNext: () => void;
  busy: boolean;
  hasNext: boolean;
  /** Adds the business to the pipeline (signed in, live research only). */
  onTrack?: (a: Account) => void;
  tracked?: Record<string, "added" | "limit">;
}) {
  const trackButton = (a: Account, big?: boolean) =>
    onTrack && (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!tracked[a.name]) onTrack(a);
        }}
        aria-label={tracked[a.name] === "added" ? `${a.name} is in your pipeline` : `Add ${a.name} to your pipeline`}
        title={tracked[a.name] === "limit" ? "Free plan: 25 leads. Unlock a campaign for unlimited." : tracked[a.name] === "added" ? "In your pipeline" : "Add to pipeline"}
        className={`grid ${big ? "size-8" : "size-7"} place-items-center rounded-md ${tracked[a.name] === "added" ? "text-good" : tracked[a.name] === "limit" ? "text-warn" : "text-muted hover:bg-paper hover:text-ink"}`}
      >
        {tracked[a.name] === "added" ? <CheckCircle2 className={big ? "size-4" : "size-3.5"} /> : <KanbanSquare className={big ? "size-4" : "size-3.5"} />}
      </button>
    );
  const set = new Set(picked);
  const toggle = (n: string) => onPick(set.has(n) ? picked.filter((x) => x !== n) : [...picked, n]);
  const allOn = picked.length === accounts.length;
  return (
    <div className="rise">
      <div className="mb-3 flex items-center gap-2 text-xs">
        <Button size="sm" variant="secondary" onClick={() => onPick(accounts.map((a) => a.name))}>
          Select all
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onPick([])}>
          Clear
        </Button>
        <span className="flex-1" />
        <span className="font-mono text-muted">
          {picked.length} of {accounts.length} selected
        </span>
      </div>
      {/* Phones and tablets: one tappable card per account. */}
      <ul className="overflow-hidden rounded-[10px] border border-line lg:hidden">
        {accounts.map((a) => {
          const on = set.has(a.name);
          const site = a.website && !a.website.endsWith(".example") ? safeHref(a.website) : undefined;
          return (
            <li key={a.name} className={`border-b border-line last:border-0 ${on ? "bg-white" : "bg-subtle/50 text-muted"}`}>
              <label className="flex cursor-pointer items-start gap-3 px-3.5 py-3">
                <input type="checkbox" checked={on} onChange={() => toggle(a.name)} aria-label={`Select ${a.name}`} className="mt-1.5 size-4 shrink-0 accent-accent" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2.5">
                    <Favicon domain={a.website} name={a.name} size={24} />
                    <span className="min-w-0">
                      <span className={`block font-medium ${on ? "text-ink" : ""}`}>{a.name}</span>
                      <span className="block text-[11.5px] text-muted">
                        {a.location}
                        {a.size ? ` · ${a.size}` : ""}
                      </span>
                    </span>
                  </span>
                  {a.why && <span className="mt-2 block text-[13px] text-ink-2">{a.why}</span>}
                  {a.signal && (
                    <span className="mt-1.5 inline-flex items-start gap-1 rounded-md bg-warn-soft px-1.5 py-0.5 text-[12px] text-warn">
                      <Zap className="mt-0.5 size-3 shrink-0" /> {a.signal}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                  {trackButton(a, true)}
                  {igHandle(a.instagram) && !demo && (
                    <a href={`https://instagram.com/${igHandle(a.instagram)}`} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-md text-muted hover:bg-paper hover:text-pink" aria-label={`${a.name} on Instagram`}>
                      <Instagram className="size-4" />
                    </a>
                  )}
                  {site && (
                    <a href={site} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-md text-muted hover:bg-paper hover:text-ink" aria-label={`${a.name} website`}>
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="scroll-thin hidden overflow-x-auto rounded-[10px] border border-line lg:block">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="bg-subtle text-[11px] text-muted">
            <tr className="border-b border-line">
              <th className="w-10 px-3 py-2">
                <input type="checkbox" checked={allOn} onChange={() => onPick(allOn ? [] : accounts.map((a) => a.name))} aria-label="Select all" className="size-3.5 accent-accent" />
              </th>
              <th className="px-2 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Size</th>
              <th className="px-3 py-2 font-medium">Why it fits</th>
              <th className="px-3 py-2 font-medium">Signal</th>
              <th className="px-3 py-2 text-right font-medium">Links</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const on = set.has(a.name);
              const site = a.website && !a.website.endsWith(".example") ? safeHref(a.website) : undefined;
              return (
                <tr key={a.name} onClick={() => toggle(a.name)} className={`cursor-pointer border-b border-line last:border-0 hover:bg-accent-soft/30 ${on ? "bg-white" : "bg-subtle/50 text-muted"}`}>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={on} onChange={() => toggle(a.name)} aria-label={`Select ${a.name}`} className="size-3.5 accent-accent" />
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Favicon domain={a.website} name={a.name} size={24} />
                      <div className="min-w-0">
                        <p className={`truncate font-medium ${on ? "text-ink" : ""}`}>{a.name}</p>
                        <p className="text-[11.5px] text-muted">{a.location}</p>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11.5px] text-ink-2">{a.size}</td>
                  <td className="max-w-[260px] px-3 py-2.5 text-ink-2">{a.why}</td>
                  <td className="max-w-[220px] px-3 py-2.5">
                    {a.signal ? (
                      <span className="inline-flex items-start gap-1 rounded-md bg-warn-soft px-1.5 py-0.5 text-[12px] text-warn">
                        <Zap className="mt-0.5 size-3 shrink-0" /> {a.signal}
                      </span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      {trackButton(a)}
                      {igHandle(a.instagram) && !demo && (
                        <a href={`https://instagram.com/${igHandle(a.instagram)}`} target="_blank" rel="noreferrer" className="grid size-7 place-items-center rounded-md text-muted hover:bg-paper hover:text-pink" aria-label={`${a.name} on Instagram`}>
                          <Instagram className="size-3.5" />
                        </a>
                      )}
                      {site && (
                        <a href={site} target="_blank" rel="noreferrer" className="grid size-7 place-items-center rounded-md text-muted hover:bg-paper hover:text-ink" aria-label={`${a.name} website`}>
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        <span className="hidden text-xs text-muted sm:inline">Finds owners and buyers, then drafts a sequence</span>
        <Button variant="primary" onClick={onNext} disabled={busy || picked.length === 0}>
          {!unlocked && <Lock className="size-3.5" />}
          {hasNext && unlocked ? "Run again" : "Find decision makers"} <ArrowRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function personalize(text: string, contact?: { name?: string }, company?: string) {
  const first = contact?.name?.split(" ")[0] || "there";
  return text.replaceAll("{{first_name}}", first).replaceAll("{{company}}", company || "your store");
}

function ContactsView({
  demo,
  data,
  accounts,
  picked,
  outreach,
  contacted,
  onContacted,
  onSent,
}: {
  demo: boolean;
  data: Contacts;
  accounts: Account[];
  picked: string[];
  outreach?: Outreach;
  contacted: Record<string, boolean>;
  onContacted: (key: string, v: boolean) => void;
  /** Logs a sent message on the lead in the pipeline. */
  onSent?: (a: Account, c: Contact | null, channel: LeadChannel, body: string, subject?: string) => void;
}) {
  const first = outreach?.steps[0];
  const email = outreach?.steps.find((s) => s.channel === "email");
  const rows = accounts.filter((a) => picked.includes(a.name));
  return (
    <div className="rise space-y-4">
      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
        <span className="mr-1 font-mono text-[10.5px] tracking-wider text-faint">TARGET ROLES</span>
        {data.rolesToTarget.map((r) => (
          <Badge key={r}>{r}</Badge>
        ))}
      </div>
      <div className="overflow-hidden rounded-[10px] border border-line">
        {rows.map((a) => {
          const people: (Contact | null)[] = data.contacts.filter((c) => c.account.toLowerCase() === a.name.toLowerCase());
          if (people.length === 0) people.push(null);
          return people.map((c, i) => {
            const key = `${a.name}::${c?.name ?? "team"}`;
            const msg = first ? personalize(first.body, c ?? undefined, a.name) : "";
            const done = !!contacted[key];
            return (
              <div key={key + i} className={`flex flex-col gap-3 border-b border-line px-3.5 py-3 last:border-0 sm:flex-row sm:items-center ${done ? "bg-good-soft/40" : ""}`}>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${c ? "bg-accent-soft text-accent" : "border border-dashed border-line-2 text-faint"}`}>
                    {c ? c.name.split(" ").map((x) => x[0]).slice(0, 2).join("") : "?"}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium">
                      {c ? c.name : <span className="text-muted">No contact confirmed</span>}
                      <span className="font-normal text-muted"> · {a.name}</span>
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                      <span>{c ? c.role : `Reach the business: ${data.rolesToTarget[0] ?? "Owner"}`}</span>
                      {c?.email && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-mono text-[11.5px] text-ink-2">{c.email}</span>
                          {c.emailStatus === "verified" && <Badge tone="good">verified</Badge>}
                          {c.emailStatus === "published" && <Badge tone="info">public</Badge>}
                          {c.emailStatus === "unverified" && <Badge tone="warn">unverified</Badge>}
                        </span>
                      )}
                      {c?.source && !c.source.includes(".example") && safeHref(c.source) && (
                        <a href={safeHref(c.source)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-accent">
                          source <ExternalLink className="size-3" />
                        </a>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {igHandle(a.instagram) && msg && !demo && (
                    <a
                      href={`https://ig.me/m/${igHandle(a.instagram)}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => {
                        navigator.clipboard?.writeText(msg).catch(() => {});
                        if (!done) onContacted(key, true);
                        onSent?.(a, c, "instagram", msg);
                      }}
                      title="Copies the first message, then opens the DM"
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-line px-2.5 text-xs font-medium hover:border-pink/40 hover:text-pink"
                    >
                      <Instagram className="size-3.5" /> DM
                    </a>
                  )}
                  {c && plainEmail(c.email) && email && !demo && (
                    <a
                      href={`mailto:${plainEmail(c.email)}?subject=${encodeURIComponent(personalize(email.subject, c, a.name))}&body=${encodeURIComponent(personalize(email.body, c, a.name))}`}
                      onClick={() => {
                        if (!done) onContacted(key, true);
                        onSent?.(a, c, "email", personalize(email.body, c, a.name), personalize(email.subject, c, a.name));
                      }}
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-line px-2.5 text-xs font-medium hover:border-info/40 hover:text-info"
                    >
                      <Mail className="size-3.5" /> Email
                    </a>
                  )}
                  {safeHref(c?.linkedin) && (
                    <a href={safeHref(c?.linkedin)} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-lg border border-line px-2.5 text-xs font-medium hover:border-accent/40 hover:text-accent">
                      <Linkedin className="size-3.5" /> Profile
                    </a>
                  )}
                  {msg && <CopyButton text={msg} label="Copy" />}
                  <label className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium ${done ? "border-good/30 bg-good-soft text-good" : "border-line text-ink-2"}`}>
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={(e) => {
                        onContacted(key, e.target.checked);
                        if (e.target.checked && msg) onSent?.(a, c, c && plainEmail(c.email) ? "email" : igHandle(a.instagram) ? "instagram" : "other", msg);
                      }}
                      className="size-3.5 accent-good"
                    />
                    {done ? "Contacted" : "Mark sent"}
                  </label>
                </div>
              </div>
            );
          });
        })}
      </div>
      {!first && <p className="text-xs text-muted">Messages appear once the sequence step finishes.</p>}
      {demo && <p className="text-xs text-muted">DM and email buttons switch on with live research, so sample names never reach a real inbox.</p>}
    </div>
  );
}

function OutreachView({ o, onChange, sample }: { o: Outreach; onChange: (o: Outreach) => void; sample: { name: string; company: string } }) {
  const [preview, setPreview] = useState(true);
  return (
    <div className="rise">
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-[13px] text-muted">
          {preview ? (
            <>
              Previewing for <span className="font-medium text-ink">{sample.name.split(" ")[0]}</span> at <span className="font-medium text-ink">{sample.company}</span>
            </>
          ) : (
            <>
              Variables <code className="rounded bg-paper px-1 font-mono text-[11.5px]">{"{{first_name}}"}</code> and <code className="rounded bg-paper px-1 font-mono text-[11.5px]">{"{{company}}"}</code> fill per contact
            </>
          )}
        </p>
        <div className="inline-flex shrink-0 rounded-lg border border-line bg-subtle p-0.5 text-xs font-medium" role="tablist" aria-label="Message view">
          {(["Preview", "Edit"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={(v === "Preview") === preview} onClick={() => setPreview(v === "Preview")} className={`rounded-md px-3 py-1 ${(v === "Preview") === preview ? "bg-white text-ink shadow-[0_1px_2px_#1018281a]" : "text-muted"}`}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <ol className="relative space-y-3">
        <span aria-hidden className="absolute bottom-6 left-[15px] top-6 w-px bg-line-2" />
        {o.steps.map((s, i) => (
          <li key={i} className="relative grid grid-cols-[32px_1fr] gap-3">
            <span className="relative z-10 mt-3 grid size-8 place-items-center rounded-full border border-line bg-white font-mono text-[11px] font-medium shadow-[0_1px_2px_#1018280f]">D{s.day}</span>
            <div className="min-w-0 rounded-[10px] border border-line">
              <div className="flex flex-wrap items-center gap-2 border-b border-line bg-subtle px-3.5 py-2">
                <ChannelChip channel={s.channel} />
                <span className="text-[12px] text-muted">{s.goal}</span>
                <span className="flex-1" />
                <span className="hidden font-mono text-[10.5px] text-faint sm:inline">
                  Touch {i + 1} · Day {s.day}
                </span>
                <CopyButton text={(s.subject ? `${s.subject}\n\n` : "") + s.body} />
              </div>
              <div className="p-3.5">
                {s.subject && (
                  <p className="mb-2 text-[13px]">
                    <span className="font-mono text-[10.5px] tracking-wider text-faint">SUBJECT </span>
                    <span className="font-medium">{preview ? personalize(s.subject, sample, sample.company) : s.subject}</span>
                  </p>
                )}
                {preview ? (
                  <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">{personalize(s.body, sample, sample.company)}</p>
                ) : (
                  <textarea
                    value={s.body}
                    onChange={(e) => onChange({ ...o, steps: o.steps.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })}
                    rows={Math.min(10, Math.max(3, s.body.split("\n").length + 1))}
                    className="w-full resize-y rounded-lg border border-line-2 p-3 text-[13.5px] leading-relaxed outline-none focus:border-accent focus:ring-3 focus:ring-accent/10"
                    aria-label={`Message for day ${s.day}`}
                  />
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {o.tips.length > 0 && (
        <div className="mt-4 rounded-[10px] border border-line bg-subtle p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold">
            <Lightbulb className="size-3.5 text-warn" /> Playbook notes
          </p>
          <ul className="mt-2 space-y-1.5 text-[13px] text-ink-2">
            {o.tips.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="mt-[7px] size-1 shrink-0 rounded-full bg-faint" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------- Export ---------- */

function exportCsv(ws: Workspace) {
  const head = ["Audience", "Company", "Person", "Role", "Email", "Email status", "LinkedIn", "Instagram", "Website", "Location", "Signal", "First message", "Contacted"];
  const rows: string[][] = [];
  for (const s of ws.segments?.segments ?? []) {
    const contacts = ws.contacts[s.id];
    if (!contacts) continue;
    const first = ws.outreach[s.id]?.steps[0];
    for (const a of (ws.accounts[s.id] ?? []).filter((x) => ws.picked[s.id]?.includes(x.name))) {
      const people = contacts.contacts.filter((c) => c.account.toLowerCase() === a.name.toLowerCase());
      for (const c of people.length ? people : [null]) {
        rows.push([
          s.name,
          a.name,
          c?.name ?? "",
          c?.role ?? "",
          c?.email ?? "",
          c?.emailStatus ?? "",
          c?.linkedin ?? "",
          a.instagram ? `@${a.instagram}` : "",
          a.website,
          a.location,
          a.signal,
          first ? personalize(first.body, c ?? undefined, a.name) : "",
          ws.contacted[`${a.name}::${c?.name ?? "team"}`] ? "yes" : "",
        ]);
      }
    }
  }
  // Cells starting with = + - @ would run as formulas in Excel/Sheets, so they get a leading apostrophe.
  const cell = (v: unknown) => `"${String(v).replace(/^[=+\-@\t\r]/, "'$&").replaceAll('"', '""')}"`;
  const csv = [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `junia-${ws.domain}-leads.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Shown in place of the next steps while a visitor without an account looks at their free brand profile. */
function AccountNotice({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-line bg-white p-4 sm:flex-row sm:items-center">
      <p className="flex-1 text-[14px] text-ink-2">Create a free account to see your competitors, audiences and prospects. Your research is saved to it, on any device.</p>
      <Button variant="primary" onClick={onClick}>
        Create free account
      </Button>
    </div>
  );
}

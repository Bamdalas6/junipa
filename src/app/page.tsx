"use client";

import { ArrowRight, Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { B, BuildCanvas } from "@/components/Build";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CommandBar, DetectNote, useIndustryDetection } from "@/components/CommandBar";
import { MarketPicker } from "@/components/MarketPicker";
import { usd, usePayConfig } from "@/components/Paywall";
import { Badge, Favicon, Logo } from "@/components/ui";
import type { Market } from "@/lib/geo";
import { INDUSTRIES, getIndustry } from "@/lib/industries";
import { PLATFORMS, parseHandle } from "@/lib/social-shared";
import { cleanDomain, clearAllWorkspaces, listWorkspaces, type WorkspaceSummary } from "@/lib/store";

const DEMO_HREF = "/w/lagos-label.example?industry=fashion&demo=1";
const VALID = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export default function Home() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState(""); // "" = not known yet (Auto-detect)
  const [auto, setAuto] = useState(false);
  const industryTouched = useRef(false);
  const [pending, setPending] = useState<"hero" | "dock" | null>(null); // Run pressed while still detecting
  const [openIndustry, setOpenIndustry] = useState({ hero: 0, dock: 0 });
  const [market, setMarket] = useState<Market | null>(null); // null = Auto
  const [marketAuto, setMarketAuto] = useState(false);
  const marketTouched = useRef(false);
  const [goal, setGoal] = useState("");
  const [showGoal, setShowGoal] = useState(false);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<WorkspaceSummary[]>([]);
  const [showDock, setShowDock] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dockInputRef = useRef<HTMLInputElement>(null);
  const heroBarRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => setRecent(listWorkspaces()), []);

  const { state: detect, detectNow } = useIndustryDetection(domain, (r) => {
    // A manual pick wins over detection.
    if (!industryTouched.current) {
      setIndustry(r.industry);
      setAuto(true);
    }
    // Fill the market from strong evidence on the site, unless the user already chose one.
    if (!marketTouched.current) {
      setMarket(r.country ? { scope: "country", country: r.country, region: r.region } : null);
      setMarketAuto(!!r.country);
    }
  });

  // Clearing or breaking the URL drops anything that was only auto-detected.
  useEffect(() => {
    if (detect.status !== "idle") return;
    if (auto) {
      setIndustry("");
      setAuto(false);
    }
    if (marketAuto) {
      setMarket(null);
      setMarketAuto(false);
    }
  }, [detect.status, auto, marketAuto]);

  // Run was pressed mid-detection: continue as soon as detection settles.
  useEffect(() => {
    if (!pending || detect.status === "detecting" || detect.status === "idle") return;
    const from = pending;
    setPending(null);
    start(from);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, detect.status, industry]);

  // The run bar docks to the bottom of the screen once the hero bar scrolls away.
  useEffect(() => {
    const el = heroBarRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShowDock(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  function start(from: "hero" | "dock" = "hero") {
    // A social profile link: build a growth plan for that account instead.
    const social = parseHandle(domain.trim());
    if (social?.platform) {
      const q = new URLSearchParams({ [social.platform]: social.handle, auto: "1" });
      if (industry) q.set("industry", industry);
      if (market?.scope === "worldwide") q.set("market", "worldwide");
      if (market?.scope === "country" && market.country) {
        q.set("country", market.country);
        if (market.region) q.set("region", market.region);
      }
      router.push(`/social?${q}`);
      return;
    }
    const d = cleanDomain(domain);
    if (!VALID.test(d)) {
      setError("Enter a website like yourbrand.com");
      (from === "dock" ? dockInputRef : inputRef).current?.focus();
      return;
    }
    if (!industry) {
      // Still reading the site, or hasn't started yet: wait for it rather than guess.
      if (detect.status === "detecting" || detect.status === "idle") {
        setPending(from);
        if (detect.status === "idle") detectNow();
        return;
      }
      setError("Pick what you sell so Scout knows who to look for.");
      setOpenIndustry((o) => ({ ...o, [from]: o[from] + 1 }));
      return;
    }
    const q = new URLSearchParams({ industry });
    if (market?.scope === "worldwide") q.set("market", "worldwide");
    if (market?.scope === "country" && market.country) {
      q.set("country", market.country);
      if (market.region) q.set("region", market.region);
    }
    if (goal.trim()) q.set("goal", goal.trim());
    router.push(`/w/${d}?${q}`);
  }

  const socialLink = parseHandle(domain.trim())?.platform ? parseHandle(domain.trim()) : null;

  const onMarket = (m: Market | null) => {
    marketTouched.current = true;
    setMarket(m);
    setMarketAuto(false);
  };

  const focusInput = () => setTimeout(() => inputRef.current?.focus(), 300);
  const bar = {
    domain,
    onDomain: (v: string) => {
      setDomain(v);
      setError("");
    },
    industry,
    onIndustry: (id: string) => {
      industryTouched.current = true;
      setIndustry(id);
      setAuto(false);
      setError("");
    },
    needsIndustry: !industry && (detect.status === "failed" || !!error),
    auto,
    detect,
    onPaste: detectNow,
  };

  const typedDomain = cleanDomain(domain);

  return (
    <main className="lp relative min-h-dvh overflow-x-clip">
      <BuildCanvas frame={frameRef}>
        {/* Nav: a strip of canvas above it, then a sticky bar framed like the rest of the page */}
        <div aria-hidden className="h-6">
          <div className="mx-auto h-full max-w-[1180px] border-x border-line" />
        </div>
        <header className="lp-nav sticky z-40 border-y border-line bg-paper/90 backdrop-blur-md">
          <div ref={frameRef} className="mx-auto grid h-16 max-w-[1180px] grid-cols-[1fr_auto_1fr] items-center border-x border-line px-5 sm:px-8">
            <B className="justify-self-start">
              <a href="#start" aria-label="Junia home">
                <Logo large />
              </a>
            </B>
            <B as="nav" className="hidden items-center gap-12 text-[14px] font-medium md:flex">
              <a href="#pipeline" className="hover:text-accent">Pipeline</a>
              <a href="#pricing" className="hover:text-accent">Pricing</a>
              <a href="#how" className="hover:text-accent">How it works</a>
              <Link href="/social" className="hover:text-accent">Grow socials</Link>
            </B>
            <B className="flex items-center gap-2 justify-self-end">
              <ThemeToggle />
              <a href="#start" onClick={focusInput} className="inline-flex h-10 items-center whitespace-nowrap rounded-lg bg-ink px-4 text-[14.5px] font-semibold text-white hover:bg-ink-2 sm:px-6">
                Get started
              </a>
            </B>
          </div>
        </header>

        {/* Hero */}
        <Section id="start">
          <div className="grid gap-12 py-14 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12 lg:py-24">
            <div className="min-w-0">
              <B className="inline-flex items-center gap-2 font-mono text-[12px] text-muted">
                <span className="relative flex size-2">
                  <span className="ping-soft absolute inline-flex size-full rounded-full bg-[#0ACF83]" />
                  <span className="relative inline-flex size-2 rounded-full bg-[#0ACF83]" />
                </span>
                scout · 12 agents online
              </B>
              <B
                as="h1"
                kind="type"
                speed={34}
                text={"Outbound research,\non autopilot."}
                className="mt-6 text-[40px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[54px] xl:text-[60px]"
              />
              <B
                as="p"
                kind="type"
                speed={7}
                text="Paste your website. Scout's agents map your market, find real buyers and the person who decides, then write the first message. Every source linked."
                className="mt-6 max-w-[560px] text-[17px] leading-[1.55] text-muted sm:text-[19px]"
              />

              <div ref={heroBarRef} className="mt-9 max-w-[620px]">
                <B>
                  <CommandBar {...bar} inputRef={inputRef} openIndustry={openIndustry.hero} onSubmit={() => start("hero")} />
                </B>
                <B className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px] text-muted">target market</span>
                  <MarketPicker value={market} onChange={onMarket} auto={marketAuto} />
                  <span className="flex-1" />
                  {!showGoal && (
                    <button type="button" onClick={() => setShowGoal(true)} className="shrink-0 font-mono text-[12px] text-muted hover:text-ink">
                      + add a goal
                    </button>
                  )}
                </B>
                <div className="mt-2.5 min-h-5 text-[13px]">
                  {error ? (
                    <span className="text-bad">{error}</span>
                  ) : socialLink ? (
                    <span className="text-muted">
                      {(() => {
                        const name = PLATFORMS.find((p) => p.id === socialLink.platform)?.label ?? "social";
                        return `That's ${/^[AEIOU]/.test(name) ? "an" : "a"} ${name} profile. Press run and Scout builds a growth plan for it.`;
                      })()}
                    </span>
                  ) : pending ? (
                    <span className="text-muted">Starting as soon as Scout finishes reading your site…</span>
                  ) : (
                    <DetectNote detect={detect} auto={auto} industry={industry} />
                  )}
                </div>
                {showGoal && (
                  <input
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    autoFocus
                    placeholder={industry === "fashion" ? "Goal: get stocked in 10 boutiques this quarter" : "Goal: book 15 sales calls this month"}
                    aria-label="Your goal"
                    className="mt-2 h-11 w-full rounded-lg border border-line-2 bg-white px-3.5 text-[14px] outline-none placeholder:text-faint focus:border-[#0d99ff] focus:shadow-[0_0_0_3px_#0d99ff26]"
                  />
                )}
                <B className="mt-6 flex flex-wrap gap-3">
                  <Link href={DEMO_HREF} className="inline-flex h-11 items-center rounded-lg border border-line-2 bg-white px-5 text-[14.5px] font-semibold hover:border-ink/30">
                    See the live demo
                  </Link>
                  <Link href="/social" className="inline-flex h-11 items-center rounded-lg border border-line-2 bg-white px-5 text-[14.5px] font-semibold hover:border-ink/30">
                    Grow your socials
                  </Link>
                </B>
              </div>
            </div>

            <Orchestrator domain={VALID.test(typedDomain) && !socialLink ? typedDomain : ""} />
          </div>
        </Section>

        {/* Built for */}
        <section className="border-b border-line">
          <div className="mx-auto grid max-w-[1180px] grid-cols-2 border-x border-line sm:grid-cols-4 lg:grid-cols-8">
            <B className="col-span-2 flex items-center px-5 py-6 font-mono text-[12px] text-muted sm:col-span-4 sm:px-8 lg:col-span-1">
              Built for teams in
            </B>
            {INDUSTRIES.filter((i) => i.id !== "other").map((i) => (
              <div key={i.id} className="flex items-center justify-center border-l border-t border-line px-3 py-6 lg:border-t-0">
                <B className="text-[16px] font-semibold tracking-[-0.01em] sm:text-[17px]">{i.short}</B>
              </div>
            ))}
          </div>
        </section>

        {/* Pipeline */}
        <Section id="pipeline">
          <Head title={"Six agents.\nOne pipeline."} body="Each step is its own agent. Scout shows its work as it goes, cites every source, and stops where your judgement matters: choosing which audiences to chase." />
          <div className="-mx-5 grid border-t border-line sm:-mx-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className={`border-line px-5 py-9 sm:px-8 ${i % 3 !== 0 ? "md:border-l" : ""} ${i >= 3 ? "border-t" : i > 0 ? "max-md:border-t" : ""}`}>
                <B className="flex items-center gap-2 font-mono text-[12px] text-muted">
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <span className={`rounded px-1.5 py-px ${s.paid ? "bg-warn-soft text-warn" : "bg-good-soft text-good"}`}>{s.paid ? "paid" : "free"}</span>
                </B>
                <B as="h3" kind="type" speed={28} text={s.title} className="mt-4 text-[21px] font-semibold tracking-[-0.015em]" />
                <B as="p" className="mt-2 text-[15.5px] leading-[1.55] text-muted">
                  {s.body}
                </B>
                <B as="p" className="mt-5 font-mono text-[12px] text-accent">
                  → {s.out}
                </B>
              </div>
            ))}
          </div>
        </Section>

        {/* One run, one file */}
        <Section>
          <div className="-mx-5 grid grid-cols-[minmax(0,1fr)] sm:-mx-8 lg:grid-cols-2">
            <div className="px-5 py-16 sm:px-8 lg:py-24">
              <B as="h2" kind="type" speed={30} text={"One run maps\nyour whole market."} className="text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[40px]" />
              <B as="p" className="mt-6 max-w-[440px] text-[15.5px] leading-[1.6] text-muted">
                Every run produces one structured result: your market, the buyers in it, the people who decide and what to send them. Edit any step and re-run it on its own.
              </B>
              <B className="mt-8">
                <Link href={DEMO_HREF} className="inline-flex items-center gap-1.5 font-mono text-[13px] font-medium hover:text-accent">
                  Open the live demo <ArrowRight className="size-3.5" />
                </Link>
              </B>
            </div>
            <div className="flex items-center border-t border-line px-5 py-12 sm:px-8 lg:border-l lg:border-t-0">
              <B className="w-full overflow-hidden rounded-[10px] bg-[#121417] shadow-[0_24px_48px_-24px_#12141766]">
                <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
                  <span className="size-2.5 rounded-full bg-[#fff]/15" />
                  <span className="size-2.5 rounded-full bg-[#fff]/15" />
                  <span className="size-2.5 rounded-full bg-[#fff]/15" />
                  <span className="flex-1" />
                  <span className="font-mono text-[12px] text-[#81868d]">junia.run</span>
                </div>
                <pre className="scroll-thin overflow-x-auto px-5 py-5 font-mono text-[13px] leading-[1.75] text-[#e0e2e5]">
                  {CODE.map((line, i) => (
                    <div key={i} className="lp-code-line" style={{ ["--i" as string]: i }}>
                      {line}
                    </div>
                  ))}
                </pre>
              </B>
            </div>
          </div>
        </Section>

        {/* Numbers */}
        <section className="border-b border-line">
          <div className="mx-auto grid max-w-[1180px] grid-cols-2 border-x border-line lg:grid-cols-4">
            {STATS.map(([n, label], i) => (
              <div key={label} className={`border-line px-5 py-12 sm:px-8 ${i % 2 === 1 ? "border-l" : ""} ${i >= 2 ? "border-t lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}>
                <B kind="type" speed={60} text={n} className="text-[40px] font-semibold leading-none tracking-[-0.04em] sm:text-[52px]" />
                <B as="p" className="mt-4 max-w-[220px] text-[15.5px] leading-[1.5] text-muted">
                  {label}
                </B>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <Section id="how">
          <Head title={"From a URL to\na sent message."} body="Most runs take about three minutes. You stay in control of the parts that matter." />
          <ol className="-mx-5 grid border-t border-line sm:-mx-8 md:grid-cols-2 lg:grid-cols-4">
            {HOW.map(([title, body], i) => (
              <li key={title} className={`border-line px-5 py-10 sm:px-8 ${i > 0 ? "max-md:border-t" : ""} ${i % 2 === 1 ? "md:border-l" : ""} ${i >= 2 ? "md:max-lg:border-t lg:border-l" : ""}`}>
                <B className="font-mono text-[12px] text-muted">{String(i + 1).padStart(2, "0")}</B>
                <B as="h3" kind="type" speed={40} text={title} className="mt-6 text-[26px] font-semibold tracking-[-0.025em]" />
                <B as="p" className="mt-3 text-[15.5px] leading-[1.55] text-muted">
                  {body}
                </B>
              </li>
            ))}
          </ol>
        </Section>

        {/* Pricing */}
        <Section id="pricing">
          <Head title={"Research is free.\nPay per campaign."} body="Brand, competitors, audiences and prospects cost nothing. Unlock decision makers and outreach once per campaign. No seats, no subscription." />
          <Pricing onStart={focusInput} />
        </Section>

        {/* Saved workspaces */}
        {recent.length > 0 && (
          <Section>
            <div className="py-12">
              <div className="mb-4 flex items-center justify-between">
                <B as="p" className="font-mono text-[12px] text-muted">
                  your workspaces
                </B>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm(`Delete all ${recent.length} saved searches from this browser? Each website will be researched fresh next time.`)) return;
                    clearAllWorkspaces();
                    setRecent([]);
                  }}
                  className="font-mono text-[12px] text-muted hover:text-bad"
                >
                  clear all
                </button>
              </div>
              <B className="overflow-hidden rounded-[10px] border border-line bg-white">
                {recent.map((w) => (
                  <Link key={w.domain} href={`/w/${w.domain}?industry=${w.industry}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-subtle">
                    <Favicon domain={w.domain} name={w.name} size={24} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{w.name}</span>
                      <span className="font-mono text-[12px] text-muted">{w.domain}</span>
                    </span>
                    <Badge>
                      {getIndustry(w.industry).emoji} {getIndustry(w.industry).short}
                    </Badge>
                    <span className="hidden font-mono text-[11.5px] text-faint sm:inline">{new Date(w.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                    <ChevronRight className="size-4 text-faint" />
                  </Link>
                ))}
              </B>
            </div>
          </Section>
        )}

        {/* CTA */}
        <Section>
          <div className="-mx-5 grid grid-cols-[minmax(0,1fr)] sm:-mx-8 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className="px-5 py-16 sm:px-8 lg:py-24">
              <B as="h2" kind="type" speed={34} text={"Let Scout find\nyour buyers."} className="text-[40px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[56px] lg:text-[64px]" />
              <B as="p" className="mt-6 max-w-[520px] text-[17px] leading-[1.55] text-muted sm:text-[19px]">
                Research your market for free. Your first prospect list and sequence, in about three minutes.
              </B>
              <B className="mt-9 flex flex-wrap gap-3">
                <a href="#start" onClick={focusInput} className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-ink px-5 text-[14.5px] font-semibold text-white hover:bg-ink-2">
                  Run my pipeline <ArrowRight className="size-4" />
                </a>
                <Link href={DEMO_HREF} className="inline-flex h-11 items-center rounded-lg border border-line-2 bg-white px-5 text-[14.5px] font-semibold hover:border-ink/30">
                  Explore the demo
                </Link>
              </B>
            </div>
            <div className="border-t border-line px-5 py-12 sm:px-8 lg:border-l lg:border-t-0 lg:py-24">
              <B as="p" className="font-mono text-[13px] font-medium leading-[1.6] text-accent">
                This page was built by 12 agents while you scrolled.
              </B>
              <B as="p" className="mt-4 text-[15.5px] leading-[1.6] text-muted">
                Every box and word above was placed by an agent cursor working in parallel. Scout researches your market the same way: many small agents, one clear result.
              </B>
            </div>
          </div>
        </Section>

        {/* Footer */}
        <footer className="pb-28">
          <div className="mx-auto grid max-w-[1180px] gap-10 border-x border-line px-5 py-12 sm:grid-cols-2 sm:px-8 lg:grid-cols-[minmax(0,1fr)_160px_160px_160px]">
            <div>
              <B>
                <Logo />
              </B>
              <B as="p" className="mt-10 font-mono text-[12px] text-muted">
                © 2026 Junia · AI research with live website checks
              </B>
            </div>
            {FOOTER.map(([title, links]) => (
              <B key={title} as="nav" className="flex flex-col gap-2.5 text-[14.5px]">
                <span className="font-semibold">{title}</span>
                {links.map(([label, href]) =>
                  href.startsWith("#") ? (
                    <a key={label} href={href} className="text-ink-2 hover:text-accent">
                      {label}
                    </a>
                  ) : (
                    <Link key={label} href={href} className="text-ink-2 hover:text-accent">
                      {label}
                    </Link>
                  ),
                )}
              </B>
            ))}
          </div>
        </footer>
      </BuildCanvas>

      {/* Docked run bar: always reachable once the hero is out of view */}
      <div
        className={`dock pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(12px,env(safe-area-inset-bottom))] transition-all duration-300 ${showDock ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}
        aria-hidden={!showDock}
      >
        <div className={`mx-auto max-w-2xl ${showDock ? "pointer-events-auto" : ""}`}>
          {error && showDock && <p className="mb-1.5 text-center text-[12.5px] text-bad">{error}</p>}
          <div className="rounded-xl border border-line-2 bg-white/95 p-1.5 pl-2 shadow-[0_20px_50px_-16px_#12141755] backdrop-blur-xl">
            <CommandBar {...bar} variant="dock" extra={<MarketPicker value={market} onChange={onMarket} auto={marketAuto} compact align="right" />} inputRef={dockInputRef} openIndustry={openIndustry.dock} onSubmit={() => start("dock")} />
          </div>
        </div>
      </div>
    </main>
  );
}

/* ---------- Layout ---------- */

/** A full-width band with hairline borders, holding a framed column like a design canvas. */
function Section({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 border-b border-line">
      <div className="mx-auto max-w-[1180px] border-x border-line px-5 sm:px-8">{children}</div>
    </section>
  );
}

function Head({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid gap-6 py-16 lg:grid-cols-2 lg:gap-16 lg:py-20">
      <B as="h2" kind="type" speed={30} text={title} className="text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[40px]" />
      <B as="p" className="max-w-[460px] self-end text-[15.5px] leading-[1.6] text-muted">
        {body}
      </B>
    </div>
  );
}

/* ---------- Content ---------- */

const STEPS = [
  { title: "Brand profile", body: "Scout reads your website and socials to learn what you sell, who buys it and how you sell today.", out: "positioning · buyers · channels" },
  { title: "Competitor map", body: "Brands chasing the same buyers, every site checked live, plus the gaps none of them cover.", out: "rivals · whitespace" },
  { title: "Audience segments", body: "Groups worth targeting, with their pains, buying triggers and the hook that opens a conversation.", out: "pains · triggers · hooks" },
  { title: "Real prospects", body: "Named stores and companies that fit each audience, with the signal that says they're buying now.", out: "accounts · buying signals" },
  { title: "Decision makers", body: "The founder, buyer or manager who says yes, with public profiles and verified emails on Pro.", out: "people · emails", paid: true },
  { title: "Outreach sequences", body: "A 4-touch DM, email and WhatsApp sequence for each person. Copy, send, mark as done.", out: "DM · email · WhatsApp", paid: true },
];

const k = (t: string) => <span className="text-[#9aa6ff]">{t}</span>;
const v = (t: string) => <span className="text-[#7ee0b5]">{t}</span>;
const c = (t: string) => <span className="text-[#6b7079]">{t}</span>;
const CODE: React.ReactNode[] = [
  c("# junia.run"),
  <>{k("brand")}: {v("theeditroom.co")}</>,
  <>{k("market")}: {v("Lagos, Nigeria")}</>,
  <>{k("pipeline")}:</>,
  <>{"  "}{k("competitors")}: {"{"} found: {v("12")}, sites_checked: {v("true")} {"}"}</>,
  <>{"  "}{k("audiences")}:   {"{"} proposed: {v("6")}, picked: {v("3")} {"}"}</>,
  <>{"  "}{k("prospects")}:   {"{"} accounts: {v("38")}, signals: {v("true")} {"}"}</>,
  <>{"  "}{k("people")}:      {"{"} per_account: {v("2")}, emails: {v("verified")} {"}"}</>,
  <>{k("outreach")}:</>,
  <>{"  "}{k("channels")}: [{v("instagram_dm")}, {v("email")}, {v("whatsapp")}]</>,
  <>{"  "}{k("touches")}: {v("4")}</>,
  <>{k("export")}: {v("csv")}</>,
];

const STATS: [string, string][] = [
  ["6", "steps from your website to a first message"],
  ["190+", "countries to target, down to the state"],
  ["$0", "to research your market and find prospects"],
  ["4", "touches per sequence across DM, email and WhatsApp"],
];

const HOW: [string, string][] = [
  ["Paste", "Drop your website or a social profile link. Scout detects your industry and home market."],
  ["Approve", "Scout proposes audiences with pains and hooks. Pick up to three to run as campaigns."],
  ["Unlock", "Pay once per campaign to get decision makers and a ready sequence for each one."],
  ["Send", "Open each DM or email in one click, mark who you've reached and export to CSV."],
];

const FOOTER: [string, [string, string][]][] = [
  ["Product", [["Pipeline", "#pipeline"], ["Pricing", "#pricing"], ["How it works", "#how"]]],
  ["Try it", [["Live demo", DEMO_HREF], ["Grow socials", "/social"]]],
  ["Start", [["Run my pipeline", "#start"]]],
];

/* ---------- Hero: live orchestration diagram ---------- */

const AGENT_CARDS = ["agent/brand", "agent/market", "agent/prospects", "agent/outreach"];

/** Scout's agents working through a run, on a loop. Shows the domain you type. */
function Orchestrator({ domain }: { domain: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => (n + 1) % 14), 900);
    return () => clearInterval(t);
  }, []);
  // 0-1 brand, 2-4 market, 5-8 prospects, 9-11 outreach, 12-13 done
  const phase = tick < 2 ? 0 : tick < 5 ? 1 : tick < 9 ? 2 : tick < 12 ? 3 : 4;
  const comps = Math.min(12, Math.max(0, (tick - 1) * 4));
  const accounts = Math.min(38, Math.max(0, (tick - 4) * 9));
  const status = [
    phase > 0 ? "● profile ready" : "● reading site",
    phase > 1 ? `● ${comps} competitors mapped` : phase === 1 ? `● ${comps} competitors…` : "○ waiting",
    phase > 2 ? `● ${accounts} accounts found` : phase === 2 ? `● ${accounts} accounts…` : "○ waiting",
    phase > 3 ? "● 4 touches drafted" : phase === 3 ? "● drafting sequence" : "○ waiting",
  ];
  const progress = Math.min(100, Math.round(((tick + 1) / 12) * 100));
  return (
    <div className="mx-auto w-full max-w-[400px] lg:pt-6">
      <B className="rounded-[10px] bg-[#121417] px-4 py-3.5 font-mono text-[#fff] shadow-[0_18px_40px_-20px_#12141780]">
        <p className="truncate text-[14px] font-medium">
          scout.run(<span className="text-[#9aa6ff]">&quot;{domain || "yourbrand.com"}&quot;</span>)
        </p>
        <p className="mt-1 text-[12px] text-[#fff]/45">orchestrator · 6 steps queued</p>
      </B>
      <B aria-hidden className="relative h-8">
        <span className="absolute left-1/2 top-0 h-4 w-px bg-line-2" />
        <span className="absolute left-[calc(25%-4px)] right-[calc(25%-4px)] top-4 h-px bg-line-2" />
        <span className="absolute left-[calc(25%-4px)] top-4 h-4 w-px bg-line-2" />
        <span className="absolute right-[calc(25%-4px)] top-4 h-4 w-px bg-line-2" />
      </B>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        {AGENT_CARDS.map((name, i) => {
          const on = phase === i;
          const done = phase > i;
          return (
            <B key={name} className={`rounded-lg border bg-white px-3.5 py-3 font-mono transition-colors duration-300 ${on ? "border-accent shadow-[0_0_0_3px_#4c5bd41f]" : "border-line"}`}>
              <p className="text-[13px] font-medium">{name}</p>
              <p className={`mt-1 truncate text-[12px] ${done ? "text-good" : on ? "text-accent" : "text-faint"}`}>{status[i]}</p>
            </B>
          );
        })}
      </div>
      <B className="mt-7">
        <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
          <div className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-3 font-mono text-[12px] text-muted">
          4 agents · {accounts} leads in flight · 0 duplicates
        </p>
      </B>
    </div>
  );
}

/* ---------- Pricing ---------- */

function Pricing({ onStart }: { onStart: () => void }) {
  const config = usePayConfig();
  const free = ["Brand profile from your website", "Competitor map with live-checked sites", "Audience segments with pains and hooks", "10-12 prospect accounts per campaign", "Buying signals for each prospect"];
  return (
    <div className="-mx-5 border-t border-line sm:-mx-8">
      <div className="grid lg:grid-cols-3">
        <Plan name="Research" price="$0" unit="free forever" blurb="Steps 1-4: understand your market." features={free} cta="Start free" onClick={onStart} />
        {(config?.tiers ?? []).map((t) => (
          <Plan key={t.id} name={t.name} price={usd(t.price)} unit="per campaign" blurb={`${t.blurb}. Steps 5-6.`} features={t.features} cta={`Start with ${t.name}`} onClick={onStart} highlight={t.highlight} />
        ))}
        {!config && [0, 1].map((i) => <div key={i} className="skeleton m-8 h-96 rounded-lg" />)}
      </div>
      {config?.social && (
        <div className="flex flex-col gap-5 border-t border-line px-5 py-8 sm:px-8 lg:flex-row lg:items-center">
          <div className="flex-1">
            <B as="p" className="text-[16px] font-semibold">
              {config.social.name}
            </B>
            <B as="p" className="mt-1.5 max-w-[620px] text-[15px] leading-[1.55] text-muted">
              Audit your Instagram, TikTok and other accounts and get a 30-day plan to grow them. Free preview of your scores; re-run the same accounts free for {config.social.days} days.
            </B>
          </div>
          <B className="flex items-baseline gap-2">
            <span className="text-[36px] font-semibold tracking-[-0.03em]">{usd(config.social.price)}</span>
            <span className="font-mono text-[12px] text-muted">per plan</span>
          </B>
          <B>
            <Link href="/social" className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-ink px-5 text-[14.5px] font-semibold text-white hover:bg-ink-2">
              Grow your socials <ArrowRight className="size-4" />
            </Link>
          </B>
        </div>
      )}
    </div>
  );
}

function Plan({ name, price, unit, blurb, features, cta, onClick, highlight }: { name: string; price: string; unit: string; blurb: string; features: string[]; cta: string; onClick: () => void; highlight?: boolean }) {
  return (
    <div className={`flex flex-col border-line px-5 py-10 sm:px-8 [&:not(:first-child)]:max-lg:border-t lg:[&:not(:first-child)]:border-l ${highlight ? "bg-white" : ""}`}>
      <B className="flex items-center gap-2">
        <span className="text-[16px] font-semibold">{name}</span>
        {highlight && <span className="rounded bg-accent-soft px-1.5 py-px font-mono text-[11px] text-accent">most popular</span>}
      </B>
      <B kind="type" speed={70} text={price} className="mt-5 text-[44px] font-semibold leading-none tracking-[-0.04em]" />
      <B as="p" className="mt-2.5 font-mono text-[12px] text-muted">
        {unit}
      </B>
      <B as="p" className="mt-5 text-[15px] leading-[1.55] text-muted">
        {blurb}
      </B>
      <B as="ul" className="mt-6 flex-1 space-y-3">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-[14.5px]">
            <Check className={`mt-0.5 size-4 shrink-0 ${highlight ? "text-accent" : "text-good"}`} />
            {f}
          </li>
        ))}
      </B>
      <B className="mt-8">
        <a
          href="#start"
          onClick={onClick}
          className={`inline-flex h-11 w-full items-center justify-center rounded-lg text-[14.5px] font-semibold ${highlight || name === "Research" ? "bg-ink text-white hover:bg-ink-2" : "border border-line-2 bg-white hover:border-ink/30"}`}
        >
          {cta}
        </a>
      </B>
    </div>
  );
}

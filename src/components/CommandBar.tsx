"use client";

import { ArrowRight, Check, ChevronDown, Globe, Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { countryName } from "@/lib/geo";
import { INDUSTRIES, getIndustry } from "@/lib/industries";
import { cleanDomain } from "@/lib/store";
import { parseHandle } from "@/lib/social-shared";
import { Favicon } from "./ui";

export interface DetectResult {
  industry: string;
  confidence: number;
  name: string;
  description: string;
  matched: string[];
  readSite: boolean;
  country?: string;
  region?: string;
}

export type DetectState = { status: "idle" } | { status: "detecting"; domain: string } | { status: "done"; domain: string; result: DetectResult } | { status: "failed"; domain: string };

const VALID = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** Detects the industry of whatever site is typed, after a short pause (instantly on paste). */
export function useIndustryDetection(domainInput: string, onDetected: (result: DetectResult) => void) {
  const [state, setState] = useState<DetectState>({ status: "idle" });
  const [instant, setInstant] = useState(0);
  const cb = useRef(onDetected);
  cb.current = onDetected;

  useEffect(() => {
    const domain = cleanDomain(domainInput);
    // Social profile links go to the growth plan instead, so there's no website to read.
    if (!VALID.test(domain) || parseHandle(domainInput.trim())?.platform) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    const t = setTimeout(
      async () => {
        setState({ status: "detecting", domain });
        try {
          const res = await fetch(`/api/detect?domain=${encodeURIComponent(domain)}`);
          if (!res.ok) throw new Error();
          const result = (await res.json()) as DetectResult;
          if (cancelled) return;
          if (!result.readSite && result.industry === "other") {
            setState({ status: "failed", domain });
            return;
          }
          setState({ status: "done", domain, result });
          if (result.industry !== "other" || result.readSite) cb.current(result);
        } catch {
          if (!cancelled) setState({ status: "failed", domain });
        }
      },
      instant ? 0 : 700,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [domainInput, instant]);

  return { state, detectNow: () => setInstant((n) => n + 1) };
}

export function IndustryPicker({
  value,
  onChange,
  compact,
  auto,
  needsChoice,
  openSignal = 0,
}: {
  /** Empty string = not chosen yet (shown as "Auto-detect"). */
  value: string;
  onChange: (id: string) => void;
  compact?: boolean;
  auto?: boolean;
  /** Detection couldn't tell, so ask the user to pick. */
  needsChoice?: boolean;
  /** Increment to open the menu from outside (e.g. when Run is pressed without an industry). */
  openSignal?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ind = value ? getIndustry(value) : null;

  useEffect(() => {
    if (openSignal > 0) setOpen(true);
  }, [openSignal]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ind ? `Industry: ${ind.label}. Change` : needsChoice ? "Pick your industry" : "Industry: detected from your website. Pick manually"}
        title={ind ? undefined : "We detect your industry from your website. You can also pick it."}
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-colors ${
          !ind && needsChoice
            ? "border-warn/40 bg-warn-soft text-warn"
            : auto
              ? "border-accent/25 bg-accent-soft text-accent"
              : !ind
                ? "border-dashed border-line-2 bg-white text-muted hover:border-ink/30 hover:text-ink-2"
                : "border-line bg-subtle text-ink-2 hover:border-line-2"
        }`}
      >
        {ind ? (
          <>
            {auto && <Sparkles className="size-3" />}
            <span>{ind.emoji}</span>
            {!compact && <span className="hidden sm:inline">{ind.short}</span>}
          </>
        ) : (
          <>
            <Sparkles className="size-3" />
            {!compact && <span className="hidden sm:inline">{needsChoice ? "Pick industry" : "Auto-detect"}</span>}
          </>
        )}
        <ChevronDown className="size-3.5 opacity-60" />
      </button>
      {open && (
        <ul role="listbox" aria-label="Industry" className="card-raised absolute bottom-auto right-0 top-full z-50 mt-2 w-60 p-1 [.dock_&]:bottom-full [.dock_&]:top-auto [.dock_&]:mb-2 [.dock_&]:mt-0">
          {INDUSTRIES.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                role="option"
                aria-selected={i.id === value}
                onClick={() => {
                  onChange(i.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] ${i.id === value ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-subtle"}`}
              >
                <span>{i.emoji}</span>
                <span className="flex-1">{i.label}</span>
                {i.id === value && <Check className="size-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CommandBar({
  domain,
  onDomain,
  industry,
  onIndustry,
  auto,
  detect,
  onPaste,
  onSubmit,
  inputRef,
  variant = "hero",
  extra,
  needsIndustry,
  openIndustry,
}: {
  domain: string;
  onDomain: (v: string) => void;
  industry: string;
  onIndustry: (id: string) => void;
  auto: boolean;
  detect: DetectState;
  onPaste: () => void;
  onSubmit: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
  variant?: "hero" | "dock";
  /** Extra control shown before the industry picker (the dock puts the market picker here). */
  extra?: React.ReactNode;
  needsIndustry?: boolean;
  openIndustry?: number;
}) {
  const hero = variant === "hero";
  const clean = cleanDomain(domain);
  const valid = VALID.test(clean);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className={`flex items-center gap-1.5 bg-white ${hero ? "rounded-xl border border-line-2 p-1.5 shadow-[0_1px_2px_#1214170f,0_12px_32px_-18px_#12141740] focus-within:border-[#0d99ff] focus-within:shadow-[0_0_0_3px_#0d99ff26]" : "rounded-xl bg-transparent"}`}
    >
      <span className="grid size-9 shrink-0 place-items-center">
        {valid && detect.status !== "idle" ? <Favicon domain={clean} name={clean} size={hero ? 24 : 20} /> : <Globe className="size-4 text-faint" />}
      </span>
      <input
        ref={inputRef}
        value={domain}
        onChange={(e) => onDomain(e.target.value)}
        onPaste={onPaste}
        placeholder="Website or social profile link"
        aria-label="Your website"
        inputMode="url"
        autoComplete="url"
        className={`h-10 min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint ${hero ? "text-[16px]" : "text-[14.5px]"}`}
      />
      {detect.status === "detecting" ? (
        <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-subtle px-2.5 text-[12.5px] text-muted">
          <Loader2 className="spin size-3.5" /> <span className="hidden sm:inline">Detecting</span>
        </span>
      ) : (
        <>
          {extra}
          <IndustryPicker value={industry} onChange={onIndustry} auto={auto} compact={!hero} needsChoice={needsIndustry} openSignal={openIndustry} />
        </>
      )}
      <button
        type="submit"
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ink font-semibold text-white transition-colors hover:bg-ink-2 ${hero ? "h-11 px-5 text-[14.5px]" : "h-10 px-4 text-[13.5px]"}`}
      >
        <span className="hidden sm:inline">Run pipeline</span>
        <span className="sm:hidden">Run</span>
        <ArrowRight className="size-4" />
      </button>
    </form>
  );
}

/** One line under the bar explaining what was detected. */
export function DetectNote({ detect, auto, industry }: { detect: DetectState; auto: boolean; industry: string }) {
  if (detect.status === "detecting")
    return (
      <span className="inline-flex items-center gap-1.5 text-muted">
        <Loader2 className="spin size-3" /> Scout is reading <span className="font-mono text-ink-2">{detect.domain}</span>…
      </span>
    );
  if (detect.status === "failed")
    return <span className="text-warn">Couldn&apos;t read that site automatically. Pick what you sell from the industry menu.</span>;
  if (detect.status === "done" && auto) {
    const r = detect.result;
    return (
      <span className="inline-flex flex-wrap items-center justify-center gap-x-1.5 text-muted">
        <Check className="size-3 text-good" />
        Detected <span className="font-medium text-ink">{getIndustry(industry).label}</span>
        {r.name && (
          <>
            for <span className="font-medium text-ink">{r.name}</span>
          </>
        )}
        {r.country && (
          <>
            in <span className="font-medium text-ink">{r.region ? `${r.region}, ${countryName(r.country)}` : countryName(r.country)}</span>
          </>
        )}
        {r.matched.length > 0 && <span className="font-mono text-[11px] text-faint">· {r.matched.slice(0, 3).join(", ")}</span>}
      </span>
    );
  }
  if (detect.status === "done") return <span className="text-muted">Industry set manually.</span>;
  return <span className="text-muted">We&apos;ll detect your industry automatically when you paste your link.</span>;
}

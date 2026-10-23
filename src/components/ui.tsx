"use client";

import { AtSign, Check, Copy, Mail, MessageCircle, Music2, Phone, type LucideProps } from "lucide-react";
import { useState } from "react";

// Brand marks (lucide no longer ships logos).
export function Instagram(props: LucideProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={props.className}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function Linkedin(props: LucideProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={props.className}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="3" />
      <path d="M7.5 10.5v6M7.5 7.5v.01M11.5 16.5v-6M11.5 13a2.5 2.5 0 0 1 5 0v3.5" />
    </svg>
  );
}

export function Logo({ compact, large }: { compact?: boolean; large?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display font-semibold tracking-tight ${large ? "text-[18px]" : "text-[15px]"}`}>
      <span className={`relative grid place-items-center rounded-lg bg-ink text-white shadow-[inset_0_1px_0_#ffffff26] ${large ? "size-8" : "size-7"}`}>
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="17" r="2" />
          <circle cx="18" cy="7" r="2" />
          <path d="M7.6 15.6 16.4 8.4" />
          <path d="M6 9V5h4" />
        </svg>
      </span>
      {!compact && "Junia"}
    </span>
  );
}

/** Scout, the research agent: a small animated orb. */
export function AgentMark({ size = 20, active }: { size?: number; active?: boolean }) {
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      {active && <span className="ping-soft absolute inset-0 rounded-full bg-accent/40" />}
      <span
        className="relative size-full rounded-full"
        style={{ background: "conic-gradient(from 200deg, #4f46e5, #a855f7, #ec4899, #f59e0b, #4f46e5)", boxShadow: "inset 0 0 0 1.5px #ffffff66" }}
      />
      <span className="absolute rounded-full bg-white" style={{ width: size * 0.36, height: size * 0.36 }} />
    </span>
  );
}

export function LiveDot({ tone = "good" }: { tone?: "good" | "accent" | "warn" }) {
  const c = tone === "good" ? "bg-good" : tone === "accent" ? "bg-accent" : "bg-warn";
  return (
    <span className="relative inline-flex size-2">
      <span className={`ping-soft absolute inset-0 rounded-full ${c}`} />
      <span className={`relative size-2 rounded-full ${c}`} />
    </span>
  );
}

export function Favicon({ domain, name, size = 28 }: { domain?: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const host = domain?.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const usable = host && !host.endsWith(".example") && !failed;
  const hues = [234, 262, 330, 24, 160, 199];
  const hue = hues[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % hues.length, 1)];
  return usable ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="shrink-0 rounded-md border border-line bg-white object-contain p-0.5"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-md border text-[10px] font-semibold"
      style={{ width: size, height: size, background: `light-dark(hsl(${hue} 80% 97%), hsl(${hue} 35% 16%))`, borderColor: `light-dark(hsl(${hue} 60% 88%), hsl(${hue} 30% 26%))`, color: `light-dark(hsl(${hue} 55% 38%), hsl(${hue} 70% 78%))` }}
    >
      {name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?"}
    </span>
  );
}

const CHANNELS: Record<string, { label: string; Icon: (p: LucideProps) => React.ReactNode; tone: string }> = {
  email: { label: "Email", Icon: Mail, tone: "text-info" },
  instagram: { label: "Instagram DM", Icon: Instagram, tone: "text-pink" },
  whatsapp: { label: "WhatsApp", Icon: MessageCircle, tone: "text-good" },
  linkedin: { label: "LinkedIn", Icon: Linkedin, tone: "text-accent" },
  tiktok: { label: "TikTok", Icon: Music2, tone: "text-ink" },
  phone: { label: "Call", Icon: Phone, tone: "text-warn" },
};

export function ChannelChip({ channel, compact }: { channel: string; compact?: boolean }) {
  const c = CHANNELS[channel] ?? { label: channel, Icon: AtSign, tone: "text-muted" };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-1.5 py-0.5 text-[11px] font-medium text-ink-2">
      <c.Icon className={`size-3 ${c.tone}`} />
      {!compact && c.label}
    </span>
  );
}

type Tone = "plain" | "good" | "warn" | "bad" | "accent" | "info" | "pink";
const TONES: Record<Tone, string> = {
  plain: "bg-subtle text-ink-2 border-line",
  good: "bg-good-soft text-good border-good/15",
  warn: "bg-warn-soft text-warn border-warn/20",
  bad: "bg-bad-soft text-bad border-bad/15",
  accent: "bg-accent-soft text-accent border-accent/15",
  info: "bg-info-soft text-info border-info/15",
  pink: "bg-pink-soft text-pink border-pink/15",
};

export function Badge({ children, tone = "plain", dot }: { children: React.ReactNode; tone?: Tone; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${TONES[tone]}`}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "accent"; size?: "sm" | "md" | "lg" }) {
  const styles = {
    primary: "bg-ink text-white hover:bg-ink-2 disabled:bg-line-2 disabled:text-muted",
    accent: "bg-accent text-[#fff] hover:bg-accent-2 disabled:bg-line-2 disabled:text-muted",
    secondary: "border border-line-2 bg-white text-ink hover:border-ink/30 disabled:opacity-50 disabled:hover:border-line-2",
    ghost: "text-ink-2 hover:bg-paper",
  };
  const sizes = { sm: "h-7 px-2.5 text-xs gap-1", md: "h-9 px-3.5 text-sm gap-1.5", lg: "h-11 px-5 text-sm gap-2" };
  return (
    <button
      {...props}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed ${sizes[size]} ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          /* clipboard blocked; nothing to do */
        }
      }}
    >
      {done ? <Check className="size-3.5 text-good" /> : <Copy className="size-3.5" />}
      {done ? "Copied" : label}
    </Button>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-line bg-subtle px-1 font-mono text-[10px] text-muted">{children}</kbd>;
}

export function flag(code: string) {
  if (!/^[A-Za-z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function fmtSecs(ms: number) {
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

/** Only plain web links from research results; anything else (javascript:, data:, …) isn't linked. */
export function safeHref(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** A bare Instagram username, or undefined if the value isn't one. */
export const igHandle = (v: string | undefined) => {
  const h = v?.trim().replace(/^@/, "");
  return h && /^[A-Za-z0-9._]{1,30}$/.test(h) ? h : undefined;
};

/** A single plain email address (no extra mailto parameters smuggled in). */
export const plainEmail = (v: string | undefined) => (v && /^[^\s@?&#/:]+@[^\s@?&#/:]+\.[^\s@?&#/:]+$/.test(v) ? v : undefined);


"use client";

import { AlertCircle, Check, ChevronDown, CornerDownRight, FileText, Globe, Lock, Pencil, RotateCw, Search, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { LogLine, RunState } from "@/lib/useRun";
import { AgentMark, Badge, Button, fmtSecs } from "./ui";

export type StepStatus = "locked" | "waiting" | "running" | "done" | "error" | "needs-you";

export function StatusIcon({ status, size = 22 }: { status: StepStatus; size?: number }) {
  const box = { width: size, height: size };
  if (status === "done")
    return (
      <span style={box} className="grid shrink-0 place-items-center rounded-full bg-good text-[#fff] shadow-[0_0_0_3px_#16a34a1f]">
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  if (status === "running")
    return (
      <span style={box} className="relative grid shrink-0 place-items-center">
        <span className="spin absolute inset-0 rounded-full border-2 border-accent/20 border-t-accent" />
        <span className="size-1.5 rounded-full bg-accent" />
      </span>
    );
  if (status === "error")
    return (
      <span style={box} className="grid shrink-0 place-items-center rounded-full bg-bad text-[#fff] shadow-[0_0_0_3px_#dc26261f]">
        <X className="size-3" strokeWidth={3} />
      </span>
    );
  if (status === "needs-you")
    return (
      <span style={box} className="relative grid shrink-0 place-items-center rounded-full border-2 border-accent bg-accent-soft">
        <span className="size-2 rounded-full bg-accent" />
      </span>
    );
  if (status === "waiting") return <span style={box} className="shrink-0 rounded-full border-2 border-dashed border-line-2" />;
  return (
    <span style={box} className="grid shrink-0 place-items-center rounded-full border border-line bg-subtle text-faint">
      <Lock className="size-2.5" />
    </span>
  );
}

const STATUS_LABEL: Record<StepStatus, { text: string; tone: "plain" | "good" | "accent" | "bad" | "warn" }> = {
  locked: { text: "Locked", tone: "plain" },
  waiting: { text: "Queued", tone: "plain" },
  running: { text: "Running", tone: "accent" },
  done: { text: "Completed", tone: "good" },
  error: { text: "Failed", tone: "bad" },
  "needs-you": { text: "Needs review", tone: "warn" },
};

export function StatusBadge({ status }: { status: StepStatus }) {
  const s = STATUS_LABEL[status];
  return (
    <Badge tone={s.tone} dot>
      {s.text}
    </Badge>
  );
}

export function Section({
  id,
  n,
  title,
  subtitle,
  status,
  meta,
  actions,
  children,
}: {
  id: string;
  n: number;
  title: string;
  subtitle?: string;
  status: StepStatus;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const locked = status === "locked";
  return (
    <section id={id} className={`scroll-mt-24 overflow-hidden ${locked ? "rounded-[10px] border border-dashed border-line-2 bg-subtle/60" : "card"}`}>
      <header className="flex items-center gap-3.5 px-4 py-3.5 sm:px-5">
        <StatusIcon status={status} />
        <button className="min-w-0 flex-1 text-left" onClick={() => !locked && setOpen((o) => !o)} aria-expanded={!locked && open} disabled={locked}>
          <span className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-muted">step {String(n).padStart(2, "0")}</span>
            {!locked && <StatusBadge status={status} />}
          </span>
          <span className={`mt-1 block text-[16px] font-semibold tracking-[-0.015em] ${locked ? "text-faint" : ""}`}>{title}</span>
          {subtitle && <span className={`block truncate text-[13px] ${locked ? "text-faint" : "text-muted"}`}>{subtitle}</span>}
        </button>
        {!locked && (
          <div className="flex items-center gap-1.5">
            {meta && <span className="hidden font-mono text-[11px] text-muted sm:inline">{meta}</span>}
            {actions}
            <button onClick={() => setOpen((o) => !o)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-paper hover:text-ink" aria-label={open ? "Collapse" : "Expand"}>
              <ChevronDown className={`size-4 transition-transform ${open ? "" : "-rotate-90"}`} />
            </button>
          </div>
        )}
      </header>
      {open && !locked && children && <div className="border-t border-line px-4 py-5 sm:px-5">{children}</div>}
    </section>
  );
}

export function RerunButton({ onClick, disabled, label = "Re-run" }: { onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick} disabled={disabled} title={label}>
      <RotateCw className="size-3" /> <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}

const ICON = { search: Search, fetch: Globe, think: Sparkles, done: FileText };
const TOOL = { search: "web.search", fetch: "web.fetch", think: "reason", done: "compose" };

export function LogRow({ line, start, last }: { line: LogLine; start?: number; last?: boolean }) {
  const Icon = ICON[line.kind ?? "think"];
  const t = start ? `+${((line.at - start) / 1000).toFixed(1)}s` : "";
  return (
    <div className={`rise grid grid-cols-[52px_92px_1fr] items-start gap-2 py-[3px] ${last ? "text-[#fff]" : "text-[#fff]/55"}`}>
      <span className="text-[#fff]/30 tabular-nums">{t}</span>
      <span className={`inline-flex items-center gap-1.5 ${last ? "text-[#a5b4fc]" : "text-[#fff]/40"}`}>
        <Icon className="size-3 shrink-0" />
        {TOOL[line.kind ?? "think"]}
      </span>
      <span className="min-w-0 break-words">
        {line.text}
        {last && <span className="caret ml-1 inline-block h-3 w-[7px] translate-y-0.5 bg-[#a5b4fc]" />}
      </span>
    </div>
  );
}

/** Live agent console shown while a step runs, plus placeholder rows. */
export function Activity({ run, onRetry, rows = 3, label }: { run: RunState; onRetry?: () => void; rows?: number; label?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (run.status !== "running") return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [run.status]);

  if (run.status === "error")
    return (
      <div className="flex flex-col gap-3 rounded-[10px] border border-bad/20 bg-bad-soft/60 p-4 sm:flex-row sm:items-center">
        <AlertCircle className="size-5 shrink-0 text-bad" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-bad">Run failed</p>
          <p className="text-sm text-ink-2">{run.error}</p>
        </div>
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            <RotateCw className="size-3.5" /> Retry
          </Button>
        )}
      </div>
    );

  if (run.status !== "running") return null;
  const elapsed = run.startedAt ? now - run.startedAt : 0;
  const lines = run.logs.slice(-7);
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[10px] border border-[#121417] bg-[#121417] shadow-[0_18px_40px_-28px_#12141780]">
        <div className="flex items-center gap-2.5 border-b border-white/8 px-4 py-2.5">
          <AgentMark size={16} active />
          <span className="text-[12px] font-medium text-[#fff]">Scout</span>
          <span className="text-[12px] text-[#fff]/40">{label ?? "is working"}</span>
          <span className="flex-1" />
          <span className="font-mono text-[11px] tabular-nums text-[#fff]/50">{fmtSecs(elapsed)}</span>
        </div>
        <div className="max-h-56 overflow-hidden px-4 py-3 font-mono text-[11.5px] leading-5">
          {lines.length === 0 ? (
            <div className="text-[#fff]/50">
              <CornerDownRight className="mr-1.5 inline size-3" />
              Booting agent<span className="caret">_</span>
            </div>
          ) : (
            lines.map((l, i) => <LogRow key={l.at + l.text} line={l} start={run.startedAt} last={i === lines.length - 1} />)
          )}
        </div>
        <div className="h-0.5 bg-white/5">
          <div className="h-full bg-gradient-to-r from-accent via-[#a855f7] to-[#ec4899] transition-all duration-500" style={{ width: `${Math.min(92, 8 + run.logs.length * 14)}%` }} />
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton size-7 shrink-0" style={{ animationDelay: `${i * 120}ms` }} />
            <div className="skeleton h-3.5 flex-1" style={{ animationDelay: `${i * 120}ms`, maxWidth: `${70 - i * 12}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function EditableText({ value, onSave, multiline }: { value: string; onSave: (v: string) => void; multiline?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  if (!editing)
    return (
      <span className="group/edit">
        {value}
        <button
          onClick={() => setEditing(true)}
          className="ml-1.5 inline-grid size-6 place-items-center rounded-md align-middle text-muted hover:bg-paper hover:text-ink sm:opacity-0 sm:group-hover/edit:opacity-100"
          aria-label="Edit"
        >
          <Pencil className="size-3" />
        </button>
      </span>
    );

  const save = () => {
    onSave(draft.trim() || value);
    setEditing(false);
  };
  return (
    <span className="block">
      {multiline ? (
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} autoFocus className="w-full rounded-lg border border-line-2 bg-white p-3 text-sm outline-none focus:border-accent focus:ring-3 focus:ring-accent/10" />
      ) : (
        <input value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && save()} className="w-full rounded-lg border border-line-2 px-3 py-2 text-sm outline-none focus:border-accent" />
      )}
      <span className="mt-2 flex gap-2">
        <Button size="sm" onClick={save}>Save</Button>
        <Button size="sm" variant="ghost" onClick={() => { setDraft(value); setEditing(false); }}>Cancel</Button>
      </span>
    </span>
  );
}

export function TagList({ items, onRemove, onAdd, tone = "plain" }: { items: string[]; onRemove?: (i: number) => void; onAdd?: (v: string) => void; tone?: "plain" | "accent" }) {
  const [adding, setAdding] = useState("");
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <span key={t + i} className={`group inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12.5px] ${tone === "accent" ? "border-accent/15 bg-accent-soft text-accent" : "border-line bg-subtle text-ink-2"}`}>
          {t}
          {onRemove && (
            <button onClick={() => onRemove(i)} className="text-faint opacity-60 hover:text-bad group-hover:opacity-100" aria-label={`Remove ${t}`}>
              <X className="size-3" />
            </button>
          )}
        </span>
      ))}
      {onAdd && (
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && adding.trim()) {
              onAdd(adding.trim());
              setAdding("");
            }
          }}
          placeholder="+ Add"
          aria-label="Add item"
          className="w-16 rounded-md border border-dashed border-line-2 bg-transparent px-2 py-0.5 text-[12.5px] outline-none transition-all placeholder:text-faint focus:w-36 focus:border-accent"
        />
      )}
    </div>
  );
}

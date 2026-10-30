"use client";

import { ArrowLeft, CalendarClock, Check, Copy, KanbanSquare, Loader2, Mail, MessageCircle, Plus, Send, Sparkles, Table2, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LEAD_STATUSES, MAX_FOLLOW_UPS, STATUS_LABEL, STOPS_SEQUENCE, type FollowUp, type Lead, type LeadStatus, type PipelineData } from "@/lib/leads-shared";
import { loadWorkspace } from "@/lib/store";
import { AccountButton, useAuth } from "./Auth";
import { ThemeToggle } from "./ThemeToggle";
import { Badge, Button, Favicon, Instagram, Linkedin, Logo, igHandle, plainEmail, safeHref } from "./ui";

// Results tracking for one workspace: every lead found or messaged, by status, with
// follow-ups that come due on schedule and send in one click from the user's own apps.

const STATUS_TONE: Record<LeadStatus, string> = {
  found: "bg-subtle text-ink-2",
  contacted: "bg-info-soft text-info",
  replied: "bg-accent-soft text-accent",
  interested: "bg-warn-soft text-warn",
  signed_up: "bg-good-soft text-good",
  not_interested: "bg-bad-soft text-bad",
};

const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

async function api<T = { ok: boolean }>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
  return data;
}

/** Where a message goes: a link that opens the right app with the text ready (and the text, to copy). */
export function sendTarget(lead: Pick<Lead, "email" | "instagram" | "linkedin">, channel: string, subject: string | null, body: string) {
  const email = plainEmail(lead.email ?? undefined);
  if (channel === "email" && email) return { href: `mailto:${email}?subject=${encodeURIComponent(subject ?? "")}&body=${encodeURIComponent(body)}`, label: "Email", copy: false };
  if (channel === "instagram" && igHandle(lead.instagram ?? undefined)) return { href: `https://ig.me/m/${igHandle(lead.instagram ?? undefined)}`, label: "Open DM", copy: true };
  if (channel === "whatsapp") return { href: `https://wa.me/?text=${encodeURIComponent(body)}`, label: "WhatsApp", copy: false };
  if (channel === "linkedin" && safeHref(lead.linkedin)) return { href: safeHref(lead.linkedin)!, label: "LinkedIn", copy: true };
  return { href: "", label: "Copy", copy: true };
}

export default function PipelineView({ domain }: { domain: string }) {
  const { user, ready, open } = useAuth();
  const [data, setData] = useState<PipelineData | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<"board" | "table">("board");
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  useEffect(() => setBrand(loadWorkspace(domain)?.profile?.name ?? null), [domain]);

  const refresh = useCallback(async () => {
    try {
      setData(await api<PipelineData>(`/api/leads?workspace=${encodeURIComponent(domain)}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [domain]);

  useEffect(() => {
    if (ready && user) refresh();
  }, [ready, user, refresh]);

  // Optimistic status change (drag or menu), then save.
  const setStatus = async (id: string, status: LeadStatus) => {
    setData((d) => d && { ...d, leads: d.leads.map((l) => (l.id === id ? { ...l, status, followUps: STOPS_SEQUENCE.includes(status) ? l.followUps.filter((f) => f.status === "sent") : l.followUps } : l)) });
    try {
      await api(`/api/leads/${id}`, "PATCH", { status });
    } finally {
      refresh();
    }
  };

  const due = useMemo(
    () => (data?.leads ?? []).flatMap((l) => l.followUps.filter((f) => f.status === "due").map((f) => ({ lead: l, f }))).sort((a, b) => a.f.dueAt - b.f.dueAt),
    [data],
  );
  const lead = data?.leads.find((l) => l.id === openId) ?? null;

  return (
    <div className="lp lp-app min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur-md">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-5">
          <Link href="/" aria-label="Home">
            <Logo compact />
          </Link>
          <span className="text-line-2 max-sm:hidden">/</span>
          <Link href={`/w/${domain}`} className="flex min-w-0 items-center gap-2 text-sm hover:text-accent">
            <Favicon domain={domain} name={brand ?? domain} size={20} />
            <span className="truncate font-medium">{brand ?? domain}</span>
          </Link>
          <span className="text-line-2">/</span>
          <span className="text-sm font-medium">Pipeline</span>
          <span className="flex-1" />
          <ThemeToggle className="size-8" />
          <AccountButton signInClassName="max-sm:hidden" />
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href={`/w/${domain}`} className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
              <ArrowLeft className="size-3.5" /> Back to research
            </Link>
            <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">Pipeline</h1>
            <p className="text-[14px] text-muted">Every lead you found or messaged, and what happened next.</p>
          </div>
          {data && (
            <div className="flex items-center gap-1 rounded-lg border border-line bg-white p-1" role="tablist" aria-label="View">
              {(
                [
                  ["board", KanbanSquare, "Board"],
                  ["table", Table2, "Table"],
                ] as const
              ).map(([v, Icon, label]) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium ${view === v ? "bg-ink text-white" : "text-ink-2 hover:bg-subtle"}`}
                >
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {!ready ? (
          <Centered>
            <Loader2 className="spin size-5 text-muted" />
          </Centered>
        ) : !user ? (
          <Centered>
            <p className="text-[15px] text-ink-2">Sign in to see and track your leads.</p>
            <Button variant="primary" className="mt-4" onClick={() => open({ mode: "signin", onDone: refresh })}>
              Sign in
            </Button>
          </Centered>
        ) : error && !data ? (
          <Centered>
            <p className="text-[14px] text-bad">{error}</p>
            <Button variant="secondary" className="mt-3" onClick={refresh}>
              Try again
            </Button>
          </Centered>
        ) : !data ? (
          <Centered>
            <Loader2 className="spin size-5 text-muted" />
          </Centered>
        ) : (
          <>
            <Stats data={data} />
            {data.limit.max !== null && (
              <p className="mt-3 rounded-lg border border-line bg-white px-3.5 py-2.5 text-[13px] text-ink-2">
                <span className="font-semibold">{Math.min(data.limit.used, data.limit.max)}</span> of {data.limit.max} leads used.
                {data.limit.used >= data.limit.max ? " New leads won't be added until you upgrade." : ""}{" "}
                <Link href="/billing" className="font-medium text-accent hover:underline">
                  Unlimited leads and automatic follow-ups with Pro
                </Link>
              </p>
            )}

            {due.length > 0 && <DueList items={due} dailyLimit={data.dailyLimit} sentToday={data.stats.sentToday} onSent={refresh} />}

            {data.leads.length === 0 ? (
              <Centered>
                <p className="max-w-md text-[14.5px] text-ink-2">
                  No leads yet. Open your research, then send a first message to a decision maker (or add a prospect to your pipeline) and it shows up here.
                </p>
                <Link href={`/w/${domain}?step=prospects`} className="mt-4 inline-flex h-9 items-center rounded-lg bg-ink px-4 text-sm font-medium text-white hover:bg-ink-2">
                  Go to prospects
                </Link>
              </Centered>
            ) : view === "board" ? (
              <div className="scroll-thin -mx-4 mt-6 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
                {LEAD_STATUSES.map((s) => {
                  const col = data.leads.filter((l) => l.status === s);
                  return (
                    <section
                      key={s}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData("text/plain") || dragId;
                        if (id && data.leads.find((l) => l.id === id)?.status !== s) setStatus(id, s);
                        setDragId(null);
                      }}
                      className="flex w-[78vw] max-w-[290px] shrink-0 snap-start flex-col rounded-[12px] border border-line bg-subtle/60 sm:w-[260px]"
                      aria-label={STATUS_LABEL[s]}
                    >
                      <header className="flex items-center gap-2 px-3 py-2.5">
                        <span className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${STATUS_TONE[s]}`}>{STATUS_LABEL[s]}</span>
                        <span className="font-mono text-[12px] text-muted">{col.length}</span>
                      </header>
                      <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                        {col.map((l) => (
                          <LeadCard key={l.id} lead={l} onOpen={() => setOpenId(l.id)} onStatus={(st) => setStatus(l.id, st)} onDragStart={() => setDragId(l.id)} />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <LeadTable leads={data.leads} onOpen={setOpenId} onStatus={setStatus} />
            )}
          </>
        )}
      </main>

      {lead && <LeadDrawer lead={lead} pro={!!data?.followUps} onClose={() => setOpenId(null)} onChanged={refresh} onStatus={(s) => setStatus(lead.id, s)} />}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mt-10 flex flex-col items-center rounded-[12px] border border-dashed border-line-2 bg-white px-6 py-14 text-center">{children}</div>;
}

function Stats({ data }: { data: PipelineData }) {
  const s = data.stats;
  const tiles = [
    ["Contacted", String(s.contacted), `${s.total} leads in total`],
    ["Reply rate", `${s.replyRate}%`, `${s.replied} replied`],
    ["Sign-ups", String(s.signedUp), "from this pipeline"],
    ["Due today", String(s.due), `${s.sentToday} sent in the last 24h`],
  ];
  return (
    <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-line bg-line lg:grid-cols-4">
      {tiles.map(([label, value, sub]) => (
        <div key={label} className="bg-white px-4 py-3.5">
          <p className="font-mono text-[11.5px] text-muted">{label}</p>
          <p className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">{value}</p>
          <p className="text-[12px] text-faint">{sub}</p>
        </div>
      ))}
    </div>
  );
}

function StatusSelect({ value, onChange, className = "" }: { value: LeadStatus; onChange: (s: LeadStatus) => void; className?: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as LeadStatus)}
      onClick={(e) => e.stopPropagation()}
      aria-label="Status"
      className={`h-8 rounded-md border border-line bg-white px-2 text-[12.5px] text-ink outline-none focus:border-accent ${className}`}
    >
      {LEAD_STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

function nextFollowUp(l: Lead) {
  return l.followUps.filter((f) => f.status === "scheduled" || f.status === "due").sort((a, b) => a.dueAt - b.dueAt)[0];
}

function LeadCard({ lead, onOpen, onStatus, onDragStart }: { lead: Lead; onOpen: () => void; onStatus: (s: LeadStatus) => void; onDragStart: () => void }) {
  const next = nextFollowUp(lead);
  const last = lead.messages[lead.messages.length - 1];
  return (
    <article
      draggable
      onDragStart={(e) => {
        // Firefox only starts a drag that carries data.
        e.dataTransfer.setData("text/plain", lead.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onClick={onOpen}
      className="cursor-pointer rounded-[10px] border border-line bg-white p-3 shadow-[0_1px_2px_#1214170d] hover:border-ink/25"
    >
      <p className="truncate text-[14px] font-semibold">{lead.name === "Team" ? lead.account : lead.name}</p>
      <p className="truncate text-[12.5px] text-muted">{lead.name === "Team" ? "The business" : `${lead.role ?? "Contact"} · ${lead.account}`}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
        {last && <span>Last message {day(last.sentAt)}</span>}
        {next && (
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-px ${next.status === "due" ? "bg-warn-soft text-warn" : "bg-subtle text-ink-2"}`}>
            <CalendarClock className="size-3" /> {next.status === "due" ? "Follow-up due" : `Follow-up ${day(next.dueAt)}`}
          </span>
        )}
      </div>
      <StatusSelect value={lead.status} onChange={onStatus} className="mt-2.5 w-full" />
    </article>
  );
}

function LeadTable({ leads, onOpen, onStatus }: { leads: Lead[]; onOpen: (id: string) => void; onStatus: (id: string, s: LeadStatus) => void }) {
  return (
    <div className="mt-6 overflow-hidden rounded-[12px] border border-line bg-white">
      {/* Phones: one row per lead, stacked. */}
      <ul className="lg:hidden">
        {leads.map((l) => (
          <li key={l.id} className="flex items-center gap-3 border-b border-line px-3.5 py-3 last:border-0">
            <button type="button" onClick={() => onOpen(l.id)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[14px] font-semibold">{l.name === "Team" ? l.account : l.name}</span>
              <span className="block truncate text-[12.5px] text-muted">{l.name === "Team" ? "The business" : `${l.role ?? "Contact"} · ${l.account}`}</span>
            </button>
            <StatusSelect value={l.status} onChange={(s) => onStatus(l.id, s)} />
          </li>
        ))}
      </ul>
      <table className="hidden w-full text-left text-[13px] lg:table">
        <thead className="bg-subtle text-[11px] text-muted">
          <tr className="border-b border-line">
            <th className="px-3 py-2 font-medium">Lead</th>
            <th className="px-3 py-2 font-medium">Account</th>
            <th className="px-3 py-2 font-medium">Channel</th>
            <th className="px-3 py-2 font-medium">Last message</th>
            <th className="px-3 py-2 font-medium">Next follow-up</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => {
            const next = nextFollowUp(l);
            const last = l.messages[l.messages.length - 1];
            return (
              <tr key={l.id} onClick={() => onOpen(l.id)} className="cursor-pointer border-b border-line last:border-0 hover:bg-subtle/60">
                <td className="px-3 py-2.5">
                  <p className="font-medium">{l.name === "Team" ? "The business" : l.name}</p>
                  {l.role && <p className="text-[12px] text-muted">{l.role}</p>}
                </td>
                <td className="px-3 py-2.5 text-ink-2">{l.account}</td>
                <td className="px-3 py-2.5 capitalize text-ink-2">{l.channel ?? "—"}</td>
                <td className="px-3 py-2.5 text-ink-2">{last ? day(last.sentAt) : "—"}</td>
                <td className="px-3 py-2.5 text-ink-2">{next ? (next.status === "due" ? <Badge tone="warn">due now</Badge> : day(next.dueAt)) : "—"}</td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <StatusSelect value={l.status} onChange={(s) => onStatus(l.id, s)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Follow-ups whose day has come (marked by the hourly scheduler), sent one click at a time. */
function DueList({ items, dailyLimit, sentToday, onSent }: { items: { lead: Lead; f: FollowUp }[]; dailyLimit: number; sentToday: number; onSent: () => void }) {
  return (
    <section className="mt-6 rounded-[12px] border border-warn/25 bg-warn-soft/40 p-4">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">
        <CalendarClock className="size-4 text-warn" /> Follow-ups due ({items.length})
      </h2>
      <p className="mt-0.5 text-[12.5px] text-muted">
        Paced at up to {dailyLimit} a day so your messages keep landing. {sentToday} sent in the last 24 hours.
      </p>
      <ul className="mt-3 space-y-2">
        {items.map(({ lead, f }) => (
          <li key={f.id} className="rounded-[10px] border border-line bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                {lead.name === "Team" ? lead.account : `${lead.name} · ${lead.account}`}
              </p>
              <Badge>
                Follow-up {f.step} · {f.channel}
              </Badge>
            </div>
            {f.subject && <p className="mt-1.5 text-[13px] font-medium">{f.subject}</p>}
            <p className="mt-1 line-clamp-3 whitespace-pre-line text-[13px] text-ink-2">{f.body}</p>
            <div className="mt-2.5">
              <SendButton lead={lead} channel={f.channel} subject={f.subject} body={f.body} followUpId={f.id} onSent={onSent} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Opens the user's own app with the message ready (or copies it), then logs it on the lead. */
function SendButton({ lead, channel, subject, body, followUpId, onSent }: { lead: Lead; channel: string; subject: string | null; body: string; followUpId?: string; onSent: () => void }) {
  const [done, setDone] = useState(false);
  const target = sendTarget(lead, channel, subject, body);
  const log = async () => {
    if (target.copy) navigator.clipboard?.writeText(subject ? `${subject}\n\n${body}` : body).catch(() => {});
    setDone(true);
    await api(`/api/leads/${lead.id}/messages`, "POST", { channel, subject, body, followUpId }).catch(() => setDone(false));
    onSent();
  };
  if (done)
    return (
      <span className="inline-flex h-8 items-center gap-1.5 text-[13px] font-medium text-good">
        <Check className="size-4" /> Sent and logged
      </span>
    );
  const Icon = channel === "email" ? Mail : channel === "instagram" ? Instagram : channel === "linkedin" ? Linkedin : channel === "whatsapp" ? MessageCircle : Copy;
  const cls = "inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-[13px] font-medium text-white hover:bg-ink-2";
  return target.href ? (
    <a href={target.href} target={target.href.startsWith("mailto:") ? undefined : "_blank"} rel="noreferrer" onClick={log} className={cls} title={target.copy ? "Copies the message, then opens the conversation" : undefined}>
      <Icon className="size-3.5" /> {target.label}
    </a>
  ) : (
    <button type="button" onClick={log} className={cls}>
      <Copy className="size-3.5" /> Copy and mark sent
    </button>
  );
}

function LeadDrawer({ lead, pro, onClose, onChanged, onStatus }: { lead: Lead; pro: boolean; onClose: () => void; onChanged: () => void; onStatus: (s: LeadStatus) => void }) {
  const [notes, setNotes] = useState(lead.notes ?? "");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const saveNotes = () => notes !== (lead.notes ?? "") && api(`/api/leads/${lead.id}`, "PATCH", { notes }).then(onChanged);
  const remove = async () => {
    if (!confirm(`Remove ${lead.name === "Team" ? lead.account : lead.name} from your pipeline? Its messages and follow-ups go too.`)) return;
    await api(`/api/leads/${lead.id}`, "DELETE");
    onClose();
    onChanged();
  };
  const active = lead.followUps.filter((f) => f.status === "scheduled" || f.status === "due");
  const stopped = STOPS_SEQUENCE.includes(lead.status);

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-[#0b0d10]/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-label={lead.name} className="flex h-full w-full max-w-[520px] flex-col overflow-y-auto border-l border-line bg-paper text-ink shadow-[0_0_60px_-20px_#0b0d1066]">
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-line bg-paper/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[18px] font-semibold">{lead.name === "Team" ? lead.account : lead.name}</h2>
            <p className="truncate text-[13px] text-muted">{lead.name === "Team" ? "The business" : `${lead.role ?? "Contact"} · ${lead.account}`}</p>
          </div>
          <StatusSelect value={lead.status} onChange={onStatus} />
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-md text-muted hover:bg-subtle hover:text-ink">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          <div className="flex flex-wrap gap-2 text-[13px]">
            {plainEmail(lead.email ?? undefined) && <Badge tone="info">{lead.email}</Badge>}
            {igHandle(lead.instagram ?? undefined) && <Badge>@{igHandle(lead.instagram ?? undefined)}</Badge>}
            {safeHref(lead.linkedin) && (
              <a href={safeHref(lead.linkedin)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                LinkedIn profile
              </a>
            )}
          </div>

          <label className="block">
            <span className="text-[12.5px] font-medium text-ink-2">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 4000))}
              onBlur={saveNotes}
              rows={3}
              placeholder="What they said, next steps…"
              className="mt-1 w-full rounded-lg border border-line-2 bg-white px-3 py-2 text-[14px] outline-none placeholder:text-faint focus:border-accent"
            />
          </label>

          <Sequence lead={lead} active={active} stopped={stopped} pro={pro} onChanged={onChanged} />

          <section>
            <h3 className="text-[14px] font-semibold">Messages</h3>
            {lead.messages.length === 0 ? (
              <p className="mt-1 text-[13px] text-muted">Nothing sent yet.</p>
            ) : (
              <ol className="mt-2 space-y-2">
                {[...lead.messages].reverse().map((m) => (
                  <li key={m.id} className="rounded-[10px] border border-line bg-white p-3">
                    <p className="flex items-center gap-2 font-mono text-[11.5px] text-muted">
                      <Send className="size-3" /> {m.kind === "follow_up" ? "Follow-up" : "Message"} · {m.channel} · {new Date(m.sentAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </p>
                    {m.subject && <p className="mt-1 text-[13px] font-medium">{m.subject}</p>}
                    <p className="mt-1 whitespace-pre-line text-[13px] text-ink-2">{m.body}</p>
                  </li>
                ))}
              </ol>
            )}
            <LogMessage lead={lead} onLogged={onChanged} />
          </section>

          <button type="button" onClick={remove} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-bad">
            <Trash2 className="size-3.5" /> Remove from pipeline
          </button>
        </div>
      </aside>
    </div>
  );
}

/** Record something sent outside Junipa (a call, a DM typed by hand). */
function LogMessage({ lead, onLogged }: { lead: Lead; onLogged: () => void }) {
  const [openForm, setOpenForm] = useState(false);
  const [channel, setChannel] = useState(lead.channel ?? "email");
  const [body, setBody] = useState("");
  if (!openForm)
    return (
      <button type="button" onClick={() => setOpenForm(true)} className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
        <Plus className="size-3.5" /> Log a message you sent
      </button>
    );
  return (
    <div className="mt-2 space-y-2 rounded-[10px] border border-line bg-white p-3">
      <ChannelSelect value={channel} onChange={setChannel} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="What you sent" className="w-full rounded-lg border border-line-2 bg-white px-3 py-2 text-[13.5px] outline-none focus:border-accent" />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={!body.trim()}
          onClick={async () => {
            await api(`/api/leads/${lead.id}/messages`, "POST", { channel, body });
            setBody("");
            setOpenForm(false);
            onLogged();
          }}
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpenForm(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ChannelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Channel" className="h-8 rounded-md border border-line bg-white px-2 text-[12.5px] outline-none focus:border-accent">
      {["email", "instagram", "whatsapp", "linkedin", "phone", "other"].map((c) => (
        <option key={c} value={c}>
          {c === "whatsapp" ? "WhatsApp" : c === "linkedin" ? "LinkedIn" : c[0].toUpperCase() + c.slice(1)}
        </option>
      ))}
    </select>
  );
}

interface DraftStep {
  day: number;
  channel: string;
  subject: string;
  body: string;
}

/** Set up follow-ups: pick the days, let the AI draft them, edit, then start. */
function Sequence({ lead, active, stopped, pro, onChanged }: { lead: Lead; active: FollowUp[]; stopped: boolean; pro: boolean; onChanged: () => void }) {
  const defaultChannel = lead.channel && lead.channel !== "other" ? lead.channel : plainEmail(lead.email ?? undefined) ? "email" : lead.instagram ? "instagram" : "email";
  const [steps, setSteps] = useState<DraftStep[]>([
    { day: 3, channel: defaultChannel, subject: "", body: "" },
    { day: 7, channel: defaultChannel, subject: "", body: "" },
  ]);
  const [busy, setBusy] = useState<"" | "draft" | "save">("");
  const [error, setError] = useState("");
  const original = lead.messages.find((m) => m.kind === "message");

  if (stopped)
    return (
      <section className="rounded-[10px] border border-line bg-white p-3.5 text-[13px] text-muted">
        <h3 className="text-[14px] font-semibold text-ink">Follow-ups</h3>
        This lead answered, so follow-ups are off.
      </section>
    );

  if (active.length)
    return (
      <section className="rounded-[10px] border border-line bg-white p-3.5">
        <div className="flex items-center gap-2">
          <h3 className="flex-1 text-[14px] font-semibold">Follow-up sequence</h3>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              await api(`/api/leads/${lead.id}/sequence`, "DELETE");
              onChanged();
            }}
          >
            Stop sequence
          </Button>
        </div>
        <ol className="mt-2 space-y-2">
          {active.map((f) => (
            <li key={f.id} className="rounded-lg border border-line px-3 py-2">
              <p className="font-mono text-[11.5px] text-muted">
                Follow-up {f.step} · {f.channel} · {f.status === "due" ? "due now" : `due ${day(f.dueAt)}`}
              </p>
              <p className="mt-1 line-clamp-3 whitespace-pre-line text-[13px] text-ink-2">{f.body}</p>
              {f.status === "due" && (
                <div className="mt-2">
                  <SendButton lead={lead} channel={f.channel} subject={f.subject} body={f.body} followUpId={f.id} onSent={onChanged} />
                </div>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[12px] text-faint">Stops by itself when you move this lead to Replied, Interested, Signed up or Not interested.</p>
      </section>
    );

  if (!pro)
    return (
      <section className="rounded-[10px] border border-accent/25 bg-accent-soft/40 p-3.5">
        <h3 className="flex items-center gap-1.5 text-[14px] font-semibold">
          <Sparkles className="size-4 text-accent" /> Automatic follow-ups
        </h3>
        <p className="mt-1 text-[13px] text-ink-2">
          Most replies come on the second or third message. With Pro, Scout drafts each follow-up from your research, schedules it, and stops the moment {lead.name === "Team" ? "they" : lead.name.split(" ")[0]} replies.
        </p>
        <Link href="/billing" className="mt-3 inline-flex h-8 items-center rounded-lg bg-ink px-3 text-[13px] font-medium text-white hover:bg-ink-2">
          See Pro
        </Link>
      </section>
    );

  const set = (i: number, patch: Partial<DraftStep>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const drafted = steps.some((s) => s.body.trim());
  return (
    <section className="rounded-[10px] border border-line bg-white p-3.5">
      <h3 className="text-[14px] font-semibold">Follow-ups</h3>
      <p className="mt-0.5 text-[12.5px] text-muted">Most replies come on the second or third message. Pick the days, let Scout draft them, edit, then start.</p>
      <ol className="mt-3 space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="space-y-2 rounded-lg border border-line p-2.5">
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <span className="font-medium">Follow-up {i + 1}</span>
              <label className="inline-flex items-center gap-1 text-muted">
                after
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={s.day}
                  onChange={(e) => set(i, { day: Math.min(60, Math.max(1, Number(e.target.value) || 1)) })}
                  aria-label={`Days before follow-up ${i + 1}`}
                  className="h-8 w-14 rounded-md border border-line bg-white px-2 text-ink outline-none focus:border-accent"
                />
                days
              </label>
              <ChannelSelect value={s.channel} onChange={(v) => set(i, { channel: v })} />
              {steps.length > 1 && (
                <button type="button" onClick={() => setSteps((x) => x.filter((_, j) => j !== i))} aria-label={`Remove follow-up ${i + 1}`} className="ml-auto text-faint hover:text-bad">
                  <X className="size-4" />
                </button>
              )}
            </div>
            {s.channel === "email" && (
              <input value={s.subject} onChange={(e) => set(i, { subject: e.target.value })} placeholder="Subject" className="h-9 w-full rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-accent" />
            )}
            <textarea
              value={s.body}
              onChange={(e) => set(i, { body: e.target.value })}
              rows={3}
              placeholder="Message (or let Scout draft it)"
              className="w-full rounded-md border border-line-2 bg-white px-2.5 py-2 text-[13.5px] outline-none focus:border-accent"
            />
          </li>
        ))}
      </ol>
      {steps.length < MAX_FOLLOW_UPS && (
        <button type="button" onClick={() => setSteps((s) => [...s, { day: (s[s.length - 1]?.day ?? 3) + 5, channel: defaultChannel, subject: "", body: "" }])} className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
          <Plus className="size-3.5" /> Add a follow-up
        </button>
      )}
      {error && <p className="mt-2 text-[13px] text-bad">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={!!busy}
          onClick={async () => {
            setBusy("draft");
            setError("");
            try {
              const out = await api<{ steps: DraftStep[] }>(`/api/leads/${lead.id}/sequence`, "POST", {
                original: original ? { channel: original.channel, subject: original.subject, body: original.body } : undefined,
                steps: steps.map(({ day: d, channel }) => ({ day: d, channel })),
              });
              setSteps(out.steps.map((s) => ({ ...s, subject: s.subject ?? "", body: s.body ?? "" })));
            } catch (e) {
              setError((e as Error).message);
            }
            setBusy("");
          }}
        >
          {busy === "draft" ? <Loader2 className="spin size-3.5" /> : <Sparkles className="size-3.5" />} {drafted ? "Redraft" : "Draft with Scout"}
        </Button>
        <Button
          variant="primary"
          disabled={!!busy || !steps.every((s) => s.body.trim())}
          onClick={async () => {
            setBusy("save");
            setError("");
            try {
              await api(`/api/leads/${lead.id}/sequence`, "PUT", { steps });
              onChanged();
            } catch (e) {
              setError((e as Error).message);
            }
            setBusy("");
          }}
        >
          {busy === "save" ? <Loader2 className="spin size-3.5" /> : <CalendarClock className="size-3.5" />} Start sequence
        </Button>
      </div>
      <p className="mt-2 text-[12px] text-faint">
        {lead.contactedAt ? `Days count from your first message (${day(lead.contactedAt)}).` : "Days count from today, since nothing has been sent yet."} Emails get a line letting people opt out.
      </p>
    </section>
  );
}

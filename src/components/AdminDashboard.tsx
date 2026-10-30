"use client";

import { ArrowDownRight, ArrowUpRight, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Range, Row, SiteStats } from "@/lib/analytics-stats";
import type { Money, PaymentStats } from "@/lib/payment-stats";
import { AccountButton } from "./Auth";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./ui";

// The owner's dashboard at /mama: who visits, what they explore and how far they get
// (from /api/mama/stats), and the payments received (from /api/mama/payments). The view
// on screen refreshes every minute.

const RANGE_LABEL: Record<Range, string> = { "24h": "24 hours", "7d": "7 days", "30d": "30 days", "90d": "90 days" };
type View = "visitors" | "payments";
const STEP_LABEL: Record<string, string> = {
  profile: "Brand profile",
  competitors: "Competitors",
  segments: "Audiences",
  accounts: "Prospects",
  contacts: "Decision makers",
  outreach: "Sequences",
};
const PAGE_LABEL: Record<string, string> = {
  "/": "Home",
  "/w/[brand]": "Research workspace",
  "/w/[brand]/pipeline": "Pipeline",
  "/billing": "Billing",
  "/billing/return": "Back from checkout",
  "/social": "Social growth plan",
  "/privacy": "Privacy Policy",
  "/terms": "Terms",
  "/reset-password": "Reset password",
};

const num = (n: number) => n.toLocaleString("en-US");
const cash = (cents: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
/** Totals in more than one currency are listed side by side; none at all reads $0. */
function money(m: Money) {
  const parts = Object.entries(m).filter(([, c]) => c);
  return parts.length ? parts.map(([cur, c]) => cash(c, cur)).join(" + ") : "$0";
}
const PRODUCT_LABEL: Record<string, string> = {
  starter_monthly: "Starter · monthly",
  starter_yearly: "Starter · yearly",
  pro_monthly: "Pro · monthly",
  pro_yearly: "Pro · yearly",
  campaign_starter: "Campaign unlock · Starter",
  campaign_pro: "Campaign unlock · Pro",
  social: "Social growth plan",
};
const KIND_LABEL: Record<string, string> = { new: "New subscription", renewal: "Renewal", one_time: "One-time" };
const STATUS_LABEL: Record<string, string> = { active: "Active", trialing: "Trial", past_due: "Payment failed, retrying", canceled: "Cancelled", unpaid: "Unpaid" };
const day = (t: number) => new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/** One line on the trend chart: how to show its numbers and sum them up. */
interface MetricDef {
  key: string;
  label: string;
  format: (n: number) => string;
  summary: (total: number) => string;
}
const VISIT_METRICS: MetricDef[] = [
  { key: "visitors", label: "Visitors", format: num, summary: (t) => `${num(t)} ${t === 1 ? "visitor" : "visitors"}` },
  { key: "views", label: "Page views", format: num, summary: (t) => `${num(t)} ${t === 1 ? "page view" : "page views"}` },
  { key: "searches", label: "Searches", format: num, summary: (t) => `${num(t)} ${t === 1 ? "search" : "searches"}` },
];
const PAY_METRICS: MetricDef[] = [
  { key: "cents", label: "Revenue (USD)", format: (c) => cash(c), summary: (t) => `${cash(t)} received` },
  { key: "count", label: "Payments", format: num, summary: (t) => `${num(t)} ${t === 1 ? "payment" : "payments"}` },
];
function duration(ms: number | null | undefined) {
  if (ms == null) return "–";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
function ago(at: number) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
let regionNames: Intl.DisplayNames | null = null;
function countryName(code: string | null) {
  if (!code) return "Unknown";
  try {
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export default function AdminDashboard() {
  const [view, setView] = useState<View>("visitors");
  const [range, setRange] = useState<Range>("7d");
  const [visits, setVisits] = useState<SiteStats | null>(null);
  const [payments, setPayments] = useState<PaymentStats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);

  const load = useCallback(async (v: View, r: Range) => {
    const id = ++latest.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/mama/${v === "visitors" ? "stats" : "payments"}?range=${r}&tz=${-new Date().getTimezoneOffset()}`, { cache: "no-store" });
      if (res.status === 404) throw new Error("You're signed out, or this account can't open the dashboard. Sign in with Google again.");
      if (!res.ok) throw new Error("Couldn't load the numbers. Try again.");
      const d = await res.json();
      // A newer request (another view or range) has started: drop this answer.
      if (id !== latest.current) return;
      if (v === "visitors") setVisits(d as SiteStats);
      else setPayments(d as PaymentStats);
      setError("");
    } catch (e) {
      if (id === latest.current) setError((e as Error).message);
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(view, range);
    const t = setInterval(() => document.visibilityState === "visible" && load(view, range), 60_000);
    return () => clearInterval(t);
  }, [view, range, load]);

  const shown = view === "visitors" ? visits : payments;
  return (
    <main className="lp lp-app min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Home">
            <Logo compact />
          </Link>
          <span className="text-line-2">/</span>
          <span className="text-sm font-medium">Mama</span>
          <span className="flex-1" />
          {visits && (
            <span className="hidden items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[12.5px] sm:inline-flex" title="Visitors with a page view in the last 5 minutes">
              <span className="size-1.5 rounded-full bg-good" aria-hidden />
              {num(visits.liveNow)} on the site now
            </span>
          )}
          <ThemeToggle className="size-8" />
          <AccountButton />
        </div>
      </header>

      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{view === "visitors" ? "Visitors" : "Payments"}</h1>
            <p className="mt-0.5 text-[13.5px] text-muted">
              {view === "visitors"
                ? "Who comes to junipa.app, what they explore and how far they get. Visitors are counted once a day; your own visits aren't counted."
                : "Money received: new subscriptions, renewals and one-time purchases, as Junia recorded them when each payment was confirmed."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={view} options={["visitors", "payments"] as View[]} label={(v) => (v === "visitors" ? "Visitors" : "Payments")} onChange={setView} ariaLabel="Dashboard" />
            <Segmented value={range} options={Object.keys(RANGE_LABEL) as Range[]} label={(r) => r} onChange={setRange} ariaLabel="Time range" />
            <button
              type="button"
              onClick={() => load(view, range)}
              aria-label="Refresh"
              className="grid size-9 place-items-center rounded-lg border border-line-2 bg-white text-muted hover:text-ink"
            >
              <RefreshCw className={`size-4 ${loading ? "spin" : ""}`} />
            </button>
          </div>
        </div>

        {error && <p className="mt-4 rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-[13.5px] text-bad">{error}</p>}

        {!shown ? (
          <div className="grid h-60 place-items-center">
            <Loader2 className="spin size-5 text-muted" />
          </div>
        ) : view === "visitors" ? (
          <VisitorsView data={visits!} range={range} />
        ) : (
          <PaymentsView data={payments!} range={range} />
        )}
      </div>
    </main>
  );
}

function VisitorsView({ data, range }: { data: SiteStats; range: Range }) {
  const [metric, setMetric] = useState("visitors");
  const active = VISIT_METRICS.find((m) => m.key === metric) ?? VISIT_METRICS[0];
  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Visitors" value={num(data.totals.visitors)} now={data.totals.visitors} before={data.previous.visitors} />
        <Kpi label="Page views" value={num(data.totals.views)} now={data.totals.views} before={data.previous.views} />
        <Kpi label="Avg. time on page" value={duration(data.totals.avgMs)} now={data.totals.avgMs ?? 0} before={data.previous.avgMs ?? 0} />
        <Kpi label="Searches started" value={num(data.totals.searches)} now={data.totals.searches} before={data.previous.searches} />
        <Kpi label="Sign-ups" value={num(data.totals.signups)} now={data.totals.signups} before={data.previous.signups} />
      </div>

      <Card className="mt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold">
            {active.label} <span className="font-normal text-muted">· last {RANGE_LABEL[range]}</span>
          </h2>
          <Segmented value={metric} options={VISIT_METRICS.map((m) => m.key)} label={(k) => VISIT_METRICS.find((m) => m.key === k)!.label} onChange={setMetric} ariaLabel="Chart metric" />
        </div>
        <TrendChart series={data.series} metric={active} metrics={VISIT_METRICS} hourly={range === "24h"} />
      </Card>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHead title="Pages they explore" hint="Visitors · views · avg. time" />
          <BarList
            rows={data.pages.map((p) => ({ ...p, key: PAGE_LABEL[p.key] ? `${PAGE_LABEL[p.key]}` : p.key, sub: PAGE_LABEL[p.key] ? p.key : undefined }))}
            value={(r) => r.visitors}
            extra={(r) => `${num(r.views ?? 0)} · ${duration(r.avgMs)}`}
            empty="No page views yet."
          />
        </Card>
        <Card>
          <CardHead title="Brands researched" hint="Searches · people" />
          <BarList
            rows={data.brands.map((b) => ({ key: b.key, sub: b.demo ? "demo" : undefined, visitors: b.searches, views: b.visitors }))}
            value={(r) => r.visitors}
            extra={(r) => `${num(r.views ?? 0)} ${r.views === 1 ? "person" : "people"}`}
            empty="No live searches yet."
          />
          {data.steps.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="mb-2 font-mono text-[11.5px] text-muted">Research steps started</p>
              <BarList rows={data.steps.map((s) => ({ key: STEP_LABEL[s.key] ?? s.key, visitors: s.searches }))} value={(r) => r.visitors} empty="" />
            </div>
          )}
        </Card>
        <Card>
          <CardHead title="Where they come from" hint="Visitors" />
          <BarList rows={data.referrers.map((r) => ({ ...r, key: r.key || "Direct / no referrer" }))} value={(r) => r.visitors} empty="No visits yet." />
          {data.campaigns.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="mb-2 font-mono text-[11.5px] text-muted">Campaign links (utm)</p>
              <BarList rows={data.campaigns} value={(r) => r.visitors} empty="" />
            </div>
          )}
        </Card>
        <Card>
          <CardHead title="Countries" hint="Visitors" />
          <BarList rows={data.countries.map((c) => ({ ...c, key: countryName(c.key || null) }))} value={(r) => r.visitors} empty="No visits yet." />
        </Card>
        <Card>
          <CardHead title="Devices and browsers" hint="Visitors" />
          <TabbedLists
            tabs={[
              { id: "device", label: "Device", rows: data.devices },
              { id: "browser", label: "Browser", rows: data.browsers },
              { id: "os", label: "System", rows: data.systems },
            ]}
          />
        </Card>
        <Card>
          <CardHead title="How far they get" hint={`Last ${RANGE_LABEL[range]}`} />
          <Funnel f={data.funnel} />
        </Card>
      </div>

      <Card className="mt-3">
        <CardHead title="Latest visits" hint={`${num(data.allTime.views)} page views and ${num(data.allTime.users)} accounts all time`} />
        <RecentVisits rows={data.recent} />
      </Card>
    </>
  );
}

function PaymentsView({ data, range }: { data: PaymentStats; range: Range }) {
  const [metric, setMetric] = useState("cents");
  const active = PAY_METRICS.find((m) => m.key === metric) ?? PAY_METRICS[0];
  const arr = Object.fromEntries(Object.entries(data.mrr).map(([c, v]) => [c, v * 12]));
  const otherCurrencies = Object.keys(data.collected).some((c) => c !== "USD");
  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label={`Received · ${range}`} value={money(data.collected)} now={data.collected.USD ?? 0} before={data.previous.USD ?? 0} />
        <Kpi label="Received all time" value={money(data.allTime)} note="Since payments were first recorded" />
        <Kpi label="Monthly recurring" value={money(data.mrr)} note={`${money(arr)} a year at today's subscribers`} />
        <Kpi
          label="Paying subscribers"
          value={num(data.subscribers.active + data.subscribers.pastDue)}
          note={`${num(data.subscribers.pastDue)} retrying a failed payment · ${num(data.subscribers.cancelling)} cancelling`}
        />
        <Kpi
          label="Checkouts paid"
          value={data.checkouts.started ? `${num(data.checkouts.completed)} of ${num(data.checkouts.started)}` : "0"}
          note={data.checkouts.started ? `${Math.round((Math.min(data.checkouts.completed, data.checkouts.started) / data.checkouts.started) * 100)}% of checkouts opened` : "No checkouts opened yet"}
        />
      </div>

      <Card className="mt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold">
            {active.label} <span className="font-normal text-muted">· last {RANGE_LABEL[range]}</span>
          </h2>
          <Segmented value={metric} options={PAY_METRICS.map((m) => m.key)} label={(k) => PAY_METRICS.find((m) => m.key === k)!.label} onChange={setMetric} ariaLabel="Chart metric" />
        </div>
        <TrendChart series={data.series} metric={active} metrics={PAY_METRICS} hourly={range === "24h"} />
        {otherCurrencies && <p className="mt-1 text-[12px] text-muted">The chart shows US dollar payments only; the totals above include every currency.</p>}
      </Card>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHead title="What they pay for" hint={`Last ${RANGE_LABEL[range]}`} />
          <BarList
            rows={data.byProduct.map((p) => ({ key: PRODUCT_LABEL[p.key] ?? p.key, visitors: p.cents, views: p.count }))}
            value={(r) => r.visitors}
            format={(c) => cash(c)}
            extra={(r) => `${num(r.views ?? 0)} ${r.views === 1 ? "payment" : "payments"}`}
            empty="No payments in this period."
          />
        </Card>
        <Card>
          <CardHead title="Subscribers" hint={`${num(data.customers.length)} all time`} />
          <Subscribers rows={data.customers} />
        </Card>
      </div>

      <Card className="mt-3">
        <CardHead title="Payments received" hint="Latest 50" />
        <PaymentList rows={data.recent} />
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          Renewals are picked up when Bachs shows a subscription&apos;s new period (checked each time this page loads). Refunds, fees and payouts aren&apos;t shown here;
          your Bachs dashboard is the record for those.
        </p>
      </Card>
    </>
  );
}

function PaymentList({ rows }: { rows: PaymentStats["recent"] }) {
  if (!rows.length) return <p className="py-6 text-center text-[13px] text-muted">No payments yet. They appear here as soon as a checkout is paid.</p>;
  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-5">
      <table className="w-full min-w-[620px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-line font-mono text-[11.5px] text-muted">
            <th className="px-4 py-2 font-normal sm:px-5">When</th>
            <th className="px-2 py-2 font-normal">Customer</th>
            <th className="px-2 py-2 font-normal">For</th>
            <th className="px-2 py-2 font-normal">Type</th>
            <th className="px-4 py-2 text-right font-normal sm:px-5">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.at}-${i}`} className="border-b border-line last:border-0">
              <td className="whitespace-nowrap px-4 py-2 text-muted sm:px-5" title={new Date(r.at).toLocaleString()}>
                {day(r.at)}
              </td>
              <td className="max-w-[220px] truncate px-2 py-2">{r.email ?? <span className="text-muted">No account</span>}</td>
              <td className="whitespace-nowrap px-2 py-2">{PRODUCT_LABEL[r.product] ?? r.product}</td>
              <td className="whitespace-nowrap px-2 py-2 text-muted">{KIND_LABEL[r.kind] ?? r.kind}</td>
              <td className="whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums sm:px-5">{cash(r.cents, r.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Subscribers({ rows }: { rows: PaymentStats["customers"] }) {
  if (!rows.length) return <p className="py-6 text-center text-[13px] text-muted">No subscribers yet.</p>;
  return (
    <ul className="max-h-[360px] divide-y divide-line overflow-y-auto">
      {rows.map((c, i) => {
        const ended = c.status === "canceled" || c.status === "unpaid";
        return (
          <li key={`${c.email}-${i}`} className="flex items-start justify-between gap-3 py-2.5 text-[13.5px]">
            <div className="min-w-0">
              <p className="truncate font-medium">{c.email ?? "Deleted account"}</p>
              <p className="mt-0.5 text-[12px] text-muted">
                {PRODUCT_LABEL[`${c.plan}_${c.interval}`] ?? `${c.plan} · ${c.interval}`} · since {day(c.since)}
                {c.periodEnd && !ended ? ` · ${c.cancelling ? "ends" : "renews"} ${day(c.periodEnd)}` : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="tabular-nums">{c.amount ? cash(Math.round(Number(c.amount) * 100), (c.currency || "USD").toUpperCase()) : ""}</p>
              <p className={`mt-0.5 text-[12px] ${ended ? "text-muted" : c.status === "past_due" ? "text-warn" : "text-good"}`}>
                {c.cancelling && !ended ? "Cancels at period end" : (STATUS_LABEL[c.status] ?? c.status)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Pieces ---------- */

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[12px] border border-line bg-white p-4 sm:p-5 ${className}`}>{children}</section>;
}

function CardHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {hint && <span className="text-right font-mono text-[11.5px] text-muted">{hint}</span>}
    </div>
  );
}

function Segmented<T extends string>({ value, options, label, onChange, ariaLabel }: { value: T; options: T[]; label: (v: T) => string; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="inline-flex rounded-lg border border-line-2 bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="tab"
          aria-selected={value === o}
          onClick={() => onChange(o)}
          className={`h-8 rounded-md px-2.5 text-[13px] font-medium transition-colors ${value === o ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}

function Kpi({ label, value, now = 0, before = 0, note }: { label: string; value: string; now?: number; before?: number; note?: string }) {
  let delta: React.ReactNode = <span className="text-faint">no earlier data</span>;
  if (note) delta = <span className="text-muted">{note}</span>;
  else if (before > 0) {
    const pct = Math.round(((now - before) / before) * 100);
    const up = pct >= 0;
    delta = (
      <span className={`inline-flex items-center gap-0.5 ${pct === 0 ? "text-muted" : up ? "text-good" : "text-bad"}`}>
        {pct !== 0 && (up ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />)}
        {up ? "+" : ""}
        {pct}% <span className="text-muted">vs previous</span>
      </span>
    );
  } else if (now > 0) delta = <span className="text-muted">new this period</span>;
  return (
    <div className="rounded-[12px] border border-line bg-white p-4">
      <p className="text-[12.5px] text-muted">{label}</p>
      <p className="mt-1 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{value}</p>
      <p className="mt-2 text-[12px]">{delta}</p>
    </div>
  );
}

type ListRow = Row & { sub?: string };

function BarList<R extends ListRow>({
  rows,
  value,
  extra,
  empty,
  format = num,
}: {
  rows: R[];
  value: (r: R) => number;
  extra?: (r: R) => string;
  empty: string;
  format?: (n: number) => string;
}) {
  if (!rows.length) return empty ? <p className="py-6 text-center text-[13px] text-muted">{empty}</p> : null;
  const max = Math.max(...rows.map(value), 1);
  return (
    <ul className="space-y-1">
      {rows.map((r, i) => (
        <li key={`${r.key}-${i}`} className="relative flex items-center gap-3 rounded-md px-2 py-1.5 text-[13.5px] hover:bg-subtle" title={`${r.key}: ${format(value(r))}`}>
          <span className="absolute inset-y-0.5 left-0 rounded-[4px] bg-accent/15" style={{ width: `${Math.max(2, (value(r) / max) * 100)}%` }} aria-hidden />
          <span className="relative min-w-0 flex-1 truncate">
            {r.key}
            {r.sub && <span className="ml-1.5 font-mono text-[11px] text-muted">{r.sub}</span>}
          </span>
          {extra && <span className="relative shrink-0 font-mono text-[11.5px] text-muted">{extra(r)}</span>}
          <span className="relative min-w-12 shrink-0 text-right font-medium tabular-nums">{format(value(r))}</span>
        </li>
      ))}
    </ul>
  );
}

function TabbedLists({ tabs }: { tabs: { id: string; label: string; rows: Row[] }[] }) {
  const [tab, setTab] = useState(tabs[0].id);
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];
  return (
    <>
      <div className="mb-3">
        <Segmented value={tab} options={tabs.map((t) => t.id)} label={(id) => tabs.find((t) => t.id === id)?.label ?? id} onChange={setTab} ariaLabel="Breakdown" />
      </div>
      <BarList rows={current.rows.map((r) => ({ ...r, key: r.key || "Unknown" }))} value={(r) => r.visitors} empty="No visits yet." />
    </>
  );
}

function Funnel({ f }: { f: SiteStats["funnel"] }) {
  const steps = [
    { label: "Visited", n: f.visitors },
    { label: "Started a search", n: f.searched },
    { label: "Created an account", n: f.signedUp },
    { label: "Opened checkout", n: f.checkouts },
    { label: "Subscribed", n: f.subscribers },
  ];
  const base = Math.max(f.visitors, 1);
  return (
    <ol className="space-y-2.5">
      {steps.map((s, i) => (
        <li key={s.label}>
          <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
            <span>
              <span className="mr-1.5 font-mono text-[11.5px] text-muted">{i + 1}</span>
              {s.label}
            </span>
            <span className="tabular-nums">
              <span className="font-medium">{num(s.n)}</span>
              {i > 0 && <span className="ml-2 font-mono text-[11.5px] text-muted">{f.visitors ? `${((s.n / base) * 100).toFixed(s.n / base < 0.1 ? 1 : 0)}%` : "–"}</span>}
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-subtle">
            <div className="h-2 rounded-full bg-accent" style={{ width: `${s.n ? Math.min(100, Math.max(1.5, (s.n / base) * 100)) : 0}%` }} />
          </div>
        </li>
      ))}
      <li className="pt-1 text-[12px] leading-relaxed text-muted">Sign-ups, checkouts and subscriptions are counted from your accounts and billing records for the period.</li>
    </ol>
  );
}

function RecentVisits({ rows }: { rows: SiteStats["recent"] }) {
  if (!rows.length) return <p className="py-6 text-center text-[13px] text-muted">No visits yet.</p>;
  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-5">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-line font-mono text-[11.5px] text-muted">
            <th className="px-4 py-2 font-normal sm:px-5">When</th>
            <th className="px-2 py-2 font-normal">Page</th>
            <th className="px-2 py-2 font-normal">From</th>
            <th className="px-2 py-2 font-normal">Country</th>
            <th className="px-2 py-2 font-normal">Device</th>
            <th className="px-4 py-2 text-right font-normal sm:px-5">Time on page</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.at}-${i}`} className="border-b border-line last:border-0">
              <td className="whitespace-nowrap px-4 py-2 text-muted sm:px-5" title={new Date(r.at).toLocaleString()}>
                {ago(r.at)}
              </td>
              <td className="max-w-[260px] truncate px-2 py-2 font-mono text-[12px]">
                {r.path}
                {r.signedIn && <span className="ml-1.5 rounded bg-accent-soft px-1 py-px font-sans text-[10.5px] text-accent">account</span>}
              </td>
              <td className="max-w-[160px] truncate px-2 py-2 text-muted">{r.referrer ?? "Direct"}</td>
              <td className="whitespace-nowrap px-2 py-2">{countryName(r.country)}</td>
              <td className="whitespace-nowrap px-2 py-2 text-muted">
                {r.device ?? "–"} · {r.browser ?? "–"}
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums sm:px-5">{duration(r.durationMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Trend chart ---------- */

function niceStep(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

function TrendChart({ series, metric, metrics, hourly }: { series: ({ at: number } & Record<string, number>)[]; metric: MetricDef; metrics: MetricDef[]; hourly: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [asTable]);

  const label = useCallback(
    (at: number, long = false) =>
      hourly
        ? new Date(at).toLocaleTimeString(undefined, { hour: "numeric", ...(long ? { minute: "2-digit", weekday: "short" } : {}) })
        : new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric", ...(long ? { weekday: "short" } : {}) }),
    [hourly],
  );

  const H = 240;
  const pad = { l: 48, r: 12, t: 14, b: 28 };
  const values = series.map((s) => s[metric.key] ?? 0);
  const step = niceStep(Math.max(1, Math.ceil(Math.max(...values, 1) / 4)));
  const max = Math.max(step * 4, 4);
  const iw = Math.max(0, width - pad.l - pad.r);
  const ih = H - pad.t - pad.b;
  const n = series.length;
  const x = (i: number) => pad.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = n ? `${line} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : "";
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 90))));
  const total = values.reduce((a, b) => a + b, 0);
  const peak = values.reduce((best, v, i) => (v > values[best] ? i : best), 0);

  const pick = (clientX: number, target: Element) => {
    const rect = target.getBoundingClientRect();
    const px = clientX - rect.left;
    const i = n === 1 ? 0 : Math.round(((px - pad.l) / Math.max(1, iw)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div className="mt-3">
      {asTable ? (
        <div className="max-h-[260px] overflow-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-line font-mono text-[11.5px] text-muted">
                <th className="py-1.5 font-normal">{hourly ? "Hour" : "Day"}</th>
                {metrics.map((m) => (
                  <th key={m.key} className="py-1.5 text-right font-normal">
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.at} className="border-b border-line last:border-0">
                  <td className="py-1.5">{label(s.at, true)}</td>
                  {metrics.map((m) => (
                    <td key={m.key} className="py-1.5 text-right tabular-nums">
                      {m.format(s[m.key] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={box} className="relative h-[240px] w-full select-none">
          {width > 0 && (
            <svg
              width={width}
              height={H}
              role="img"
              aria-label={`${metric.label}: ${metric.format(total)} in total, highest ${metric.format(values[peak] ?? 0)} on ${label(series[peak]?.at ?? 0, true)}`}
              onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
              onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
              onPointerLeave={() => setHover(null)}
              className="block touch-none"
            >
              {[0, 1, 2, 3, 4].map((k) => (
                <g key={k}>
                  <line x1={pad.l} x2={width - pad.r} y1={y(step * k)} y2={y(step * k)} className="stroke-line" strokeWidth={1} />
                  <text x={pad.l - 8} y={y(step * k)} dy="0.32em" textAnchor="end" className="fill-muted font-mono text-[10.5px]">
                    {metric.format(step * k)}
                  </text>
                </g>
              ))}
              {series.map((s, i) =>
                // Every few labels, plus the last one unless it would crowd its neighbour.
                (i % every === 0 && n - 1 - i >= every / 2) || i === n - 1 ? (
                  <text key={s.at} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-muted font-mono text-[10.5px]">
                    {label(s.at)}
                  </text>
                ) : null,
              )}
              <path d={area} className="fill-accent" fillOpacity={0.1} />
              <path d={line} fill="none" className="stroke-accent" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {hover != null && (
                <>
                  <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} className="stroke-ink" strokeOpacity={0.25} strokeWidth={1} />
                  <circle cx={x(hover)} cy={y(values[hover])} r={4.5} className="fill-accent stroke-white" strokeWidth={2} />
                </>
              )}
            </svg>
          )}
          {hover != null && series[hover] && (
            <div
              className="pointer-events-none absolute top-1 z-10 w-max min-w-[150px] rounded-lg border border-line bg-white px-3 py-2 text-[12.5px] shadow-[0_8px_24px_-10px_#0b0d1040]"
              style={{ left: Math.min(Math.max(0, x(hover) - 75), Math.max(0, width - 160)) }}
            >
              <p className="font-medium">{label(series[hover].at, true)}</p>
              {metrics.map((m) => (
                <p key={m.key} className={`mt-0.5 flex justify-between gap-4 ${m.key === metric.key ? "text-ink" : "text-muted"}`}>
                  <span>{m.label}</span>
                  <span className={`tabular-nums ${m.key === metric.key ? "font-semibold" : ""}`}>{m.format(series[hover][m.key] ?? 0)}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between text-[12px] text-muted">
        <span>
          {metric.summary(total)} in this period{hourly ? " (by hour)" : " (by day)"}
        </span>
        <button type="button" onClick={() => setAsTable((t) => !t)} className="underline-offset-2 hover:text-ink hover:underline">
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>
    </div>
  );
}

"use client";

import { MessageSquareQuote, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui";

// Shown once a paid campaign has its outreach ready: asks for a quote, with explicit
// permission to publish it, and sends it as an email to NEXT_PUBLIC_FEEDBACK_EMAIL.
// Quotes you receive go into src/lib/testimonials.ts by hand.
const TO = process.env.NEXT_PUBLIC_FEEDBACK_EMAIL ?? "";
const MAIL = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/;

export function TestimonialAsk({ domain, brand }: { domain: string; brand: string }) {
  const key = `reachly:testimonial:${domain}`;
  const [hidden, setHidden] = useState(true);
  const [quote, setQuote] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState(brand);
  const [consent, setConsent] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(key) === "done");
    } catch {
      setHidden(false);
    }
  }, [key]);

  const close = () => {
    try {
      localStorage.setItem(key, "done");
    } catch {}
    setHidden(true);
  };

  if (hidden) return null;
  const configured = MAIL.test(TO);
  if (!configured && process.env.NODE_ENV === "production") return null;

  const ready = quote.trim().length >= 10 && name.trim() && consent;
  const body = [
    quote.trim(),
    "",
    `Name: ${name.trim()}`,
    `Role: ${role.trim()}`,
    `Company: ${company.trim()}`,
    `Website researched: ${domain}`,
    "",
    "I agree that Junipa may publish this quote with my name, role and company.",
  ].join("\n");
  const href = `mailto:${TO}?subject=${encodeURIComponent("Junipa testimonial")}&body=${encodeURIComponent(body)}`;

  return (
    <section className="card relative overflow-hidden p-5 sm:p-6">
      <button type="button" onClick={close} aria-label="Not now" className="absolute right-3 top-3 grid size-8 place-items-center rounded-md text-muted hover:bg-subtle hover:text-ink">
        <X className="size-4" />
      </button>
      <p className="flex items-center gap-2 text-[15px] font-semibold">
        <span className="grid size-7 place-items-center rounded-md bg-accent-soft text-accent">
          <MessageSquareQuote className="size-4" />
        </span>
        How did Junipa do?
      </p>
      <p className="mt-1.5 max-w-xl text-[13.5px] text-muted">A sentence or two about what Scout found for you helps other founders decide. We only publish it with your permission.</p>
      {!configured && <p className="mt-3 rounded-md border border-dashed border-warn/40 bg-warn-soft px-3 py-2 font-mono text-[11.5px] text-warn">Set NEXT_PUBLIC_FEEDBACK_EMAIL to turn this on. Only shown on your computer until then.</p>}
      {sent ? (
        <p className="mt-4 text-[13.5px] text-good">Thanks! Your email app should have opened with your quote ready to send.</p>
      ) : (
        <div className="mt-4 grid gap-3">
          <textarea
            value={quote}
            onChange={(e) => setQuote(e.target.value.slice(0, 600))}
            rows={3}
            placeholder="e.g. Scout found 14 stores that stock labels like ours, and three replied in the first week."
            aria-label="Your quote"
            className="w-full rounded-lg border border-line-2 bg-white px-3 py-2.5 text-[14px] outline-none placeholder:text-faint focus:border-accent"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["Your name", name, setName],
                ["Role", role, setRole],
                ["Company", company, setCompany],
              ] as const
            ).map(([label, value, set]) => (
              <input
                key={label}
                value={value}
                onChange={(e) => set(e.target.value.slice(0, 80))}
                placeholder={label}
                aria-label={label}
                className="h-10 rounded-lg border border-line-2 bg-white px-3 text-[14px] outline-none placeholder:text-faint focus:border-accent"
              />
            ))}
          </div>
          <label className="flex items-start gap-2 text-[13px] text-ink-2">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-accent" />
            Junipa may publish this quote with my name, role and company.
          </label>
          <div className="flex items-center gap-3">
            {ready && configured ? (
              <a
                href={href}
                onClick={() => {
                  setSent(true);
                  close();
                  setHidden(false);
                }}
                className="inline-flex h-9 items-center rounded-lg bg-ink px-4 text-sm font-medium text-white hover:bg-ink-2"
              >
                Send to Junipa
              </a>
            ) : (
              <Button variant="primary" disabled>
                Send to Junipa
              </Button>
            )}
            <button type="button" onClick={close} className="text-[13px] text-muted hover:text-ink">
              Not now
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

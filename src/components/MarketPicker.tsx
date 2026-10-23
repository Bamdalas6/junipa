"use client";

import { Check, ChevronDown, Globe2, MapPin, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { POPULAR, REGIONS, WORLDWIDE, allCountries, countryName, flagEmoji, regionLabel, type Market } from "@/lib/geo";

type Mode = "auto" | "worldwide" | "country";

/** Label for a market; `null` means Auto (the brand's home country). */
export function marketLabel(m: Market | null | undefined, autoCountry?: string) {
  if (!m) return autoCountry ? `${countryName(autoCountry)} (auto)` : "Auto";
  if (m.scope === "worldwide" || !m.country) return "Worldwide";
  return m.region ? `${m.region}, ${countryName(m.country)}` : countryName(m.country);
}

export function MarketPicker({
  value,
  onChange,
  auto,
  autoCountry,
  compact,
  align = "left",
  commitOnDone,
}: {
  value: Market | null;
  onChange: (m: Market | null) => void;
  /** Value was filled in by detection rather than chosen. */
  auto?: boolean;
  /** Country used while on Auto, if known. */
  autoCountry?: string;
  compact?: boolean;
  align?: "left" | "right";
  /** Apply the choice only when "Done" is pressed (used where a change re-runs research). */
  commitOnDone?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(value ? value.scope : "auto");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Market | null>(value);
  const cur = commitOnDone ? draft : value;
  const set = (m: Market | null) => (commitOnDone ? setDraft(m) : onChange(m));
  const ref = useRef<HTMLDivElement>(null);
  const countries = useMemo(() => allCountries(), []);

  useEffect(() => {
    if (open) return;
    setDraft(value);
    setMode(value ? value.scope : "auto");
  }, [value, open]);
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

  const country = cur?.scope === "country" ? cur.country : undefined;
  const q = query.trim().toLowerCase();
  const popular = POPULAR.map((code) => ({ code, name: countryName(code) }));
  const list = q ? countries.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q) : [...popular, ...countries.filter((c) => !POPULAR.includes(c.code))];
  const regions = country ? REGIONS[country] : undefined;
  const icon = !value ? <Sparkles className="size-3" /> : value.scope === "worldwide" ? <Globe2 className="size-3.5" /> : <span>{flagEmoji(value.country)}</span>;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Target market: ${marketLabel(value, autoCountry)}. Change`}
        className={`inline-flex h-9 max-w-[240px] items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-colors ${auto ? "border-accent/25 bg-accent-soft text-accent" : "border-line bg-white text-ink-2 hover:border-line-2"}`}
      >
        {compact ? icon : <MapPin className="size-3.5 shrink-0 opacity-70" />}
        {!compact && <span className="truncate">{marketLabel(value, autoCountry)}</span>}
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Target market"
          className={`card-raised absolute top-full z-50 mt-2 w-[min(340px,calc(100vw-32px))] p-3 text-left [.dock_&]:bottom-full [.dock_&]:top-auto [.dock_&]:mb-2 [.dock_&]:mt-0 ${align === "right" ? "right-0" : "left-0"}`}
        >
          <p className="px-1 font-mono text-[10.5px] tracking-wider text-faint">TARGET MARKET</p>
          <div className="mt-2 grid grid-cols-3 rounded-lg border border-line bg-subtle p-0.5 text-[12.5px] font-medium" role="tablist">
            {(
              [
                ["auto", "Auto"],
                ["worldwide", "Worldwide"],
                ["country", "Country"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  if (m === "auto") set(null);
                  if (m === "worldwide") set(WORLDWIDE);
                }}
                className={`rounded-md py-1.5 ${mode === m ? "bg-white text-ink shadow-[0_1px_2px_#1018281a]" : "text-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "auto" && (
            <p className="mt-3 px-1 text-[12.5px] leading-relaxed text-muted">
              Scout targets the country your brand is based in{autoCountry ? ` (${countryName(autoCountry)})` : ""}, found when it reads your website.
            </p>
          )}
          {mode === "worldwide" && (
            <p className="mt-3 px-1 text-[12.5px] leading-relaxed text-muted">Competitors and prospects from any country. Best if you already ship internationally.</p>
          )}

          {mode === "country" && (
            <div className="mt-3 space-y-3">
              <label className="flex h-9 items-center gap-2 rounded-lg border border-line px-2.5 focus-within:border-accent">
                <Search className="size-3.5 text-faint" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search countries" aria-label="Search countries" autoFocus className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint" />
              </label>
              <ul className="scroll-thin max-h-44 overflow-y-auto rounded-lg border border-line" role="listbox" aria-label="Country">
                {list.map((c, i) => (
                  <li key={c.code + i}>
                    {!q && i === POPULAR.length && <div className="border-t border-line" />}
                    <button
                      type="button"
                      role="option"
                      aria-selected={country === c.code}
                      onClick={() => {
                        set({ scope: "country", country: c.code });
                        setQuery("");
                      }}
                      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] ${country === c.code ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-subtle"}`}
                    >
                      <span className="w-5 text-center">{flagEmoji(c.code)}</span>
                      <span className="flex-1 truncate">{c.name}</span>
                      {country === c.code && <Check className="size-3.5" />}
                    </button>
                  </li>
                ))}
                {list.length === 0 && <li className="px-2.5 py-2 text-[12.5px] text-muted">No country matches “{query}”.</li>}
              </ul>

              {country && (
                <label className="block">
                  <span className="text-[12px] font-medium text-ink-2">
                    {regionLabel(country)} <span className="font-normal text-muted">(optional, good when you&apos;re starting out)</span>
                  </span>
                  {regions ? (
                    <select
                      value={cur?.region ?? ""}
                      onChange={(e) => set({ scope: "country", country, region: e.target.value || undefined })}
                      className="mt-1.5 h-9 w-full rounded-lg border border-line bg-white px-2 text-[13px] outline-none focus:border-accent"
                    >
                      <option value="">All of {countryName(country)}</option>
                      {regions.items.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={cur?.region ?? ""}
                      onChange={(e) => set({ scope: "country", country, region: e.target.value || undefined })}
                      placeholder={`e.g. a state or city in ${countryName(country)}`}
                      className="mt-1.5 h-9 w-full rounded-lg border border-line bg-white px-2.5 text-[13px] outline-none placeholder:text-faint focus:border-accent"
                    />
                  )}
                </label>
              )}
            </div>
          )}

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                if (commitOnDone) onChange(draft);
              }}
              className="h-8 rounded-lg bg-ink px-3 text-[12.5px] font-medium text-white hover:bg-ink-2"
            >
              {commitOnDone ? "Apply" : "Done"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

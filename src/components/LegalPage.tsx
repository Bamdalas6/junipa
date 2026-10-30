import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./ui";

// Layout for the privacy policy and terms: a readable column with a table of contents.

export const LEGAL = {
  operator: "Junipa's team",
  product: "Junipa",
  site: "junipa.app",
  email: "privacy@junipa.app",
  updated: "25 October 2026",
};

export interface LegalSection {
  id: string;
  title: string;
  body: React.ReactNode;
}

export function LegalPage({
  title,
  intro,
  sections,
  other,
  updated = LEGAL.updated,
}: {
  title: string;
  intro: React.ReactNode;
  sections: LegalSection[];
  other: { href: string; label: string };
  /** When this page last changed, if later than LEGAL.updated. */
  updated?: string;
}) {
  return (
    <main className="lp lp-app min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Home">
            <Logo compact />
          </Link>
          <span className="text-line-2">/</span>
          <span className="truncate text-sm font-medium">{title}</span>
          <span className="flex-1" />
          <Link href={other.href} className="hidden text-[13.5px] text-muted hover:text-ink sm:inline">
            {other.label}
          </Link>
          <ThemeToggle className="size-8" />
        </div>
      </header>

      <div className="mx-auto grid max-w-[1100px] gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Desktop: contents in a sticky side column. Smaller screens: a menu under the title. */}
        <nav aria-label="On this page" className="hidden lg:sticky lg:top-20 lg:block lg:self-start">
          <p className="font-mono text-[11.5px] text-muted">On this page</p>
          <Contents sections={sections} />
        </nav>

        <article className="legal min-w-0 max-w-[720px] text-[15px] leading-[1.7] text-ink-2">
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.025em] text-ink">{title}</h1>
          <p className="mt-2 font-mono text-[12px] text-muted">Last updated {updated}</p>
          <details className="mt-5 rounded-[10px] border border-line bg-white px-4 py-3 lg:hidden">
            <summary className="cursor-pointer text-[14px] font-medium text-ink">On this page</summary>
            <Contents sections={sections} />
          </details>
          <div className="mt-6 space-y-4">{intro}</div>
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-20 border-t border-line pt-8 [&:not(:first-of-type)]:mt-10 first-of-type:mt-10">
              <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">
                {i + 1}. {s.title}
              </h2>
              <div className="mt-3 space-y-3">{s.body}</div>
            </section>
          ))}
          <p className="mt-12 border-t border-line pt-6 text-[13.5px] text-muted">
            Questions about this page? Email{" "}
            <a href={`mailto:${LEGAL.email}`} className="text-accent hover:underline">
              {LEGAL.email}
            </a>
            . See also our <Link href={other.href} className="text-accent hover:underline">{other.label.toLowerCase()}</Link>.
          </p>
        </article>
      </div>
    </main>
  );
}

function Contents({ sections }: { sections: LegalSection[] }) {
  return (
    <ol className="mt-2 space-y-1.5 text-[13.5px]">
      {sections.map((s, i) => (
        <li key={s.id}>
          <a href={`#${s.id}`} className="text-ink-2 hover:text-accent">
            {i + 1}. {s.title}
          </a>
        </li>
      ))}
    </ol>
  );
}

/** A bulleted list inside a legal section. */
export function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-faint">{children}</ul>;
}

/** A small table inside a legal section (scrolls sideways on narrow phones). */
export function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="scroll-thin overflow-x-auto rounded-[10px] border border-line">
      <table className="w-full min-w-[520px] text-left text-[13.5px]">
        <thead className="bg-subtle text-[12px] text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line align-top">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2.5">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

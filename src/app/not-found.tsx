import Link from "next/link";
import { Logo } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CONTACT } from "@/lib/contact";

const DEMO_HREF = "/w/lagos-label.example?industry=fashion&demo=1";

export default function NotFound() {
  return (
    <main className="lp lp-app flex min-h-dvh flex-col overflow-x-clip">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 w-full max-w-[1180px] items-center gap-8 border-x border-line px-5 sm:px-8">
          <Link href="/" aria-label="Home">
            <Logo />
          </Link>
          <span className="flex-1" />
          <Link href="/social" className="hidden text-[14px] font-medium hover:text-accent sm:inline">
            Grow socials
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <section className="flex flex-1 border-b border-line">
        <div className="mx-auto w-full max-w-[1180px] border-x border-line px-5 py-20 sm:px-8 lg:py-28">
          <p className="font-mono text-[12px] text-muted">404 · page not found</p>
          <h1 className="mt-6 text-[40px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[56px]">
            Nothing here
            <br />
            to research.
          </h1>
          <p className="mt-6 max-w-[520px] text-[17px] leading-[1.55] text-muted sm:text-[19px]">This page doesn&apos;t exist or has moved. Start a run from your website, or explore the demo workspace.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/" className="inline-flex h-11 items-center rounded-lg bg-ink px-5 text-[14.5px] font-semibold text-white hover:bg-ink-2">
              Back to home
            </Link>
            <Link href={DEMO_HREF} className="inline-flex h-11 items-center rounded-lg border border-line-2 bg-white px-5 text-[14.5px] font-semibold hover:border-ink/30">
              See the live demo
            </Link>
          </div>
        </div>
      </section>

      <footer>
        <div className="mx-auto flex max-w-[1180px] flex-wrap gap-x-6 gap-y-2 border-x border-line px-5 py-10 font-mono text-[12px] text-muted sm:px-8">
          <span>© 2026 Junipa</span>
          <a href={`mailto:${CONTACT.hello}`} className="hover:text-accent">
            {CONTACT.hello}
          </a>
        </div>
      </footer>
    </main>
  );
}

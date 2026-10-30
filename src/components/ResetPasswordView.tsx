"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "./Auth";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./ui";

// Choose a new password from an emailed reset link. Success signs this device in.

export default function ResetPasswordView() {
  const { open } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Read the token once, then take it out of the address bar and history.
  useEffect(() => {
    const url = new URL(window.location.href);
    // Keep a token already read: in development this effect runs twice.
    setToken((t) => t ?? url.searchParams.get("token") ?? "");
    if (url.searchParams.has("token")) {
      url.searchParams.delete("token");
      window.history.replaceState(null, "", url);
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== again) return setError("The two passwords don't match.");
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    }).catch(() => null);
    const d = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    if (!res?.ok) return setError(d?.error ?? "Something went wrong. Try again.");
    setDone(true);
  };

  const field = "mt-1 h-11 w-full rounded-lg border border-line-2 bg-white px-3.5 text-[14.5px] text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-3 focus:ring-accent/10";

  return (
    <main className="lp lp-app min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1000px] items-center gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Home">
            <Logo compact />
          </Link>
          <span className="text-line-2">/</span>
          <span className="text-sm font-medium">Reset password</span>
          <span className="flex-1" />
          <ThemeToggle className="size-8" />
        </div>
      </header>

      <div className="mx-auto max-w-[432px] px-4 py-10 sm:py-16">
        <div className="rounded-[14px] border border-line bg-paper p-6 sm:p-7">
          {token === null ? (
            <Loader2 className="spin size-5 text-muted" />
          ) : done ? (
            <>
              <CheckCircle2 className="size-7 text-good" />
              <h1 className="mt-3 text-[21px] font-semibold tracking-[-0.02em]">Password changed</h1>
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted">You&apos;re signed in on this device. Any other devices have been signed out.</p>
              <Link href="/" className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-ink text-[14.5px] font-semibold text-white hover:bg-ink-2">
                Go to Junipa
              </Link>
            </>
          ) : !token ? (
            <>
              <h1 className="text-[21px] font-semibold tracking-[-0.02em]">This link isn&apos;t complete</h1>
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted">Open the link from your email again, or ask for a new one.</p>
              <button type="button" onClick={() => open({ mode: "forgot" })} className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-ink text-[14.5px] font-semibold text-white hover:bg-ink-2">
                Send a new link
              </button>
            </>
          ) : (
            <>
              <h1 className="text-[21px] font-semibold tracking-[-0.02em]">Choose a new password</h1>
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted">Use at least 8 characters. You&apos;ll be signed out everywhere else.</p>
              <form onSubmit={submit} className="mt-5 space-y-3">
                <label className="block">
                  <span className="text-[12.5px] font-medium text-ink-2">New password</span>
                  <input type="password" required minLength={8} maxLength={200} autoFocus value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className={field} />
                </label>
                <label className="block">
                  <span className="text-[12.5px] font-medium text-ink-2">Type it again</span>
                  <input type="password" required minLength={8} maxLength={200} value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" className={field} />
                </label>
                {error && (
                  <p className="text-[13px] text-bad">
                    {error}{" "}
                    {/expired|isn't valid/.test(error) && (
                      <button type="button" onClick={() => open({ mode: "forgot" })} className="font-medium text-ink underline underline-offset-2">
                        Send a new link
                      </button>
                    )}
                  </p>
                )}
                <button type="submit" disabled={busy} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-ink text-[14.5px] font-semibold text-white hover:bg-ink-2 disabled:opacity-60">
                  {busy && <Loader2 className="spin size-4" />}
                  Save new password
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

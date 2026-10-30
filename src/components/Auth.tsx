"use client";

import { CreditCard, Loader2, LogOut, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { flushPushes, uploadLocalWorkspaces } from "@/lib/cloud";
import { clearAllWorkspaces } from "@/lib/store";

// Accounts in the browser: who is signed in, the sign-up / sign-in box, and the
// account menu. Sessions live in an http-only cookie set by /api/auth/*.

export interface AuthUser {
  email: string;
  name: string | null;
  avatar: string | null;
}

type Mode = "signup" | "signin" | "forgot";
interface OpenOptions {
  mode?: Mode;
  /** One line above the form, e.g. why an account is needed right now. */
  reason?: string;
  /** Called once the person is signed in (email sign-in; Google reloads the page instead). */
  onDone?: () => void;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** False until we know whether someone is signed in. */
  ready: boolean;
  google: boolean;
  open: (opts?: OpenOptions) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({ user: null, ready: false, google: false, open: () => {}, signOut: async () => {} });
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [google, setGoogle] = useState(false);
  const [reset, setReset] = useState(false);
  const [dialog, setDialog] = useState<(OpenOptions & { mode: Mode; error?: string }) | null>(null);
  const synced = useRef(false);

  const refresh = useCallback(async () => {
    const d = (await fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({ user: null, google: false, reset: false }))) as { user: AuthUser | null; google: boolean; reset?: boolean };
    setUser(d.user);
    setGoogle(d.google);
    setReset(!!d.reset);
    setReady(true);
    // Research done before signing in moves into the account, once per page load.
    if (d.user && !synced.current) {
      synced.current = true;
      uploadLocalWorkspaces();
    }
    return d.user;
  }, []);

  useEffect(() => {
    refresh();
    // Back from a Google sign-in that didn't finish.
    const url = new URL(window.location.href);
    if (url.searchParams.get("auth") === "google-failed") {
      url.searchParams.delete("auth");
      window.history.replaceState(null, "", url);
      setDialog({ mode: "signin", error: "Google sign-in didn't finish. Try again, or use your email." });
    }
  }, [refresh]);

  const open = useCallback((opts: OpenOptions = {}) => setDialog({ ...opts, mode: opts.mode ?? "signup" }), []);

  const signOut = useCallback(async () => {
    await flushPushes();
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
    // The research is saved in the account; don't leave a copy on a shared computer.
    // Reload instead of changing state here: an open workspace would save itself again.
    clearAllWorkspaces();
    window.location.replace("/");
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, google, open, signOut }}>
      {children}
      {dialog && (
        <AuthDialog
          {...dialog}
          google={google}
          reset={reset}
          onClose={() => setDialog(null)}
          onSignedIn={async () => {
            await refresh();
            const done = dialog.onDone;
            setDialog(null);
            done?.();
          }}
        />
      )}
    </AuthContext.Provider>
  );
}

function AuthDialog({
  mode: initialMode,
  reason,
  error: initialError,
  google,
  reset,
  onClose,
  onSignedIn,
}: OpenOptions & { mode: Mode; error?: string; google: boolean; reset: boolean; onClose: () => void; onSignedIn: () => void }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? "");
  /** The address a reset link was just sent to. */
  const [sentTo, setSentTo] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "signup" ? { name, email, password } : mode === "forgot" ? { email } : { email, password }),
    }).catch(() => null);
    const d = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    if (!res?.ok) return setError(d?.error ?? "Something went wrong. Try again.");
    if (mode === "forgot") return setSentTo(email.trim());
    onSignedIn();
  };

  const switchTo = (m: Mode) => {
    setMode(m);
    setError("");
    setSentTo("");
    setPassword("");
  };

  const next = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
  const signup = mode === "signup";
  const forgot = mode === "forgot";
  const field = "mt-1 h-11 w-full rounded-lg border border-line-2 bg-white px-3.5 text-[14.5px] text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-3 focus:ring-accent/10";

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-[#0b0d10]/55 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="auth-title" className="relative w-full max-w-[400px] rounded-[14px] border border-line bg-paper p-6 text-ink shadow-[0_24px_80px_-20px_#0b0d1066] sm:p-7">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 grid size-8 place-items-center rounded-md text-muted hover:bg-subtle hover:text-ink">
          <X className="size-4" />
        </button>
        <h2 id="auth-title" className="text-[21px] font-semibold tracking-[-0.02em]">
          {signup ? "Create your free account" : forgot ? "Reset your password" : "Welcome back"}
        </h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
          {forgot
            ? "Enter your account's email and we'll send you a link to choose a new password."
            : (reason ?? (signup ? "Save your research and pick it up on any device." : "Sign in to open your saved research."))}
        </p>

        {forgot && sentTo && (
          <div className="mt-5 rounded-lg border border-line bg-subtle p-4 text-[14px] leading-relaxed">
            <p>
              If there&apos;s a Junipa account for <span className="break-all font-medium">{sentTo}</span>, a reset link is on its way. It works once and expires in an hour.
            </p>
            <p className="mt-2 text-[13px] text-muted">Nothing after a few minutes? Check your spam folder, or try again.</p>
          </div>
        )}

        {google && !forgot && (
          <>
            <a
              href={`/api/auth/google?next=${encodeURIComponent(next)}`}
              className="mt-5 flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-line-2 bg-white text-[14.5px] font-medium text-ink hover:border-ink/30"
            >
              <GoogleMark /> Continue with Google
            </a>
            <div className="my-4 flex items-center gap-3 font-mono text-[11px] text-faint">
              <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}

        <form onSubmit={submit} hidden={forgot && !!sentTo} className={google && !forgot ? "space-y-3" : "mt-5 space-y-3"}>
          {signup && (
            <label className="block">
              <span className="text-[12.5px] font-medium text-ink-2">Name (optional)</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} className={field} />
            </label>
          )}
          <label className="block">
            <span className="text-[12.5px] font-medium text-ink-2">Email</span>
            <input ref={emailRef} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@brand.com" className={field} />
          </label>
          {!forgot && (
            <label className="block">
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-[12.5px] font-medium text-ink-2">Password</span>
                {!signup && reset && (
                  <button type="button" onClick={() => switchTo("forgot")} className="text-[12.5px] text-muted underline-offset-2 hover:text-ink hover:underline">
                    Forgot password?
                  </button>
                )}
              </span>
              <input
                type="password"
                required
                minLength={signup ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={signup ? "new-password" : "current-password"}
                placeholder={signup ? "At least 8 characters" : ""}
                className={field}
              />
            </label>
          )}
          {error && <p className="text-[13px] text-bad">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-ink text-[14.5px] font-semibold text-white hover:bg-ink-2 disabled:opacity-60"
          >
            {busy && <Loader2 className="spin size-4" />}
            {signup ? "Create account" : forgot ? "Send reset link" : "Sign in"}
          </button>
        </form>

        {signup && (
          <p className="mt-3 text-center text-[12px] leading-relaxed text-faint">
            By creating an account you agree to our{" "}
            <a href="/terms" target="_blank" className="underline hover:text-ink">
              Terms
            </a>{" "}
            and{" "}
            <a href="/privacy" target="_blank" className="underline hover:text-ink">
              Privacy Policy
            </a>
            .
          </p>
        )}
        <p className="mt-4 text-center text-[13.5px] text-muted">
          {signup ? "Already have an account? " : forgot ? "Remembered it? " : "New to Junipa? "}
          <button type="button" onClick={() => switchTo(signup || forgot ? "signin" : "signup")} className="font-medium text-ink underline-offset-2 hover:underline">
            {signup || forgot ? "Sign in" : "Create an account"}
          </button>
        </p>
      </div>
    </div>
  );
}

/** "Sign in" when signed out; the person's initial with a menu when signed in. */
export function AccountButton({ className = "", signInClassName = "" }: { className?: string; signInClassName?: string }) {
  const { user, ready, open, signOut } = useAuth();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  if (!ready) return <span className={`inline-block size-8 ${className}`} />;
  if (!user)
    return (
      <button type="button" onClick={() => open({ mode: "signin" })} className={`h-9 whitespace-nowrap rounded-lg px-3 text-[14px] font-medium text-ink-2 hover:bg-subtle hover:text-ink ${className} ${signInClassName}`}>
        Sign in
      </button>
    );

  const initial = (user.name || user.email).trim()[0]?.toUpperCase() ?? "?";
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setMenu((m) => !m)}
        aria-label="Account"
        aria-expanded={menu}
        className="grid size-8 place-items-center overflow-hidden rounded-full bg-accent-soft text-[13px] font-semibold text-accent ring-1 ring-line hover:ring-ink/30"
      >
        {user.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatar} alt="" width={32} height={32} referrerPolicy="no-referrer" className="size-8 object-cover" />
        ) : (
          initial
        )}
      </button>
      {menu && (
        <div role="menu" className="absolute right-0 top-10 z-50 w-60 rounded-[10px] border border-line bg-paper p-1.5 text-ink shadow-[0_12px_40px_-12px_#0b0d1040]">
          <div className="px-2.5 py-2">
            {user.name && <p className="truncate text-[14px] font-semibold">{user.name}</p>}
            <p className="truncate text-[13px] text-muted">{user.email}</p>
          </div>
          <div className="my-1 h-px bg-line" />
          <a href="/billing" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[14px] hover:bg-subtle">
            <CreditCard className="size-4 text-muted" /> Billing
          </a>
          <button type="button" role="menuitem" onClick={signOut} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[14px] hover:bg-subtle">
            <LogOut className="size-4 text-muted" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-[18px]" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

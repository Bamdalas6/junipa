"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

// Light / dark switch. Starts from the system setting; a pick is remembered in this
// browser and applied before first paint by the boot script in app/layout.tsx.
export const THEME_KEY = "junia-theme";

type Theme = "light" | "dark";

function current(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(current());
    // Follow the system while the visitor hasn't picked a theme.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setTheme(current());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next: Theme = current() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
    setTheme(next);
  };

  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className={`grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-white text-ink-2 transition-colors hover:border-line-2 hover:text-ink ${className}`}
    >
      {/* Render both until mounted so the server and first client render match. */}
      {theme === null ? <Moon className="size-4 opacity-0" /> : dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

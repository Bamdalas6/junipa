"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Counts page views for the admin dashboard (see /api/t): the page, where the visitor came
// from on their first page, and how long they stayed. No cookies. Visitors whose browser
// asks not to be tracked (Global Privacy Control or Do Not Track) aren't counted.

let firstView = true;

function send(body: object): Promise<{ id?: string | null }> {
  return fetch("/api/t", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true, cache: "no-store" })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
}

export function VisitTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.globalPrivacyControl || nav.doNotTrack === "1" || pathname.startsWith("/admin")) return;
    const started = Date.now();
    let id: string | null | undefined;
    let view: Promise<void> | null = null;
    let left = false;
    // Sent a tick later, so a mount that's undone at once (React does this in development)
    // never counts: its cleanup cancels the timer before anything is sent.
    const timer = setTimeout(() => {
      const url = new URL(window.location.href);
      view = send({
        path: pathname,
        // The referring site only matters on the first page; later ones are moves within the site.
        referrer: firstView ? document.referrer : "",
        utm_source: url.searchParams.get("utm_source"),
        utm_medium: url.searchParams.get("utm_medium"),
        utm_campaign: url.searchParams.get("utm_campaign"),
      }).then((d) => {
        id = d.id;
      });
      firstView = false;
    }, 0);

    const leave = () => {
      if (!view || left) return;
      left = true;
      const ms = Date.now() - started;
      view.then(() => {
        if (id) send({ id, ms });
      });
    };
    const onHide = () => document.visibilityState === "hidden" && leave();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", leave);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [pathname]);

  return null;
}

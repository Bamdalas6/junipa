"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";

// The landing page is "built" live by a swarm of agent cursors, like a shared
// design canvas: each element waits hidden until a cursor flies to it, selects
// it (blue box, handles, size badge) and either fades it in or types it out.
// Reduced motion, or no JavaScript, shows the finished page straight away.

const AGENTS = [
  { name: "research", color: "#F24E1E" },
  { name: "brand", color: "#A259FF" },
  { name: "market", color: "#1ABCFE" },
  { name: "prospects", color: "#0ACF83" },
  { name: "signals", color: "#FF7262" },
  { name: "writer", color: "#FFC700" },
  { name: "people", color: "#FF8A00" },
  { name: "emails", color: "#E04E9C" },
  { name: "review", color: "#4C5BD4" },
  { name: "outreach", color: "#14AE5C" },
  { name: "verify", color: "#1ABCFE" },
  { name: "export", color: "#A259FF" },
];
const SEL = "#0d99ff";
// The opening flock: the 12 agents plus a crowd of unnamed collaborators.
const FLOCK = 36;
const EXTRA = ["#9747FF", "#E8467C", "#0D99FF", "#00B5CE", "#F24E1E", "#0ACF83", "#FFC700", "#A259FF"];
const CURSORS = Array.from({ length: FLOCK }, (_, i) => (i < AGENTS.length ? AGENTS[i] : { name: "", color: EXTRA[i % EXTRA.length] }));
// Auto-start the build for visitors who don't scroll, so the run bar always appears.
const AUTO_START_MS = 5000;

type Kind = "box" | "type";
interface Job {
  el: HTMLElement;
  kind: Kind;
  /** Typing time in ms, so the cursor can glide along the text. */
  duration: number;
  run: () => Promise<void>;
}
interface Sel {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  gap: number; // distance from the frame's left edge
  top: boolean; // belongs to the sticky header, so it draws above it
}
interface Cursor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  busy: boolean;
  spawned: boolean;
  // Flocking personality
  speed: number;
  force: number;
  spin: number;
  curl: number;
  orbit: number;
}

const BuildContext = createContext<{ register: (job: Job) => () => void } | null>(null);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const motionOk = () => typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** Shortest turn from one angle to another, so arrows never spin the long way round. */
const turn = (from: number, to: number) => from + ((((to - from) % 360) + 540) % 360) - 180;
// The arrow's tip points up-left (-135deg), so rotate by heading + 135 to point it along its path.
const headingOf = (dx: number, dy: number) => (Math.atan2(dy, dx) * 180) / Math.PI + 135;

export function BuildCanvas({ children, frame }: { children: ReactNode; frame: React.RefObject<HTMLElement | null> }) {
  const cursorEls = useRef<(HTMLDivElement | null)[]>([]);
  const arrowEls = useRef<(SVGSVGElement | null)[]>([]);
  const cursors = useRef<Cursor[]>(
    CURSORS.map(() => ({ x: -200, y: -200, vx: 0, vy: 0, angle: 0, busy: false, spawned: false, speed: rand(1000, 1500), force: rand(3500, 6000), spin: rand(2.2, 3.4), curl: rand(-1, 1), orbit: rand(70, 170) })),
  );
  const queue = useRef<Job[]>([]);
  const jobs = useRef(new Map<HTMLElement, Job>());
  const io = useRef<IntersectionObserver | null>(null);
  const started = useRef(false);
  const live = useRef(false);
  const active = useRef(0);
  const built = useRef(0);
  const lastWork = useRef(0);
  const selId = useRef(0);
  const [sels, setSels] = useState<Sel[]>([]);
  const [chrome, setChrome] = useState(false);
  const [intro, setIntro] = useState<"on" | "gone" | "off">("off");
  const [flocking, setFlocking] = useState(false);
  const hideChrome = useRef<ReturnType<typeof setTimeout> | null>(null);

  // While rulers show, the sticky header slides down to sit under them.
  useEffect(() => {
    const root = document.documentElement;
    if (chrome) root.dataset.rulers = "";
    else delete root.dataset.rulers;
  }, [chrome]);

  const limit = () => (window.innerWidth < 640 ? 6 : AGENTS.length);
  const frameBox = () => {
    const r = frame.current?.getBoundingClientRect();
    return r ? { left: r.left + window.scrollX, right: r.right + window.scrollX } : { left: 0, right: window.innerWidth };
  };

  const aim = (i: number, angle: number, animate: boolean) => {
    const c = cursors.current[i];
    c.angle = turn(c.angle, angle);
    const a = arrowEls.current[i];
    if (!a) return;
    a.style.transition = animate ? "transform 240ms ease" : "none";
    a.style.transform = `rotate(${c.angle}deg)`;
  };

  const place = (i: number, x: number, y: number, ms: number, ease = "cubic-bezier(.3,.7,.2,1)") => {
    const c = cursors.current[i];
    const el = cursorEls.current[i];
    const dx = x - c.x;
    const dy = y - c.y;
    if (Math.hypot(dx, dy) > 6) aim(i, headingOf(dx, dy), ms > 0);
    c.x = x;
    c.y = y;
    if (!el) return;
    el.style.transitionDuration = `${ms}ms, 300ms`;
    el.style.transitionTimingFunction = `${ease}, ease`;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    el.style.opacity = "1";
  };
  const fly = (i: number, x: number, y: number) => {
    const c = cursors.current[i];
    const ms = Math.max(240, Math.min(700, 200 + Math.hypot(x - c.x, y - c.y) * 0.4));
    place(i, x, y, ms);
    return sleep(ms);
  };
  const icon = (i: number, kind: "arrow" | "text") => cursorEls.current[i]?.setAttribute("data-icon", kind);

  // ----- Work loop -----
  const dispatch = () => {
    if (!started.current) return;
    queue.current = queue.current.filter((j) => j.el.isConnected);
    queue.current.sort((a, b) => {
      const ra = a.el.getBoundingClientRect();
      const rb = b.el.getBoundingClientRect();
      return ra.top - rb.top || ra.left - rb.left;
    });
    let stagger = 0;
    while (queue.current.length) {
      const free = cursors.current.map((c, i) => ({ c, i })).filter(({ c, i }) => !c.busy && i < limit());
      if (!free.length) return;
      const job = queue.current.shift()!;
      const r = job.el.getBoundingClientRect();
      const tx = r.left + window.scrollX;
      const ty = r.top + window.scrollY;
      const { i } = free.reduce((best, f) => (Math.hypot(f.c.x - tx, f.c.y - ty) < Math.hypot(best.c.x - tx, best.c.y - ty) ? f : best));
      cursors.current[i].busy = true;
      const delay = stagger;
      stagger += 45;
      setTimeout(() => work(i, job), delay);
    }
  };

  const work = async (i: number, job: Job) => {
    active.current++;
    lastWork.current = Date.now();
    if (hideChrome.current) clearTimeout(hideChrome.current);
    setChrome(true);
    try {
      let r = job.el.getBoundingClientRect();
      const x = r.left + window.scrollX;
      const y = r.top + window.scrollY;
      await fly(i, job.kind === "type" ? x : x + Math.min(r.width * 0.35, 48), y + Math.min(r.height * 0.55, 20));
      r = job.el.getBoundingClientRect();
      const sel: Sel = { id: ++selId.current, x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height, gap: r.left + window.scrollX - frameBox().left, top: !!job.el.closest("header") };
      setSels((s) => [...s.slice(-14), sel]);
      if (job.kind === "type") {
        icon(i, "text");
        place(i, sel.x + sel.w, cursors.current[i].y, job.duration, "linear");
      }
      await job.run();
      await sleep(job.kind === "type" ? 160 : 260);
      setSels((s) => s.filter((x) => x.id !== sel.id));
      built.current++;
    } finally {
      icon(i, "arrow");
      cursors.current[i].busy = false;
      active.current--;
      lastWork.current = Date.now();
      dispatch();
      if (active.current === 0 && queue.current.length === 0) {
        hideChrome.current = setTimeout(() => setChrome(false), 1200);
      }
    }
  };

  const ensureObserver = () => {
    if (io.current) return io.current;
    io.current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const job = jobs.current.get(e.target as HTMLElement);
          io.current?.unobserve(e.target);
          if (job) queue.current.push(job);
        }
        dispatch();
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    return io.current;
  };

  const register = (job: Job) => {
    if (!live.current) {
      job.el.dataset.shown = "1";
      return () => {};
    }
    jobs.current.set(job.el, job);
    ensureObserver().observe(job.el);
    return () => {
      jobs.current.delete(job.el);
      io.current?.unobserve(job.el);
      queue.current = queue.current.filter((j) => j !== job);
    };
  };

  // Decide before paint whether to build (a client-side visit skips the boot script).
  useLayoutEffect(() => {
    live.current = motionOk();
    const root = document.documentElement;
    if (live.current) root.classList.add("lp-build", "lp-running");
    else root.classList.remove("lp-build");
    return () => root.classList.remove("lp-build", "lp-running");
  }, []);

  // Intro: a live flock circles the logo, follows the mouse and scatters from it.
  // The first scroll, tap or key press (or a few seconds) sends the agents to build.
  useEffect(() => {
    if (!live.current) return;
    let raf = 0;
    let stop = false;
    const listeners: [string, EventListener][] = [];
    const on = (type: string, fn: EventListener, opts?: AddEventListenerOptions) => {
      window.addEventListener(type, fn, opts);
      listeners.push([type, fn]);
    };
    const off = () => listeners.splice(0).forEach(([type, fn]) => window.removeEventListener(type, fn));
    let auto: ReturnType<typeof setTimeout> | undefined;

    const begin = () => {
      if (started.current) return;
      started.current = true;
      stop = true;
      cancelAnimationFrame(raf);
      off();
      clearTimeout(auto);
      setIntro("gone");
      setFlocking(false);
      setTimeout(() => setIntro("off"), 450);
      const vw = window.innerWidth;
      cursors.current.forEach((c, i) => {
        const el = cursorEls.current[i];
        if (!el || !c.spawned || i < limit()) return;
        // The crowd peels away; the agents stay and get to work.
        const dir = c.x - window.scrollX < vw / 2 ? -1 : 1;
        place(i, c.x + dir * vw * 0.75, c.y + rand(-200, 200), 900, "cubic-bezier(.5,0,.75,0)");
        setTimeout(() => (el.style.opacity = "0"), 650);
      });
      dispatch();
    };

    if (window.scrollY > 120) {
      // Arrived mid-page: agents come in from the edges and start straight away.
      const cx = window.innerWidth / 2;
      const cy = window.scrollY + window.innerHeight / 2;
      const n = limit();
      cursors.current.forEach((c, i) => {
        if (i >= n) return;
        const a = (i / n) * Math.PI * 2;
        c.spawned = true;
        place(i, cx + Math.cos(a) * window.innerWidth * 0.6, cy + Math.sin(a) * window.innerHeight * 0.6, 0);
      });
      started.current = true;
      dispatch();
    } else {
      setIntro("on");
      setFlocking(true);
      let mouse: { x: number; y: number } | null = null;
      let last = performance.now();
      let t = 0;
      let spawnCd = 0;
      let spawned = 0;
      const scale = window.innerWidth < 640 ? 0.7 : 1;
      on("mousemove", ((e: MouseEvent) => {
        mouse = { x: e.clientX + window.scrollX, y: e.clientY + window.scrollY };
      }) as EventListener);
      on("mouseout", ((e: MouseEvent) => {
        if (!e.relatedTarget) mouse = null;
      }) as EventListener);
      const step = (now: number) => {
        if (stop) return;
        const dt = Math.min(1 / 30, (now - last) / 1000);
        last = now;
        t += dt;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const cs = cursors.current;
        // Cursors stream in from the left and right edges.
        spawnCd -= dt;
        if (spawned < FLOCK && spawnCd <= 0) {
          const c = cs[spawned];
          const fromLeft = Math.random() < 0.5;
          c.x = window.scrollX + (fromLeft ? -30 : vw + 30);
          c.y = window.scrollY + rand(0.1, 0.9) * vh;
          c.vx = fromLeft ? 400 : -400;
          c.vy = 0;
          c.spawned = true;
          const el = cursorEls.current[spawned];
          if (el) {
            el.style.transitionDuration = "0ms, 300ms";
            el.style.opacity = "1";
          }
          spawned++;
          spawnCd = 0.04;
        }
        // The flock orbits a point that drifts around the logo, or follows the mouse.
        const o = mouse ?? { x: window.scrollX + vw * (0.5 + 0.28 * Math.sin(t * 0.37)), y: window.scrollY + vh * (0.5 + 0.25 * Math.sin(t * 0.53 + 1)) };
        const radius = 135 * scale * (1 + 0.18 * Math.sin(t * 0.55));
        const swirl = Math.tanh(Math.cos(t * 0.11) * 3); // reverses direction now and then
        const flock = cs.filter((c) => c.spawned);
        const want = flock.map((c) => {
          const dx = c.x - o.x;
          const dy = c.y - o.y;
          const d = Math.hypot(dx, dy) || 0.01;
          const nx = dx / d;
          const ny = dy / d;
          const ang = Math.atan2(dy, dx);
          const ring = radius * (1 + 0.3 * Math.sin(3 * ang + t * 0.7)) + (c.orbit - 120) * 0.55 * scale;
          const tang = 300 * (0.7 + c.spin * 0.2) * swirl;
          const radial = clamp((ring - d) * 4, -2600, 1400);
          const far = clamp((d - ring) / 600, 0, 1);
          return [-ny * tang + nx * radial - ny * c.curl * 400 * far, nx * tang + ny * radial + nx * c.curl * 400 * far];
        });
        flock.forEach((c, k) => {
          // Align with nearby cursors, like birds.
          let ax = 0;
          let ay = 0;
          let wsum = 0;
          for (const other of flock) {
            if (other === c) continue;
            const d = Math.hypot(other.x - c.x, other.y - c.y);
            if (d > 90) continue;
            const w = 1 - d / 90;
            ax += other.vx * w;
            ay += other.vy * w;
            wsum += w;
          }
          let [fx, fy] = want[k];
          if (wsum > 0) {
            fx = fx * 0.7 + (ax / wsum) * 0.3;
            fy = fy * 0.7 + (ay / wsum) * 0.3;
          }
          const gap = Math.max(0, Math.hypot(c.x - o.x, c.y - o.y) - 180 * scale);
          const max = c.speed * (1.3 + Math.min(3.2, gap / 90));
          const sp = Math.hypot(fx, fy);
          if (sp > max) {
            fx *= max / sp;
            fy *= max / sp;
          }
          let sx = (fx - c.vx) * 6;
          let sy = (fy - c.vy) * 6;
          const fmax = c.force * (1.4 + Math.min(5, gap / 50));
          const fm = Math.hypot(sx, sy);
          if (fm > fmax) {
            sx *= fmax / fm;
            sy *= fmax / fm;
          }
          c.vx += sx * dt;
          c.vy += sy * dt;
          c.x += c.vx * dt;
          c.y += c.vy * dt;
        });
        // Scatter from the pointer.
        if (mouse) {
          for (const c of flock) {
            const dx = c.x - mouse.x;
            const dy = c.y - mouse.y;
            const d = Math.hypot(dx, dy) || 0.01;
            if (d >= 48) continue;
            c.x = mouse.x + (dx / d) * 48;
            c.y = mouse.y + (dy / d) * 48;
            c.vx += (dx / d) * 260;
            c.vy += (dy / d) * 260;
          }
        }
        cs.forEach((c, i) => {
          if (!c.spawned) return;
          if (Math.hypot(c.vx, c.vy) > 30) c.angle += (turn(c.angle, headingOf(c.vx, c.vy)) - c.angle) * Math.min(1, dt * 8);
          const el = cursorEls.current[i];
          if (el) el.style.transform = `translate3d(${c.x}px, ${c.y}px, 0)`;
          const a = arrowEls.current[i];
          if (a) {
            a.style.transition = "none";
            a.style.transform = `rotate(${c.angle}deg)`;
          }
        });
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      on("wheel", begin, { passive: true });
      on("touchmove", begin, { passive: true });
      on("keydown", begin);
      on("pointerdown", begin);
      on("scroll", (() => window.scrollY > 8 && begin()) as EventListener, { passive: true });
      auto = setTimeout(begin, AUTO_START_MS);
    }
    // Idle agents drift around whatever part of the page you're looking at.
    const wander = setInterval(() => {
      if (!started.current) return;
      const { left, right } = frameBox();
      const quiet = Date.now() - lastWork.current > 6000 && active.current === 0;
      cursors.current.forEach((c, i) => {
        const el = cursorEls.current[i];
        if (c.busy || !el) return;
        if (i >= limit() || (quiet && i >= 5)) {
          el.style.opacity = "0";
          return;
        }
        const off = c.y < window.scrollY - 40 || c.y > window.scrollY + window.innerHeight + 40;
        if (!off && Math.random() > 0.3) return;
        const x = left + Math.random() * Math.max(200, right - left);
        const y = window.scrollY + 80 + Math.random() * Math.max(120, window.innerHeight - 160);
        place(i, x, y, off ? 700 : 1600 + Math.random() * 1200, "cubic-bezier(.45,0,.55,1)");
      });
    }, 900);
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      clearInterval(wander);
      clearTimeout(auto);
      off();
      io.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <BuildContext.Provider value={{ register }}>
      {children}
      {/* Guides and selection boxes sit under the sticky header; the header's own selections and the cursors sit above it. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[35] overflow-hidden">
        {chrome && <Guides frame={frame} />}
        {sels
          .filter((x) => !x.top)
          .map((x) => (
            <Selection key={x.id} s={x} />
          ))}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[60] overflow-hidden" data-flock={flocking ? "" : undefined}>
        {sels
          .filter((x) => x.top)
          .map((x) => (
            <Selection key={x.id} s={x} />
          ))}
        {CURSORS.map((a, i) => (
          <div
            key={i}
            ref={(el) => {
              cursorEls.current[i] = el;
            }}
            className="lp-cursor"
            data-icon="arrow"
            style={{ opacity: 0, transform: "translate3d(-100px,-100px,0)" }}
          >
            <svg
              ref={(el) => {
                arrowEls.current[i] = el;
              }}
              className="i-arrow"
              width="22"
              height="22"
              viewBox="0 0 22 22"
              style={{ transformOrigin: "3px 2.5px" }}
            >
              <path d="M3.2 2.4c-.5-.3-1 .2-.8.7l5.3 15.6c.2.6 1 .6 1.2 0l2.1-6.1 6.1-2.1c.6-.2.6-1 0-1.2z" fill={a.color} stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <svg className="i-text" width="14" height="22" viewBox="0 0 14 22" style={{ marginLeft: -7, marginTop: -4 }}>
              <path d="M3 2.5h8M3 19.5h8M7 2.5v17" stroke={a.color} strokeWidth="2" strokeLinecap="round" />
            </svg>
            {a.name && (
              <span
                className="lp-label absolute left-4 top-[18px] whitespace-nowrap rounded-[4px] px-1.5 py-px font-mono text-[10.5px] font-medium leading-[15px] shadow-[0_1px_2px_#0000002e] max-sm:hidden"
                style={{ background: a.color, color: a.color === "#FFC700" ? "#121417" : "#fff" }}
              >
                agent/{a.name}
              </span>
            )}
          </div>
        ))}
      </div>
      {chrome && <Rulers frame={frame} sels={sels} />}
      {intro !== "off" && (
        <div aria-hidden className={`pointer-events-none fixed left-1/2 top-1/2 z-[55] -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ${intro === "gone" ? "scale-90 opacity-0" : "opacity-100"}`}>
          <IntroMark />
        </div>
      )}
    </BuildContext.Provider>
  );
}

function IntroMark() {
  return (
    <span className="grid size-[68px] place-items-center rounded-[18px] bg-line-2">
      <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="var(--color-paper)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="17" r="2" />
        <circle cx="18" cy="7" r="2" />
        <path d="M7.6 15.6 16.4 8.4" />
        <path d="M6 9V5h4" />
      </svg>
    </span>
  );
}

function Selection({ s }: { s: Sel }) {
  const handle: CSSProperties = { position: "absolute", width: 7, height: 7, background: "#fff", border: `1px solid ${SEL}` };
  return (
    <>
      {s.gap > 28 && (
        <div className="absolute max-md:hidden" style={{ left: s.x - s.gap, top: s.y + s.h / 2, width: s.gap }}>
          <div className="border-t border-dashed" style={{ borderColor: "#F24E1E99" }} />
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-[3px] bg-[#F24E1E] px-1 font-mono text-[9.5px] leading-[15px] text-[#fff]">{Math.round(s.gap)}</span>
        </div>
      )}
      <div className="absolute" style={{ left: s.x - 1, top: s.y - 1, width: s.w + 2, height: s.h + 2, border: `1px solid ${SEL}` }}>
        <span style={{ ...handle, left: -4, top: -4 }} />
        <span style={{ ...handle, right: -4, top: -4 }} />
        <span style={{ ...handle, left: -4, bottom: -4 }} />
        <span style={{ ...handle, right: -4, bottom: -4 }} />
        <span className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-[3px] px-1 font-mono text-[10px] leading-[16px] text-[#fff]" style={{ background: SEL }}>
          {Math.round(s.w)} × {Math.round(s.h)}
        </span>
      </div>
    </>
  );
}

/** Red layout guides along the frame edges while agents are working. */
function Guides({ frame }: { frame: React.RefObject<HTMLElement | null> }) {
  const [box, setBox] = useState<{ l: number; r: number } | null>(null);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setBox({ l: r.left + window.scrollX, r: r.right + window.scrollX });
  }, [frame]);
  if (!box) return null;
  return (
    <>
      <div className="absolute inset-y-0 w-px bg-[#F24E1E]/45" style={{ left: box.l }} />
      <div className="absolute inset-y-0 w-px bg-[#F24E1E]/45" style={{ left: box.r - 1 }} />
    </>
  );
}

/** Design-tool rulers on the top and left edges, numbered from the frame's corner. */
function Rulers({ frame, sels }: { frame: React.RefObject<HTMLElement | null>; sels: Sel[] }) {
  const [view, setView] = useState({ w: 0, h: 0, sx: 0, sy: 0, fl: 0 });
  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const fl = (frame.current?.getBoundingClientRect().left ?? 0) + window.scrollX;
      setView({ w: window.innerWidth, h: window.innerHeight, sx: window.scrollX, sy: window.scrollY, fl });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [frame]);
  if (!view.w) return null;
  const last = sels[sels.length - 1];
  const topTicks: { x: number; label?: number }[] = [];
  const origin = view.fl - view.sx;
  for (let v = Math.floor(-origin / 10) * 10; origin + v < view.w; v += 10) {
    if (origin + v < 20) continue;
    topTicks.push({ x: origin + v, label: v % 100 === 0 ? v : undefined });
  }
  const leftTicks: { y: number; label?: number }[] = [];
  for (let v = Math.ceil(view.sy / 10) * 10; v - view.sy < view.h; v += 10) {
    if (v - view.sy < 20) continue;
    leftTicks.push({ y: v - view.sy, label: v % 100 === 0 ? v : undefined });
  }
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] max-md:hidden">
      <svg className="absolute left-0 top-0" width={view.w} height={20} style={{ background: "#2c2c2c" }}>
        {last && <rect x={last.x - view.sx} y={0} width={last.w} height={20} fill="#0d99ff33" />}
        {topTicks.map((t) => (
          <g key={t.x}>
            <line x1={t.x} x2={t.x} y1={t.label !== undefined ? 6 : 15} y2={20} stroke="#5c5c5c" />
            {t.label !== undefined && (
              <text x={t.x + 3} y={11} fontSize="9" fill="#8c8c8c" fontFamily="Inter, system-ui">
                {t.label}
              </text>
            )}
          </g>
        ))}
        {last && (
          <>
            <text x={last.x - view.sx + 2} y={11} fontSize="9" fill="#0d99ff" fontFamily="Inter, system-ui">
              {Math.round(last.x - view.fl)}
            </text>
            <text x={last.x - view.sx + last.w + 2} y={11} fontSize="9" fill="#0d99ff" fontFamily="Inter, system-ui">
              {Math.round(last.x - view.fl + last.w)}
            </text>
          </>
        )}
      </svg>
      <svg className="absolute left-0 top-0" width={20} height={view.h} style={{ background: "#2c2c2c" }}>
        {last && <rect x={0} y={last.y - view.sy} width={20} height={last.h} fill="#0d99ff33" />}
        {leftTicks.map((t) => (
          <g key={t.y}>
            <line y1={t.y} y2={t.y} x1={t.label !== undefined ? 6 : 15} x2={20} stroke="#5c5c5c" />
            {t.label !== undefined && (
              <text x={11} y={t.y + 3} fontSize="9" fill="#8c8c8c" fontFamily="Inter, system-ui" transform={`rotate(-90 11 ${t.y + 3})`}>
                {t.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="absolute left-0 top-0 size-5 bg-[#2c2c2c]" />
    </div>
  );
}

/* ---------- Buildable elements ---------- */

type BProps = {
  as?: ElementType;
  /** "type" types `text` out letter by letter; "box" fades the element in. */
  kind?: Kind;
  text?: string;
  /** Milliseconds per character when typing. */
  speed?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  id?: string;
} & Record<string, unknown>;

/** An element an agent cursor builds when it scrolls into view. */
export function B({ as: Tag = "div", kind = "box", text, speed = 30, className, style, children, ...rest }: BProps) {
  const ref = useRef<HTMLElement>(null);
  const ctx = useContext(BuildContext);
  const [typed, setTyped] = useState<number | null>(null); // null = show everything
  const done = useRef<(() => void) | null>(null);
  const typing = kind === "type" && !!text;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!ctx) {
      el.dataset.shown = "1";
      return;
    }
    return ctx.register({
      el,
      kind: typing ? "type" : "box",
      duration: typing ? text!.length * speed : 0,
      run: () =>
        new Promise<void>((resolve) => {
          el.dataset.shown = "1";
          if (!typing) {
            setTimeout(resolve, 260);
            return;
          }
          done.current = resolve;
          setTyped(0);
        }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typed === null || !text) return;
    if (typed >= text.length) {
      setTyped(null);
      done.current?.();
      done.current = null;
      return;
    }
    const step = speed < 12 ? 3 : 1;
    const t = setTimeout(() => setTyped((n) => (n === null ? null : n + step)), speed * step);
    return () => clearTimeout(t);
  }, [typed, text, speed]);

  return (
    <Tag ref={ref} data-b="" data-kind={typing ? "type" : "box"} className={className} style={typing ? { whiteSpace: "pre-line", ...style } : style} {...rest}>
      {typing ? (
        typed === null ? (
          text
        ) : (
          <>
            {text!.slice(0, typed)}
            <span className="lp-caret" />
            <span className="invisible">{text!.slice(typed)}</span>
          </>
        )
      ) : (
        children
      )}
    </Tag>
  );
}

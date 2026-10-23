"use client";

import { useCallback, useRef, useState } from "react";
import type { RunEvent, RunRequest } from "./schema";

export type RunStatus = "idle" | "running" | "done" | "error";

export interface LogLine {
  text: string;
  kind?: "search" | "fetch" | "think" | "done";
  at: number;
}

export interface RunState {
  status: RunStatus;
  logs: LogLine[];
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

const IDLE: RunState = { status: "idle", logs: [] };

// Tracks every phase run by key ("profile", "accounts:stylists", ...) and
// streams its progress lines from /api/run.
export function useRuns() {
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const inFlight = useRef(new Set<string>());

  const patch = (key: string, fn: (s: RunState) => RunState) =>
    setRuns((prev) => ({ ...prev, [key]: fn(prev[key] ?? IDLE) }));

  const run = useCallback(async <T,>(key: string, req: RunRequest | object, onResult: (data: T) => void, endpoint = "/api/run") => {
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setRuns((prev) => ({ ...prev, [key]: { status: "running", logs: [], startedAt: Date.now() } }));
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
      if (!res.ok || !res.body) {
        const msg = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(msg.error ?? "Request failed");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as RunEvent;
          if (ev.type === "log") patch(key, (s) => ({ ...s, logs: [...s.logs, { text: ev.text, kind: ev.kind, at: Date.now() }] }));
          else if (ev.type === "error") throw new Error(ev.message);
          else if (ev.type === "result") {
            finished = true;
            onResult(ev.data as T);
            patch(key, (s) => ({ ...s, status: "done", finishedAt: Date.now() }));
          }
        }
      }
      if (!finished) throw new Error("The connection closed early. Try again.");
    } catch (err) {
      patch(key, (s) => ({ ...s, status: "error", finishedAt: Date.now(), error: err instanceof Error ? err.message : "Something went wrong" }));
    } finally {
      inFlight.current.delete(key);
    }
  }, []);

  const get = useCallback((key: string) => runs[key] ?? IDLE, [runs]);
  const reset = useCallback(() => setRuns({}), []);
  return { run, get, reset, runs };
}

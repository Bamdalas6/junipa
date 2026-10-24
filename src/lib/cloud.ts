"use client";

import { listWorkspaces, loadWorkspace, type Workspace, type WorkspaceSummary } from "./store";

// Keeps the signed-in user's workspaces in their account (/api/workspaces), on top
// of the copy in this browser. The newer copy always wins.

const pending = new Map<string, { ws: Workspace; timer: ReturnType<typeof setTimeout> }>();

function put(ws: Workspace) {
  return fetch("/api/workspaces", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace: ws }), keepalive: true })
    .then((r) => r.ok)
    .catch(() => false);
}

/** Saves to the account shortly after the last change (research steps change the workspace often). */
export function pushWorkspace(changed: Workspace) {
  if (changed.demo) return;
  // Stamp the time of this change (like saveWorkspace does), so it beats older copies.
  const ws = { ...changed, updatedAt: Date.now() };
  const prev = pending.get(ws.domain);
  if (prev) clearTimeout(prev.timer);
  const timer = setTimeout(() => {
    pending.delete(ws.domain);
    put(ws);
  }, 1200);
  pending.set(ws.domain, { ws, timer });
}

/** Sends any changes still waiting, e.g. before signing out. */
export async function flushPushes() {
  const all = [...pending.values()];
  pending.clear();
  await Promise.all(all.map(({ ws, timer }) => (clearTimeout(timer), put(ws))));
}

export async function pullWorkspace(domain: string): Promise<Workspace | null> {
  try {
    const res = await fetch(`/api/workspaces?domain=${encodeURIComponent(domain)}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as Workspace | null) : null;
  } catch {
    return null;
  }
}

export async function listCloudWorkspaces(): Promise<WorkspaceSummary[]> {
  try {
    const res = await fetch("/api/workspaces", { cache: "no-store" });
    return res.ok ? ((await res.json()) as WorkspaceSummary[]) : [];
  } catch {
    return [];
  }
}

export function deleteCloudWorkspaces(domain?: string) {
  return fetch(`/api/workspaces?${domain ? `domain=${encodeURIComponent(domain)}` : "all=1"}`, { method: "DELETE" }).catch(() => undefined);
}

/** After signing in: copies research done in this browser before signing in into the account. */
export async function uploadLocalWorkspaces() {
  const local = listWorkspaces()
    .map((s) => loadWorkspace(s.domain))
    .filter((w): w is Workspace => !!w && !w.demo);
  await Promise.all(local.map(put));
}

/** The newer of two copies of the same workspace. */
export const newer = (a: Workspace | null, b: Workspace | null) => (!a ? b : !b ? a : (b.updatedAt ?? 0) > (a.updatedAt ?? 0) ? b : a);

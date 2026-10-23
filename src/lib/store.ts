"use client";

import type { Market } from "./geo";
import type { Account, Competitors, Contacts, Outreach, Profile, Segments } from "./schema";

// Workspaces live in the browser for now (one per website researched).
// Swap this module for a database when accounts and billing are added.

export interface Workspace {
  domain: string;
  industry: string;
  goal: string;
  createdAt: number;
  updatedAt: number;
  demo: boolean;
  /** Target market; undefined = Auto (the brand's home country). */
  market?: Market;
  profile?: Profile;
  competitors?: Competitors;
  segments?: Segments;
  selected: string[];
  accounts: Record<string, Account[]>;
  picked: Record<string, string[]>;
  contacts: Record<string, Contacts>;
  outreach: Record<string, Outreach>;
  contacted: Record<string, boolean>;
  /** Paid unlocks for decision makers + outreach, per campaign (segment id). */
  unlocks?: Record<string, { token: string; tier: string; at: number }>;
}

const KEY = (d: string) => `reachly:ws:${d}`;
const INDEX = "reachly:index";

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function newWorkspace(domain: string, industry: string, goal: string, demo: boolean, market?: Market): Workspace {
  const now = Date.now();
  return { domain, industry, goal, demo, market, createdAt: now, updatedAt: now, selected: [], accounts: {}, picked: {}, contacts: {}, outreach: {}, contacted: {} };
}

export function loadWorkspace(domain: string): Workspace | null {
  return safe(() => {
    const raw = localStorage.getItem(KEY(domain));
    return raw ? (JSON.parse(raw) as Workspace) : null;
  }, null);
}

export function saveWorkspace(ws: Workspace) {
  safe(() => {
    localStorage.setItem(KEY(ws.domain), JSON.stringify({ ...ws, updatedAt: Date.now() }));
    const index = listWorkspaces().filter((w) => w.domain !== ws.domain);
    index.unshift({ domain: ws.domain, industry: ws.industry, name: ws.profile?.name ?? ws.domain, updatedAt: Date.now() });
    localStorage.setItem(INDEX, JSON.stringify(index.slice(0, 30)));
  }, undefined);
}

export function deleteWorkspace(domain: string) {
  safe(() => {
    localStorage.removeItem(KEY(domain));
    localStorage.setItem(INDEX, JSON.stringify(listWorkspaces().filter((w) => w.domain !== domain)));
  }, undefined);
}

/** Removes every saved workspace from this browser. */
export function clearAllWorkspaces() {
  safe(() => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("reachly:"))
      .forEach((k) => localStorage.removeItem(k));
  }, undefined);
}

export interface WorkspaceSummary {
  domain: string;
  industry: string;
  name: string;
  updatedAt: number;
}

export function listWorkspaces(): WorkspaceSummary[] {
  return safe(() => JSON.parse(localStorage.getItem(INDEX) ?? "[]") as WorkspaceSummary[], []);
}

export function cleanDomain(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#\s]/)[0];
}

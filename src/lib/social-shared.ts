// Social platforms, handle parsing and profile URLs. Safe to use on client and server.

export type Platform = "instagram" | "tiktok" | "x" | "youtube" | "linkedin" | "facebook";

export const PLATFORMS: { id: Platform; label: string; example: string; publicStats: boolean }[] = [
  { id: "instagram", label: "Instagram", example: "@yourbrand", publicStats: false },
  { id: "tiktok", label: "TikTok", example: "@yourbrand", publicStats: false },
  { id: "x", label: "X (Twitter)", example: "@yourbrand", publicStats: false },
  { id: "youtube", label: "YouTube", example: "@yourbrand", publicStats: true },
  { id: "linkedin", label: "LinkedIn", example: "company/yourbrand", publicStats: true },
  { id: "facebook", label: "Facebook", example: "yourbrand", publicStats: false },
];

export const isPlatform = (p: unknown): p is Platform => PLATFORMS.some((x) => x.id === p);

const HOSTS: [RegExp, Platform][] = [
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(x|twitter)\.com$/, "x"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
  [/(^|\.)(facebook|fb)\.com$/, "facebook"],
];

/** Accepts "@brand", "brand", or a full profile link. Returns a clean handle (and platform if a link said so). */
export function parseHandle(input: string, fallback?: Platform): { platform?: Platform; handle: string } | null {
  const raw = input.trim();
  if (!raw) return null;
  let platform = fallback;
  let handle = raw;
  if (/^(https?:\/\/)?([a-z0-9-]+\.)*(instagram|tiktok|x|twitter|youtube|youtu|linkedin|facebook|fb)\.(com|be)\//i.test(raw)) {
    try {
      const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
      const host = url.hostname.toLowerCase();
      platform = HOSTS.find(([re]) => re.test(host))?.[1] ?? platform;
      const parts = url.pathname.split("/").filter(Boolean);
      if (platform === "linkedin") handle = parts[0] === "company" || parts[0] === "in" ? `${parts[0]}/${parts[1] ?? ""}` : parts[0] ?? "";
      else handle = parts[0] ?? "";
    } catch {
      return null;
    }
  }
  handle = handle.replace(/^@/, "").replace(/\/+$/, "");
  const ok = platform === "linkedin" ? /^((company|in)\/)?[A-Za-z0-9._-]{1,80}$/.test(handle) : /^@?[A-Za-z0-9._-]{1,60}$/.test(handle);
  return ok ? { platform, handle: handle.replace(/^@/, "") } : null;
}

export function profileUrl(platform: Platform, handle: string) {
  switch (platform) {
    case "instagram":
      return `https://www.instagram.com/${handle}/`;
    case "tiktok":
      return `https://www.tiktok.com/@${handle}`;
    case "x":
      return `https://x.com/${handle}`;
    case "youtube":
      return `https://www.youtube.com/@${handle}`;
    case "linkedin":
      return `https://www.linkedin.com/${handle.includes("/") ? handle : `company/${handle}`}/`;
    case "facebook":
      return `https://www.facebook.com/${handle}`;
  }
}

/** Picks platform + handle out of profile links, e.g. the socials found in a brand profile. */
export function handlesFromUrls(urls: string[]) {
  const out: Partial<Record<Platform, string>> = {};
  for (const u of urls) {
    const r = parseHandle(u);
    if (r?.platform && !out[r.platform]) out[r.platform] = r.handle;
  }
  return out;
}

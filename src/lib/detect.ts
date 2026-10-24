import dns from "node:dns";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { Agent, fetch } from "undici";

// Guesses a business's industry from its homepage, with no AI call:
// fetch the page safely, pull out title/meta/text, and score keyword lists.

export interface Detection {
  industry: string;
  confidence: number; // 0-1
  name: string;
  description: string;
  matched: string[];
  readSite: boolean;
  /** Best guess of where the business is based (ISO code), plus state/region if the site names one. */
  country?: string;
  region?: string;
}

const KEYWORDS: Record<string, string[]> = {
  fashion: [
    "fashion", "clothing", "apparel", "wear", "dress", "dresses", "couture", "boutique", "ready-to-wear", "ready to wear", "menswear",
    "womenswear", "ankara", "aso ebi", "aso-ebi", "streetwear", "tailoring", "bespoke", "outfit", "outfits", "lookbook", "garment",
    "kaftan", "agbada", "collection", "shirts", "trousers", "skirts", "jackets", "sneakers", "handbags", "jewelry", "jewellery", "fabric", "made to measure",
  ],
  beauty: [
    "beauty", "skincare", "skin care", "cosmetics", "makeup", "make-up", "lipstick", "salon", "spa", "hair", "wigs", "nails", "serum",
    "fragrance", "perfume", "lashes", "brows", "moisturiser", "moisturizer", "glow",
  ],
  food: [
    "restaurant", "food", "kitchen", "catering", "menu", "chef", "bakery", "cakes", "meals", "jollof", "cafe", "café", "drinks", "recipes",
    "pastries", "small chops", "delivery", "dining", "grill", "pizza", "burger", "snacks",
  ],
  agency: [
    "agency", "branding", "brand identity", "design studio", "creative studio", "marketing agency", "motion graphics", "web design",
    "advertising", "campaigns", "social media management", "production", "portfolio", "case studies", "ui/ux", "creative direction",
  ],
  realestate: [
    "real estate", "property", "properties", "apartments", "homes for sale", "for rent", "lease", "realtor", "estate", "land", "duplex",
    "mortgage", "listings", "bedroom", "terrace", "plots",
  ],
  saas: [
    "software", "platform", "saas", "api", "dashboard", "integrations", "developers", "automation", "cloud", "workflow", "sign up free",
    "start free trial", "free trial", "per seat", "per user", "app store", "sdk",
  ],
  sales: [
    "consulting", "consultancy", "b2b", "lead generation", "sales", "outsourcing", "business services", "solutions", "enterprise",
    "recruitment", "accounting", "logistics", "advisory", "pipeline", "partners", "clients",
  ],
};

// Words that hint at an industry inside the domain name itself.
const DOMAIN_HINTS: Record<string, string[]> = {
  fashion: ["wear", "fashion", "couture", "clothing", "apparel", "boutique", "atelier", "threads", "closet", "luxury", "style"],
  beauty: ["beauty", "skin", "glow", "cosmetic", "salon", "spa", "hair", "lash", "nails"],
  food: ["food", "kitchen", "eats", "cafe", "bakery", "grill", "chops", "jollof", "rice"],
  agency: ["studio", "agency", "creative", "design", "media", "digital"],
  realestate: ["realty", "homes", "property", "estate", "properties", "living"],
  saas: ["app", "hq", "labs", "cloud", "soft", "tech", "ai"],
  sales: ["consult", "partners", "solutions", "group", "advisory"],
};

export async function detectIndustry(domain: string): Promise<Detection> {
  let html = "";
  try {
    html = await readHomepage(`https://${domain}`);
  } catch {
    try {
      html = await readHomepage(`http://${domain}`);
    } catch {
      html = "";
    }
  }

  const title = pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const meta = (name: string) =>
    pick(html, new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i")) ||
    pick(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, "i"));
  const description = meta("description") || meta("og:description");
  const siteName = meta("og:site_name");
  const keywords = meta("keywords");
  const body = decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .slice(0, 8000)
    .toLowerCase();
  const head = `${title} ${description} ${siteName} ${keywords}`.toLowerCase();

  const scores: Record<string, number> = {};
  const matched: Record<string, Set<string>> = {};
  for (const [ind, words] of Object.entries(KEYWORDS)) {
    scores[ind] = 0;
    matched[ind] = new Set();
    for (const w of words) {
      const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}\\b`, "g");
      const inHead = (head.match(re) ?? []).length;
      const inBody = Math.min(4, (body.match(re) ?? []).length);
      if (inHead || inBody) matched[ind].add(w);
      scores[ind] += inHead * 3 + inBody;
    }
  }

  const label = domain.split(".")[0].toLowerCase();
  for (const [ind, hints] of Object.entries(DOMAIN_HINTS)) {
    for (const h of hints) if (label.includes(h)) scores[ind] += 4;
  }
  if (/\.(io|ai|dev|app)$/.test(domain)) scores.saas += 3;
  if (/cdn\.shopify\.com|woocommerce|add to cart|add-to-cart/i.test(html)) {
    // Online stores: most likely consumer products, so nudge fashion and beauty.
    scores.fashion += 2;
    scores.beauty += 1;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [best, bestScore] = ranked[0];
  const second = ranked[1]?.[1] ?? 0;
  const total = ranked.reduce((n, [, v]) => n + v, 0) || 1;
  const industry = bestScore >= 3 ? best : "other";
  const confidence = industry === "other" ? 0 : Math.min(0.97, 0.35 + (bestScore - second) / total + Math.min(bestScore, 20) / 60);

  const { country, region } = detectLocation(domain, html, body);

  return {
    country,
    region,
    industry,
    confidence: Math.round(confidence * 100) / 100,
    name: cleanName(siteName || title.split(/[|–—:·-]/)[0] || "", domain),
    description: decode(description).slice(0, 180),
    matched: industry === "other" ? [] : [...matched[industry]].slice(0, 4),
    readSite: html.length > 0,
  };
}

/* ---------- Location: domain ending, currency, phone code, then city names ---------- */

const TLD_COUNTRY: Record<string, string> = {
  ng: "NG", gh: "GH", ke: "KE", za: "ZA", uk: "GB", ca: "CA", au: "AU", in: "IN", ae: "AE", ie: "IE", fr: "FR", de: "DE", it: "IT", es: "ES", nl: "NL",
  ug: "UG", tz: "TZ", rw: "RW", eg: "EG", ma: "MA", sn: "SN", ci: "CI", cm: "CM", br: "BR", mx: "MX", jp: "JP", sg: "SG", nz: "NZ", pt: "PT", be: "BE",
  ch: "CH", se: "SE", dk: "DK", no: "NO", pl: "PL", us: "US",
};

// Weak signal: many shops show prices in the visitor's currency.
const MONEY: [RegExp, string][] = [
  [/₦|"currency":"NGN"|\bNGN\b|\bnaira\b/gi, "NG"],
  [/GH₵|"currency":"GHS"|\bGHS\b|\bcedis?\b/gi, "GH"],
  [/\bKSh\b|"currency":"KES"|\bKES\b/gi, "KE"],
  [/"currency":"ZAR"|\bZAR\b/gi, "ZA"],
  [/£|"currency":"GBP"|\bGBP\b/gi, "GB"],
  [/"currency":"AED"|\bAED\b|\bdirhams?\b/gi, "AE"],
  [/"currency":"CAD"|\bCAD\b/gi, "CA"],
  [/"currency":"AUD"|\bAUD\b/gi, "AU"],
  [/₹|"currency":"INR"|\bINR\b/gi, "IN"],
];

// Strong signal: a local phone number in the page text (contact details).
const PHONES: Record<string, RegExp> = {
  NG: /\+234[\s-]?\d/g,
  GH: /\+233[\s-]?\d/g,
  KE: /\+254[\s-]?\d/g,
  ZA: /\+27[\s-]?\d{2}/g,
  GB: /\+44[\s-]?\d{2}/g,
  AE: /\+971[\s-]?\d/g,
  IN: /\+91[\s-]?\d{2}/g,
};

// City or area names that point to a state/region. Ambiguous words (e.g. "Delta", "Central") are left out on purpose.
const PLACES: Record<string, [RegExp, string][]> = {
  NG: [
    [/\b(lagos|lekki|ikoyi|victoria island|ikeja|yaba|surulere|ajah)\b/gi, "Lagos"],
    [/\b(abuja|wuse|maitama|garki)\b/gi, "FCT (Abuja)"],
    [/\b(port harcourt)\b/gi, "Rivers"],
    [/\b(ibadan)\b/gi, "Oyo"],
    [/\b(abeokuta)\b/gi, "Ogun"],
    [/\b(benin city)\b/gi, "Edo"],
    [/\b(enugu)\b/gi, "Enugu"],
    [/\b(kano)\b/gi, "Kano"],
    [/\b(kaduna)\b/gi, "Kaduna"],
    [/\b(calabar)\b/gi, "Cross River"],
    [/\b(uyo)\b/gi, "Akwa Ibom"],
    [/\b(owerri)\b/gi, "Imo"],
    [/\b(onitsha|awka)\b/gi, "Anambra"],
  ],
  GH: [
    [/\b(accra|east legon|osu|tema)\b/gi, "Greater Accra"],
    [/\b(kumasi)\b/gi, "Ashanti"],
    [/\b(takoradi)\b/gi, "Western"],
  ],
  KE: [
    [/\b(nairobi|westlands|kilimani)\b/gi, "Nairobi"],
    [/\b(mombasa)\b/gi, "Mombasa"],
    [/\b(kisumu)\b/gi, "Kisumu"],
    [/\b(nakuru)\b/gi, "Nakuru"],
  ],
  ZA: [
    [/\b(johannesburg|sandton|pretoria|soweto)\b/gi, "Gauteng"],
    [/\b(cape town|stellenbosch)\b/gi, "Western Cape"],
    [/\b(durban)\b/gi, "KwaZulu-Natal"],
  ],
  GB: [
    [/\b(london)\b/gi, "Greater London"],
    [/\b(edinburgh|glasgow)\b/gi, "Scotland"],
    [/\b(cardiff)\b/gi, "Wales"],
    [/\b(belfast)\b/gi, "Northern Ireland"],
    [/\b(manchester|birmingham|leeds|liverpool|bristol)\b/gi, "England"],
  ],
  AE: [
    [/\b(dubai)\b/gi, "Dubai"],
    [/\b(abu dhabi)\b/gi, "Abu Dhabi"],
    [/\b(sharjah)\b/gi, "Sharjah"],
  ],
};

// The country named in the site's own words.
const COUNTRY_WORDS: Record<string, RegExp> = {
  NG: /\b(nigeria|nigerian)\b/gi,
  GH: /\b(ghana|ghanaian)\b/gi,
  KE: /\b(kenya|kenyan)\b/gi,
  ZA: /\b(south africa|south african)\b/gi,
  GB: /\b(united kingdom|british)\b/gi,
  AE: /\b(united arab emirates|emirati)\b/gi,
  CA: /\b(canada|canadian)\b/gi,
  AU: /\b(australia|australian)\b/gi,
  IN: /\b(india|indian)\b/gi,
  US: /\b(united states|usa)\b/gi,
};

function detectLocation(domain: string, html: string, text: string): { country?: string; region?: string } {
  // Shops often show prices in the *visitor's* currency, so currency is only a tie-breaker.
  // Domain ending, phone codes, city names and the country named in visible text count more.
  // Country pickers (<select>) list every country, so they're removed before counting words.
  const visible = html
    ? decode(
        html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<select[\s\S]*?<\/select>/gi, " ")
          .replace(/<[^>]+>/g, " "),
      ).slice(0, 20000)
    : text;
  const score: Record<string, number> = {};
  const add = (c: string, n: number) => (score[c] = (score[c] ?? 0) + n);

  const parts = domain.split(".");
  const tldCountry = TLD_COUNTRY[parts[parts.length - 1]];
  if (tldCountry) add(tldCountry, 6);
  for (const [c, re] of Object.entries(COUNTRY_WORDS)) add(c, Math.min(2, (visible.match(re) ?? []).length) * 1.5);
  for (const [c, re] of Object.entries(PHONES)) if ((visible.match(re) ?? []).length > 0) add(c, 4);
  for (const [c, places] of Object.entries(PLACES)) {
    const hits = places.reduce((n, [re]) => n + (visible.match(re) ?? []).length, 0);
    if (hits >= 2) add(c, 3);
  }
  let topCurrency = "";
  let best = 0;
  for (const [re, code] of MONEY) {
    const hits = (html.match(re) ?? []).length;
    if (hits > best) {
      best = hits;
      topCurrency = code;
    }
  }
  if (topCurrency) add(topCurrency, 1);

  // Only commit to a country on strong, unambiguous evidence; otherwise the
  // workspace uses the country Scout finds when it reads the brand (step 1).
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
  const [winner, points] = ranked[0] ?? [];
  const runnerUp = ranked[1]?.[1] ?? 0;
  const country = points && points >= 4 && points - runnerUp >= 2 ? winner : undefined;
  text = visible;
  let region: string | undefined;
  if (country && PLACES[country] && text) {
    let best = 0;
    for (const [re, name] of PLACES[country]) {
      const hits = (text.match(re) ?? []).length;
      if (hits > best) {
        best = hits;
        region = name;
      }
    }
  }
  return { country, region };
}

/* ---------- Public social profiles ---------- */

/** Reads what a public profile page shows to a logged-out visitor. Instagram and TikTok usually show nothing. */
export async function readPublicProfile(url: string): Promise<{ readable: boolean; name?: string; bio?: string; followers?: string }> {
  try {
    const html = await readHomepage(url, 0, { browserLike: true, maxBytes: 1_600_000 });
    const meta = (name: string) =>
      pick(html, new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i")) ||
      pick(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, "i"));
    const description = meta("og:description") || meta("description");
    const title = meta("og:title") || pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const count = html.match(/([\d.,]+\s?[KkMm]?)\s+(followers|subscribers)/i);
    const readable = Boolean(description || count);
    return {
      readable,
      name: title ? title.replace(/\s*[|(-].*$/, "").trim().slice(0, 60) || undefined : undefined,
      bio: description ? description.slice(0, 280) : undefined,
      followers: count ? `${count[1].trim()} ${count[2].toLowerCase()}` : undefined,
    };
  } catch {
    return { readable: false };
  }
}

function pick(html: string, re: RegExp) {
  return decode(html.match(re)?.[1] ?? "").trim();
}

function decode(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function cleanName(raw: string, domain: string) {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name && name.length <= 40 && !/^home$/i.test(name)) return name;
  const base = domain.split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/* ---------- Reading company sites, to check what research names ---------- */

export interface SitePage {
  /** ok: page read. blocked: the site answers but won't show a bot the page. dead: no website there. */
  status: "ok" | "blocked" | "dead";
  url: string;
  title: string;
  description: string;
  /** Visible text, trimmed. */
  text: string;
  /** For sale, parked, or a holding page rather than a working business. */
  parked: boolean;
  placeholder: boolean;
  /** Same-site links that usually list the people behind a business. */
  teamLinks: string[];
  country?: string;
}

const PARKED = /domain (name )?(is |may be )?for sale|buy this domain|this domain (is|may be) (for sale|available)|parked (free|domain)|domain parking|hugedomains|sedoparking|afternic|dan\.com\/|is available for purchase|get this domain/i;
const PLACEHOLDER = /coming soon|under construction|opening soon|launching soon|enter (the )?store using password|password protected|be right back|website is (currently )?(under maintenance|unavailable)|account (has been )?suspended|site not found/i;
const TEAM_LINK = /\b(about|team|people|founders?|leadership|our-story|story|who-we-are|company|management|meet)\b/i;

function hostOf(site: string) {
  return site.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0].toLowerCase();
}

function visibleText(html: string) {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Reads a site's homepage so research can be checked against what is really there. */
export async function readSite(site: string, opts: { maxText?: number } = {}): Promise<SitePage> {
  const host = hostOf(site);
  const empty: SitePage = { status: "dead", url: host ? `https://${host}` : "", title: "", description: "", text: "", parked: false, placeholder: false, teamLinks: [] };
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || host.endsWith(".example")) return empty;
  let page: { html: string; url: string };
  try {
    page = await fetchHtml(`https://${host}`, 0, { browserLike: true, maxBytes: 600_000 });
  } catch (e) {
    const status = Number((e as { status?: unknown }).status) || 0;
    // Bot walls (Cloudflare etc.) mean a real site we just can't read.
    if ([401, 403, 405, 429, 503].includes(status)) return { ...empty, status: "blocked" };
    try {
      page = await fetchHtml(`http://${host}`, 0, { browserLike: true, maxBytes: 600_000 });
    } catch {
      return empty;
    }
  }
  const { html, url } = page;
  const meta = (name: string) =>
    pick(html, new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i")) ||
    pick(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, "i"));
  const title = [pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i), meta("og:site_name")].filter(Boolean).join(" | ").replace(/\s+/g, " ");
  const description = meta("description") || meta("og:description");
  const full = visibleText(html);
  const head = `${title} ${description} ${full.slice(0, 3000)}`;
  const base = new URL(url);
  const teamLinks = [
    ...new Set(
      [...html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)]
        .map((m) => {
          try {
            const u = new URL(decode(m[1]).trim(), base);
            return hostOf(u.hostname) === hostOf(base.hostname) && /^https?:$/.test(u.protocol) && TEAM_LINK.test(u.pathname) ? `${u.origin}${u.pathname}` : "";
          } catch {
            return "";
          }
        })
        .filter(Boolean),
    ),
  ].slice(0, 4);
  return {
    status: "ok",
    url,
    title: title.slice(0, 160),
    description: decode(description).slice(0, 300),
    text: full.slice(0, opts.maxText ?? 2500),
    parked: PARKED.test(head) && full.length < 4000,
    placeholder: PLACEHOLDER.test(head) && full.length < 1500,
    teamLinks,
    country: detectLocation(hostOf(base.hostname), html, full.slice(0, 8000).toLowerCase()).country,
  };
}

/** Visible text of one public page, or "" if it can't be read. */
export async function readPageText(url: string, maxText = 6000): Promise<string> {
  try {
    return visibleText((await fetchHtml(url, 0, { browserLike: true, maxBytes: 600_000 })).html).slice(0, maxText);
  } catch {
    return "";
  }
}

const GENERIC = new Set(["the", "and", "of", "co", "company", "inc", "ltd", "llc", "limited", "plc", "gmbh", "group", "official", "shop", "store", "online", "hq", "app", "io"]);
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ");

/** Whether a page is plausibly the named company's: its lead or most distinctive name word appears there, or the name is the domain. */
export function namesCompany(page: SitePage, name: string) {
  // "Lydia (Sumeria)" or "Glovo / Glovo Nigeria": judge by the main name.
  const main = name.replace(/\(.*?\)/g, " ").split(/\s[/|–—-]\s|\//)[0];
  const words = fold(main).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !GENERIC.has(w));
  if (!words.length) return true;
  const hay = fold(`${page.title} ${page.description} ${page.text} ${hostOf(page.url)}`);
  const host = hostOf(page.url).replace(/[^a-z0-9]/g, "");
  if (host.includes(words.join(""))) return true;
  const longest = [...words].sort((a, b) => b.length - a.length)[0];
  return hay.includes(words[0]) || hay.includes(longest);
}

const countryName = new Intl.DisplayNames(["en"], { type: "region" });

/** Whether text names a country (its name, demonym or a main city or region in it). */
export function mentionsCountry(text: string, code: string) {
  const name = countryName.of(code)?.toLowerCase();
  const t = fold(text);
  if (name && name !== code.toLowerCase() && t.includes(name)) return true;
  const res = [COUNTRY_WORDS[code], ...(PLACES[code] ?? []).map(([re]) => re)].filter(Boolean);
  return res.some((re) => new RegExp(re.source, "i").test(t));
}

/** Whether a person's name appears in a page's text (first and last name, accents ignored). */
export function namesPerson(text: string, person: string) {
  const parts = fold(person).replace(/[^a-z\- ]/g, " ").split(/\s+/).filter((w) => w.length > 1);
  if (parts.length < 2) return false;
  const hay = fold(text);
  return hay.includes(parts[0]) && hay.includes(parts[parts.length - 1]);
}

/* ---------- Safe fetch: public hosts only, small bodies, few redirects ---------- */

// Loopback, private, link-local (incl. cloud metadata), carrier-grade NAT, test, multicast and reserved ranges.
// Separate lists: an IPv6 rule like ::ffff:0:0/96 would otherwise match every IPv4 address.
const BLOCKED_V4 = new net.BlockList();
for (const [range, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const)
  BLOCKED_V4.addSubnet(range, prefix, "ipv4");
const BLOCKED_V6 = new net.BlockList();
for (const [range, prefix] of [["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8]] as const)
  BLOCKED_V6.addSubnet(range, prefix, "ipv6");

function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return BLOCKED_V4.check(ip, "ipv4");
  if (family !== 6) return true;
  // ::1, ::, and IPv4-mapped/compatible forms (::ffff:a.b.c.d) all start with "::"; real public IPv6 never does.
  if (ip.startsWith("::")) return true;
  return BLOCKED_V6.check(ip, "ipv6");
}

async function assertPublic(hostname: string) {
  if (net.isIP(hostname.replace(/^\[|\]$/g, ""))) throw new Error("IP addresses are not allowed");
  const addrs = await lookup(hostname, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) throw new Error("Host is not public");
}

// Every connection re-checks the address it actually connects to, so a domain
// can't pass the check above and then switch its DNS to an internal address.
const publicOnly = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      dns.lookup(hostname, { all: true }, (err, addrs) => {
        if (err) return callback(err, "", 0);
        if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) return callback(new Error("Host is not public"), "", 0);
        if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, addrs);
        callback(null, addrs[0].address, addrs[0].family);
      });
    },
  },
});

/** Only plain web URLs on the standard ports. */
function safeTarget(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Bad protocol");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("Port not allowed");
  if (url.username || url.password) throw new Error("Credentials not allowed");
}

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

async function readHomepage(url: string, hops = 0, opts: { browserLike?: boolean; maxBytes?: number } = {}): Promise<string> {
  return (await fetchHtml(url, hops, opts)).html;
}

/** Like readHomepage, but also returns the final URL after redirects. Errors carry the HTTP status. */
async function fetchHtml(url: string, hops = 0, opts: { browserLike?: boolean; maxBytes?: number } = {}): Promise<{ html: string; url: string }> {
  const u = new URL(url);
  safeTarget(u);
  await assertPublic(u.hostname);
  const res = await fetch(u, {
    dispatcher: publicOnly,
    redirect: "manual",
    signal: AbortSignal.timeout(6000),
    headers: opts.browserLike
      ? { "user-agent": BROWSER_UA, accept: "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.9" }
      : { "user-agent": "Mozilla/5.0 (compatible; JuniaBot/0.1)", accept: "text/html,application/xhtml+xml" },
  });
  const location = res.headers.get("location");
  if (res.status >= 300 && res.status < 400 && location) {
    res.body?.cancel().catch(() => {});
    if (hops >= 4) throw new Error("Too many redirects");
    return fetchHtml(new URL(location, u).toString(), hops + 1, opts);
  }
  if (!res.ok || !res.body) {
    res.body?.cancel().catch(() => {});
    throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  }
  if (!(res.headers.get("content-type") ?? "").includes("html")) {
    res.body.cancel().catch(() => {});
    throw new Error("Not HTML");
  }

  // Read at most ~400 KB.
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < (opts.maxBytes ?? 400_000)) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return { html: new TextDecoder().decode(Buffer.concat(chunks)), url: u.toString() };
}

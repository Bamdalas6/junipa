import { z } from "zod";

// One schema per research phase. The engine asks Claude to fill these, and the
// UI renders them. Keep them flat: structured outputs reject recursive schemas.

export const Channel = z.enum(["email", "instagram", "whatsapp", "linkedin", "tiktok", "phone"]);
export type Channel = z.infer<typeof Channel>;

export const ProfileSchema = z.object({
  name: z.string().describe("Brand or company name"),
  oneLiner: z.string().describe("What they sell, to whom, in under 20 words"),
  description: z.string().describe("2-3 sentence plain-English summary"),
  category: z.string().describe("Short category label, e.g. 'Womenswear label' or 'B2B sales agency'"),
  country: z.string().describe("Country name where the business is based, or 'Unknown'"),
  countryCode: z.string().describe("ISO 3166-1 alpha-2 code, or empty string"),
  priceTier: z.enum(["budget", "mid", "premium", "luxury", "unknown"]),
  offerings: z.array(z.string()).describe("Main products or services, 3-8 items"),
  channels: z.array(z.string()).describe("Where they sell or show up today: own store, Instagram, Shopify, marketplaces, retail..."),
  socials: z.array(z.object({ platform: z.string(), url: z.string() })),
  keywords: z.array(z.string()).describe("6-10 search keywords buyers would use"),
  strengths: z.array(z.string()).describe("2-4 things that make them sellable"),
  gaps: z.array(z.string()).describe("2-4 growth gaps or opportunities spotted"),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const CompetitorsSchema = z.object({
  summary: z.string().describe("One or two sentences on the competitive landscape"),
  whitespace: z.string().describe("The opening this brand can own, one sentence"),
  competitors: z.array(
    z.object({
      name: z.string(),
      domain: z.string().describe("Bare domain like brand.com, no protocol"),
      location: z.string(),
      positioning: z.string().describe("How they position themselves, one line"),
      overlap: z.string().describe("Why they compete with this brand, one line"),
      priceTier: z.enum(["budget", "mid", "premium", "luxury", "unknown"]),
      threat: z.enum(["high", "medium", "low"]),
    }),
  ),
});
type CompetitorsRaw = z.infer<typeof CompetitorsSchema>;
/** `verified` is set after research: the competitor's website answered when we checked it. */
export type Competitors = Omit<CompetitorsRaw, "competitors"> & { competitors: (CompetitorsRaw["competitors"][number] & { verified?: boolean })[] };

export const SegmentsSchema = z.object({
  segments: z.array(
    z.object({
      id: z.string().describe("kebab-case id"),
      name: z.string().describe("Who they are, 1-4 words, plural"),
      emoji: z.string().describe("One emoji that represents the segment"),
      estimatedAccounts: z.string().describe("Rough count of reachable accounts in the target market, e.g. '1.2K'"),
      job: z.string().describe("What they are trying to get done, one line"),
      pain: z.string().describe("The pain this brand solves for them, one line"),
      angle: z.string().describe("The hook to open the conversation with, one line"),
      bestChannel: Channel,
      fit: z.enum(["strong", "good", "experimental"]),
    }),
  ),
});
export type Segments = z.infer<typeof SegmentsSchema>;
export type Segment = Segments["segments"][number];

export const AccountsSchema = z.object({
  accounts: z.array(
    z.object({
      name: z.string(),
      website: z.string().describe("Bare domain or full URL, or empty string if none found"),
      instagram: z.string().describe("Instagram handle without @, or empty string"),
      location: z.string(),
      size: z.string().describe("Rough size, e.g. '1 store', '10-50 staff', '40K followers'"),
      why: z.string().describe("Why they fit this segment, one line"),
      signal: z.string().describe("A recent, specific reason to reach out now, or empty string"),
      source: z.string().describe("URL where this account was found"),
    }),
  ),
});
export type Accounts = z.infer<typeof AccountsSchema>;
export type Account = Accounts["accounts"][number] & { verified?: boolean };

export const ContactsSchema = z.object({
  contacts: z.array(
    z.object({
      account: z.string().describe("Exact account name this person belongs to"),
      name: z.string(),
      role: z.string(),
      linkedin: z.string().describe("Public LinkedIn URL, or empty string"),
      email: z.string().describe("Email only if published publicly by the business, else empty string"),
      source: z.string().describe("Public URL that shows this person in this role"),
    }),
  ),
  rolesToTarget: z.array(z.string()).describe("Job titles that usually decide on this purchase"),
});
export type Contact = z.infer<typeof ContactsSchema>["contacts"][number] & { emailStatus?: "published" | "verified" | "unverified" | "none" };
export type Contacts = { contacts: Contact[]; rolesToTarget: string[] };

export const OutreachSchema = z.object({
  steps: z.array(
    z.object({
      day: z.number().describe("Days after the first touch, starting at 0"),
      channel: Channel,
      subject: z.string().describe("Email subject, or empty string for non-email"),
      body: z.string().describe("Message body using {{first_name}} and {{company}} placeholders"),
      goal: z.string().describe("What this touch is for, a few words"),
    }),
  ),
  tips: z.array(z.string()).describe("2-3 short practical tips for running this sequence"),
});
export type Outreach = z.infer<typeof OutreachSchema>;

import type { Market } from "./geo";

export type PhaseId = "profile" | "competitors" | "segments" | "accounts" | "contacts" | "outreach";

export type RunEvent =
  | { type: "log"; text: string; kind?: "search" | "fetch" | "think" | "done" }
  | { type: "result"; data: unknown }
  | { type: "error"; message: string };

export interface RunRequest {
  phase: PhaseId;
  /** Use sample data even when live research is available. */
  demo?: boolean;
  /** Where to look for competitors and customers. Missing = the brand's home country. */
  market?: Market;
  /** Signed unlock token for the paid steps of this campaign. */
  unlock?: string;
  /** Set by the server from the unlock tier; never trusted from the client. */
  limits?: { accounts: number; people: number; verifiedEmails: boolean };
  domain: string;
  industry: string;
  goal?: string;
  profile?: Profile;
  competitors?: Competitors;
  segment?: Segment;
  accounts?: Account[];
}

/* ---------- Social growth ---------- */

export const SocialPlatform = z.enum(["instagram", "tiktok", "x", "youtube", "linkedin", "facebook"]);

export const SocialPlanSchema = z.object({
  summary: z.string().describe("2-3 sentences: where the accounts stand and the single biggest opportunity"),
  audits: z.array(
    z.object({
      platform: SocialPlatform,
      handle: z.string(),
      score: z.number().describe("0-100 account health, judged only from the information given"),
      verdict: z.string().describe("One line"),
      strengths: z.array(z.string()),
      fixes: z.array(z.string()).describe("Most impactful first, 3-5 items"),
      bio: z.string().describe("A rewritten bio that fits the platform's length limit"),
    }),
  ),
  pillars: z.array(
    z.object({
      name: z.string(),
      why: z.string().describe("Why this content works for this audience, one line"),
      ideas: z.array(z.string()).describe("3 specific post or video ideas"),
    }),
  ),
  cadence: z.array(
    z.object({
      platform: SocialPlatform,
      perWeek: z.string().describe("e.g. '4 Reels + 3 Stories daily'"),
      formats: z.array(z.string()),
      bestTimes: z.string().describe("Local times for the target market, e.g. 'Tue-Thu 7-9pm WAT'"),
    }),
  ),
  hooks: z.array(z.string()).describe("10 opening lines for videos or captions"),
  hashtags: z.array(z.string()).describe("15-25 hashtags or search keywords for the niche and market"),
  collabs: z.array(z.object({ who: z.string(), idea: z.string() })).describe("4-6 collaboration ideas"),
  plan: z.array(z.object({ week: z.number(), focus: z.string(), tasks: z.array(z.string()) })).describe("A 4-week plan"),
  kpis: z.array(z.object({ metric: z.string(), target: z.string() })).describe("4-6 metrics with realistic 30-day targets"),
});
export type SocialPlan = z.infer<typeof SocialPlanSchema>;

export interface SocialHandleInput {
  platform: z.infer<typeof SocialPlatform>;
  handle: string;
  followers?: string;
  postsPerWeek?: string;
}

export interface SocialRequest {
  handles: SocialHandleInput[];
  industry: string;
  market?: Market;
  goal?: string;
  brand?: string;
  about?: string;
  demo?: boolean;
}

export interface ProfileRead {
  platform: z.infer<typeof SocialPlatform>;
  handle: string;
  url: string;
  readable: boolean;
  name?: string;
  bio?: string;
  followers?: string;
}

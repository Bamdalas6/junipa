import { ScoutError } from "./guard";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { describeMarket } from "./geo";
import { getIndustry } from "./industries";
import {
  AccountsSchema,
  CompetitorsSchema,
  ContactsSchema,
  OutreachSchema,
  ProfileSchema,
  SegmentsSchema,
  type Contact,
  type RunEvent,
  type RunRequest,
} from "./schema";

const MODEL = process.env.REACHLY_MODEL || "claude-opus-5-5";
// Server-side fallback: if the model declines, the API re-runs on a suitable model.
const BETAS = ["server-side-fallback-2026-07-01"];

type Emit = (e: RunEvent) => void;

export function isClaude() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function isGemini() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** Which engine runs live research: Gemini when its key is set, else Claude. */
export function provider(): "gemini" | "claude" | null {
  return isGemini() ? "gemini" : isClaude() ? "claude" : null;
}

export function isLive() {
  return provider() !== null;
}

export const RESEARCHER = `You are Junipa's go-to-market researcher. You research real businesses on the public web so a small team can find customers.
Rules:
- Use web search and web fetch to check facts. Prefer the company's own site, its social profiles, directories, press and marketplaces.
- Only report companies and people you actually found on a public page, with the URL. Never invent names, domains, handles or emails.
- If something cannot be found, say so plainly instead of guessing.
- Write compact research notes, not prose for the end user.`;

export const STRUCTURER = `You turn research notes into clean JSON for a sales tool.
Copy facts faithfully from the notes. Do not add companies, people, URLs or emails that are not in the notes. Use empty strings for unknown fields.
Write short, plain, specific lines a busy founder can scan.`;

/** Where research should focus: the chosen market, else the brand's own country. */
export function targetMarket(req: RunRequest) {
  if (req.market) return describeMarket(req.market);
  const home = req.profile?.country;
  return home && home !== "Unknown" ? home : "the brand's main market";
}

export function brief(req: RunRequest) {
  const ind = getIndustry(req.industry);
  const lines = [
    `Business website: ${req.domain}`,
    `Industry: ${ind.label}`,
    `Typical buyers in this industry: ${ind.buyers}`,
    `Channels that usually work: ${ind.channels}`,
    `A good lead is: ${ind.leadDefinition}`,
  ];
  lines.push(`Target market: ${targetMarket(req)}`);
  if (req.goal) lines.push(`Founder's goal: ${req.goal}`);
  if (req.profile) {
    const p = req.profile;
    lines.push(
      `Company profile: ${p.name} - ${p.oneLiner}. ${p.description} Based in ${p.country}. Price tier: ${p.priceTier}. Offers: ${p.offerings.join(", ")}.`,
    );
  }
  return lines.join("\n");
}

async function research(client: Anthropic, prompt: string, emit: Emit, maxSearches: number): Promise<string> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
  let notes = "";

  // Server tools can pause a long turn; resume by sending the paused turn back.
  for (let attempt = 0; attempt < 4; attempt++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: BETAS,
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: RESEARCHER,
      messages,
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: maxSearches },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 8 },
      ],
    });

    stream.on("contentBlock", (block) => {
      if (block.type === "server_tool_use") {
        const input = (block.input ?? {}) as { query?: string; url?: string };
        if (input.query) emit({ type: "log", kind: "search", text: `Searching "${input.query}"` });
        else if (input.url) emit({ type: "log", kind: "fetch", text: `Reading ${input.url.replace(/^https?:\/\//, "")}` });
      } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        emit({ type: "log", kind: "think", text: `Found ${block.content.length} results` });
      }
    });

    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") throw new ScoutError("Scout couldn't research this one. Try again, or adjust your goal.");
    for (const b of msg.content) if (b.type === "text") notes += b.text;
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content });
  }
  return notes;
}

async function structure<S extends z.ZodType>(
  client: Anthropic,
  schema: S,
  instructions: string,
  notes: string,
  effort: "low" | "medium" = "low",
): Promise<z.infer<S>> {
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: BETAS,
    fallbacks: "default",
    system: STRUCTURER,
    output_config: { effort, format: betaZodOutputFormat(schema) },
    messages: [{ role: "user", content: `${instructions}\n\n<notes>\n${notes}\n</notes>` }],
  });
  if (res.stop_reason === "refusal") throw new ScoutError("Scout couldn't put this result together. Try again.");
  if (!res.parsed_output) throw new ScoutError("The result could not be read. Try running this step again.");
  return res.parsed_output as z.infer<S>;
}

/** Structured generation without web research, used by tools such as the social growth plan. */
export async function claudeJson<S extends z.ZodType>(schema: S, system: string, prompt: string): Promise<z.infer<S>> {
  const res = await new Anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: BETAS,
    fallbacks: "default",
    system,
    output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
    messages: [{ role: "user", content: prompt }],
  });
  if (res.stop_reason === "refusal") throw new ScoutError("Scout couldn't put this plan together. Try again.");
  if (!res.parsed_output) throw new ScoutError("The plan came back incomplete. Try again.");
  return res.parsed_output as z.infer<S>;
}

export async function runPhase(req: RunRequest, emit: Emit): Promise<unknown> {
  const client = new Anthropic();
  const ctx = brief(req);

  switch (req.phase) {
    case "profile": {
      emit({ type: "log", text: `Opening ${req.domain}` });
      const notes = await research(
        client,
        `${ctx}\n\nResearch this business. Read its website (start with https://${req.domain}) and find its social profiles. ` +
          `Note: name, what it sells and to whom, country/city, price level, sales channels, social links, the words buyers would search for, strengths, and visible growth gaps.`,
        emit,
        5,
      );
      emit({ type: "log", kind: "done", text: "Writing the brand profile" });
      return structure(client, ProfileSchema, `${ctx}\n\nBuild the company profile.`, notes);
    }

    case "competitors": {
      const notes = await research(
        client,
        `${ctx}\n\nFind 8-12 real direct competitors: businesses selling a similar offer to similar buyers, focused on the target market (${targetMarket(req)}); include notable international brands only when they actively sell there. ` +
          `For each, note name, domain, location, positioning and price level. Then note where this brand could stand apart.`,
        emit,
        8,
      );
      emit({ type: "log", kind: "done", text: "Ranking competitors by overlap" });
      return structure(client, CompetitorsSchema, `${ctx}\n\nList the competitors. Exclude ${req.domain} itself.`, notes);
    }

    case "segments": {
      emit({ type: "log", kind: "think", text: "Clustering buyer groups from the profile and competitors" });
      const comp = req.competitors
        ? `Competitors: ${req.competitors.competitors.map((c) => `${c.name} (${c.positioning})`).join("; ")}. Whitespace: ${req.competitors.whitespace}`
        : "";
      return structure(
        client,
        SegmentsSchema,
        `${ctx}\n${comp}\n\nPropose 5-7 customer segments this business should run outreach campaigns to. ` +
          `Think beyond end consumers: who buys in volume, resells, recommends or partners. Order strongest fit first. ` +
          `estimatedAccounts is a rough count of reachable businesses or professionals in ${targetMarket(req)}.`,
        "(No web notes for this step. Reason from the context above.)",
        "medium",
      );
    }

    case "accounts": {
      const seg = req.segment!;
      const where = targetMarket(req);
      const notes = await research(
        client,
        `${ctx}\n\nTarget segment: ${seg.name} - ${seg.job}. Pain: ${seg.pain}.\n` +
          `Find 10-12 real, currently active ${seg.name} in ${where} that would be good prospects. ` +
          `For each note name, website, Instagram handle, city, rough size, why they fit, any recent signal (opening, new collection, hiring, event, funding) and the URL where you found them.`,
        emit,
        10,
      );
      emit({ type: "log", kind: "done", text: "Scoring accounts" });
      return structure(client, AccountsSchema, `${ctx}\n\nList the prospect accounts for "${seg.name}", best fit first.`, notes);
    }

    case "contacts": {
      const limits = req.limits ?? { accounts: 8, people: 1, verifiedEmails: false };
      const accounts = (req.accounts ?? []).slice(0, limits.accounts);
      const list = accounts.map((a) => `- ${a.name}${a.website ? ` (${a.website})` : ""}${a.instagram ? ` IG @${a.instagram}` : ""}`).join("\n");
      const notes = await research(
        client,
        `${ctx}\n\nFor each account below, find the owner, founder, buyer or the person who decides on purchases like this. ` +
          `Use their website (about/team/contact pages), LinkedIn, press and directories. Note the person's name, role, LinkedIn URL and the public source URL. ` +
          `Only note an email if the business publishes it on its own site. Name at most ${limits.people} ${limits.people === 1 ? "person" : "people"} per account, the most senior decision makers first. Skip an account if nobody can be confirmed.\n\n${list}`,
        emit,
        12,
      );
      emit({ type: "log", kind: "done", text: "Matching people to accounts" });
      const result = await structure(client, ContactsSchema, `${ctx}\n\nList the decision makers found.`, notes);
      const contacts: Contact[] = result.contacts.map((c) => ({ ...c, emailStatus: c.email ? "published" : "none" }));
      // Enforce the tier: at most N people per account.
      const perAccount = new Map<string, number>();
      const capped = contacts.filter((c) => {
        const k = c.account.toLowerCase();
        perAccount.set(k, (perAccount.get(k) ?? 0) + 1);
        return (perAccount.get(k) ?? 0) <= limits.people;
      });
      contacts.splice(0, contacts.length, ...capped);
      if (limits.verifiedEmails) await enrichEmails(contacts, accounts, emit);
      return { ...result, contacts };
    }

    case "outreach": {
      const seg = req.segment!;
      emit({ type: "log", kind: "think", text: `Writing a sequence for ${seg.name}` });
      const sample = (req.accounts ?? []).slice(0, 5).map((a) => `${a.name}: ${a.why}${a.signal ? ` (signal: ${a.signal})` : ""}`).join("\n");
      return structure(
        client,
        OutreachSchema,
        `${ctx}\n\nSegment: ${seg.name}. Job: ${seg.job}. Pain: ${seg.pain}. Hook: ${seg.angle}. Best channel: ${seg.bestChannel}.\n` +
          `Example accounts:\n${sample}\n\n` +
          `Write a 4-step outreach sequence across the channels that suit this segment (lead with ${seg.bestChannel}). ` +
          `Sound like a real founder: warm, short, specific, no hype, no "I hope this finds you well". DMs and WhatsApp under 60 words, emails under 110 words. ` +
          `Each step must give a reason to reply and a small, easy next step. Use {{first_name}} and {{company}} placeholders.`,
        "(No web notes for this step.)",
        "medium",
      );
    }
  }
}

// Optional: verified work emails from hunter.io when HUNTER_API_KEY is set.
export async function enrichEmails(contacts: Contact[], accounts: { name: string; website: string }[], emit: Emit) {
  const key = process.env.HUNTER_API_KEY;
  if (!key) return;
  for (const c of contacts) {
    if (c.email) continue;
    const acct = accounts.find((a) => a.name.toLowerCase() === c.account.toLowerCase());
    const domain = acct?.website?.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    const [first, ...rest] = c.name.split(" ");
    if (!domain || !first || rest.length === 0) continue;
    try {
      const url = `https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(domain)}&first_name=${encodeURIComponent(first)}&last_name=${encodeURIComponent(rest.join(" "))}&api_key=${key}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = (await res.json()) as { data?: { email?: string; verification?: { status?: string } } };
      if (json.data?.email) {
        c.email = json.data.email;
        c.emailStatus = json.data.verification?.status === "valid" ? "verified" : "unverified";
        emit({ type: "log", kind: "search", text: `Email found for ${c.name}` });
      }
    } catch {
      // Enrichment is best effort; the contact is still useful without an email.
    }
  }
}

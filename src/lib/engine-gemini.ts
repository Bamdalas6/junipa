import { ScoutError } from "./guard";
import { ApiError, GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse, type Tool } from "@google/genai";
import { z } from "zod";
import { siteIsLive } from "./detect";
import { RESEARCHER, STRUCTURER, brief, enrichEmails, targetMarket } from "./engine";
import {
  AccountsSchema,
  CompetitorsSchema,
  ContactsSchema,
  OutreachSchema,
  ProfileSchema,
  SegmentsSchema,
  type Account,
  type Competitors,
  type Contact,
  type RunEvent,
  type RunRequest,
} from "./schema";

// Gemini version of the research engine. Same phases as engine.ts.
// It uses Google Search grounding when the key's plan allows it, and falls
// back to reading the pages it is given plus model knowledge otherwise. In
// that mode every company website is checked live before it is shown.

type Emit = (e: RunEvent) => void;

const RESEARCH_MODELS = () => [process.env.GEMINI_MODEL, "gemini-pro-latest", "gemini-flash-latest", "gemini-flash-lite-latest"].filter((m): m is string => !!m);
const FORMAT_MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];

// Learned at runtime and kept for the life of the server process.
let searchAvailable: boolean | undefined;
const benched = new Map<string, number>(); // model -> time it can be retried

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const statusOf = (e: unknown) => (e instanceof ApiError ? e.status : Number((e as { status?: unknown })?.status) || 0);

function client() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

/** Tries models in order; skips ones out of quota or unavailable for this key. */
async function generate(
  ai: GoogleGenAI,
  models: string[],
  params: Omit<GenerateContentParameters, "model">,
  opts: { bench?: boolean; timeout?: number } = {},
): Promise<{ res: GenerateContentResponse; model: string }> {
  let last: unknown = new ScoutError("Scout is busy right now. Try again in a minute.");
  for (const model of models) {
    if ((benched.get(model) ?? 0) > Date.now()) continue;
    for (let attempt = 0; attempt < 2; attempt++) {
      const t0 = Date.now();
      try {
        const res = await ai.models.generateContent({ model, ...params, config: { ...params.config, httpOptions: { timeout: opts.timeout ?? 35_000 } } });
        console.info(`[gemini] ${model} ok ${Date.now() - t0}ms`);
        return { res, model };
      } catch (e) {
        last = e;
        const status = statusOf(e);
        console.info(`[gemini] ${model} ${status || "error"} ${Date.now() - t0}ms`);
        if (status === 504 || status === 0) {
          // Hung or timed out: don't wait on it again, skip it for a couple of minutes.
          benched.set(model, Date.now() + 120_000);
          break;
        }
        if (status >= 500) {
          if (attempt === 0) await sleep(1000);
          continue; // busy: retry once, then move on
        }
        if (status === 429 || status === 404 || status === 403) {
          // A free-tier limit of 0 won't change soon, so skip that model for an hour.
          const hard = status !== 429 || /limit:\s*0|free_tier/i.test(String((e as Error).message));
          if (opts.bench !== false) benched.set(model, Date.now() + (hard ? 3_600_000 : 60_000));
          break;
        }
        throw e;
      }
    }
  }
  throw last;
}

async function research(ai: GoogleGenAI, prompt: string, emit: Emit, urls: string[] = []): Promise<{ text: string; searched: boolean }> {
  for (const u of urls.slice(0, 6)) emit({ type: "log", kind: "fetch", text: `Reading ${u.replace(/^https?:\/\//, "")}` });

  const withSearch: Tool[] = [{ googleSearch: {} }, { urlContext: {} }];
  const readOnly: Tool[] = [{ urlContext: {} }];
  const noSearchNote =
    "\n\nWeb search is not available for this run. Use the pages listed above and your own knowledge. " +
    "Only name businesses you are confident are real and still operating, with their real website domain. Never invent people.";

  let out: { res: GenerateContentResponse; model: string } | undefined;
  let searched = false;
  if (searchAvailable !== false) {
    try {
      // Don't bench models here: a 429 may only mean search isn't on this plan.
      out = await generate(ai, RESEARCH_MODELS(), { contents: prompt, config: { systemInstruction: RESEARCHER, tools: withSearch } }, { bench: false, timeout: 45_000 });
      searched = true;
      searchAvailable = true;
    } catch (e) {
      if (statusOf(e) !== 429 && statusOf(e) !== 403) throw e;
      searchAvailable = false;
      emit({ type: "log", kind: "think", text: "Reading websites directly and checking each one is live" });
    }
  }
  if (!out) {
    emit({ type: "log", kind: "think", text: "Reasoning from the pages and known market data" });
    out = await generate(ai, RESEARCH_MODELS(), { contents: prompt + noSearchNote, config: { systemInstruction: KNOWLEDGE_RESEARCHER, tools: urls.length ? readOnly : undefined } });
  }

  const cand = out.res.candidates?.[0];
  for (const q of cand?.groundingMetadata?.webSearchQueries ?? []) emit({ type: "log", kind: "search", text: `Searching "${q}"` });
  const sources = cand?.groundingMetadata?.groundingChunks?.length ?? 0;
  if (sources) emit({ type: "log", kind: "think", text: `Found ${sources} source${sources === 1 ? "" : "s"}` });
  for (const m of cand?.urlContextMetadata?.urlMetadata ?? []) {
    if (m.urlRetrievalStatus && !String(m.urlRetrievalStatus).includes("SUCCESS")) emit({ type: "log", kind: "fetch", text: `Couldn't open ${m.retrievedUrl ?? "a page"}` });
  }
  return { text: out.res.text ?? "", searched };
}

function jsonSchema(schema: z.ZodType) {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

async function structure<S extends z.ZodType>(ai: GoogleGenAI, schema: S, instructions: string, notes: string): Promise<z.infer<S>> {
  const { res } = await generate(ai, FORMAT_MODELS, {
    contents: `${instructions}\n\n<notes>\n${notes}\n</notes>`,
    config: { systemInstruction: STRUCTURER, responseMimeType: "application/json", responseJsonSchema: jsonSchema(schema) },
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(res.text ?? "");
  } catch {
    throw new ScoutError("The result could not be read. Try running this step again.");
  }
  const check = schema.safeParse(parsed);
  if (!check.success) throw new ScoutError("The result came back incomplete. Try running this step again.");
  return check.data;
}

/** Structured generation without web research, used by tools such as the social growth plan. */
export async function geminiJson<S extends z.ZodType>(schema: S, system: string, prompt: string): Promise<z.infer<S>> {
  const { res } = await generate(client(), RESEARCH_MODELS(), {
    contents: prompt,
    config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: jsonSchema(schema) },
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(res.text ?? "");
  } catch {
    throw new ScoutError("The plan could not be read. Try again.");
  }
  const check = schema.safeParse(parsed);
  if (!check.success) throw new ScoutError("The plan came back incomplete. Try again.");
  return check.data;
}

/** Checks websites in parallel (a few at a time). */
async function checkSites(sites: string[], emit: Emit): Promise<boolean[]> {
  emit({ type: "log", kind: "fetch", text: `Checking ${sites.filter(Boolean).length} websites are live` });
  const out: boolean[] = new Array(sites.length).fill(false);
  let i = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (i < sites.length) {
        const k = i++;
        out[k] = sites[k] ? await siteIsLive(sites[k]) : false;
      }
    }),
  );
  return out;
}

// Used when web search isn't available: lean on the model's knowledge, knowing the app checks every site.
const KNOWLEDGE_RESEARCHER = `You are Junia's go-to-market researcher, helping a small team find customers.
Web search is unavailable for this run, so draw on your own knowledge of real businesses and read any pages you are given.
Rules:
- Name only businesses you are confident exist and still operate. Give their real website domain and Instagram handle when you know them.
- Junia checks every website live after you answer and drops ones that don't respond, so never guess a domain.
- Never invent people. Only name a person if they appear on a page you were given.
- Write compact research notes, not prose for the end user.`;

const site = (s: string) => (s ? (s.startsWith("http") ? s : `https://${s}`) : "");

export async function runGeminiPhase(req: RunRequest, emit: Emit): Promise<unknown> {
  const ai = client();
  const ctx = brief(req);

  switch (req.phase) {
    case "profile": {
      emit({ type: "log", text: `Opening ${req.domain}` });
      const { text } = await research(
        ai,
        `${ctx}\n\nPages: https://${req.domain}\n\nResearch this business from its website${searchAvailable === false ? "" : " and social profiles"}. ` +
          `Note: name, what it sells and to whom, country/city, price level, sales channels, social links, the words buyers would search for, strengths, and visible growth gaps.`,
        emit,
        [`https://${req.domain}`],
      );
      emit({ type: "log", kind: "done", text: "Writing the brand profile" });
      return structure(ai, ProfileSchema, `${ctx}\n\nBuild the company profile.`, text);
    }

    case "competitors": {
      const { text, searched } = await research(
        ai,
        `${ctx}\n\nFind 8-12 real direct competitors: businesses selling a similar offer to similar buyers, focused on the target market (${targetMarket(req)}); include notable international brands only when they actively sell there. ` +
          `For each, note name, website domain, location, positioning and price level. Then note where this brand could stand apart.`,
        emit,
      );
      emit({ type: "log", kind: "done", text: "Ranking competitors by overlap" });
      const result = (await structure(ai, CompetitorsSchema, `${ctx}\n\nList the competitors. Exclude ${req.domain} itself.`, text)) as Competitors;
      const live = await checkSites(result.competitors.map((c) => c.domain), emit);
      const competitors = result.competitors.map((c, i) => ({ ...c, verified: live[i] })).filter((c) => searched || c.verified);
      emit({ type: "log", kind: "think", text: `${competitors.filter((c) => c.verified).length} of ${result.competitors.length} websites confirmed live` });
      return { ...result, competitors };
    }

    case "segments": {
      emit({ type: "log", kind: "think", text: "Clustering buyer groups from the profile and competitors" });
      const comp = req.competitors
        ? `Competitors: ${req.competitors.competitors.map((c) => `${c.name} (${c.positioning})`).join("; ")}. Whitespace: ${req.competitors.whitespace}`
        : "";
      return structure(
        ai,
        SegmentsSchema,
        `${ctx}\n${comp}\n\nPropose 5-7 customer segments this business should run outreach campaigns to. ` +
          `Think beyond end consumers: who buys in volume, resells, recommends or partners. Order strongest fit first. ` +
          `estimatedAccounts is a rough count of reachable businesses or professionals in ${targetMarket(req)}.`,
        "(No web notes for this step. Reason from the context above.)",
      );
    }

    case "accounts": {
      const seg = req.segment!;
      const where = targetMarket(req);
      const { text, searched } = await research(
        ai,
        `${ctx}\n\nTarget segment: ${seg.name} - ${seg.job}. Pain: ${seg.pain}.\n` +
          `Find 10-12 real, currently active ${seg.name} in ${where} that would be good prospects. ` +
          `For each note name, website, Instagram handle, city, rough size, why they fit, any recent signal (opening, new collection, hiring, event, funding) and the URL where you found them.`,
        emit,
      );
      emit({ type: "log", kind: "done", text: "Scoring accounts" });
      const result = await structure(ai, AccountsSchema, `${ctx}\n\nList the prospect accounts for "${seg.name}", best fit first.`, text);
      const live = await checkSites(result.accounts.map((a) => a.website), emit);
      const accounts: Account[] = result.accounts
        .map((a, i) => ({ ...a, verified: live[i], source: a.source || site(a.website) }))
        // Without search, keep accounts whose site answered, plus Instagram-only ones flagged as unverified.
        .filter((a) => searched || a.verified || (!a.website && a.instagram));
      emit({ type: "log", kind: "think", text: `${accounts.filter((a) => a.verified).length} of ${result.accounts.length} websites confirmed live` });
      return { accounts };
    }

    case "contacts": {
      const limits = req.limits ?? { accounts: 8, people: 1, verifiedEmails: false };
      const accounts = (req.accounts ?? []).slice(0, limits.accounts);
      const pages = accounts.filter((a) => a.website && a.verified !== false).flatMap((a) => [site(a.website), `${site(a.website).replace(/\/$/, "")}/about`]).slice(0, 16);
      const list = accounts.map((a) => `- ${a.name}${a.website ? ` (${a.website})` : ""}${a.instagram ? ` IG @${a.instagram}` : ""}`).join("\n");
      const { text, searched } = await research(
        ai,
        `${ctx}\n\n${pages.length ? `Pages:\n${pages.join("\n")}\n\n` : ""}For each account below, find the owner, founder, buyer or the person who decides on purchases like this. ` +
          `Note the person's name, role, LinkedIn URL and the public source URL. Only note an email if the business publishes it on its own site. ` +
          `Name at most ${limits.people} ${limits.people === 1 ? "person" : "people"} per account, the most senior decision makers first. Skip an account if nobody can be confirmed on a page.\n\n${list}`,
        emit,
        pages,
      );
      emit({ type: "log", kind: "done", text: "Matching people to accounts" });
      const result = await structure(ai, ContactsSchema, `${ctx}\n\nList the decision makers found on the pages.`, text);
      // Without search, only keep people whose source is one of the pages we actually gave the model.
      const allowed = new Set(pages.map((p) => new URL(p).hostname.replace(/^www\./, "")));
      const contacts: Contact[] = result.contacts
        .filter((c) => {
          if (searched) return true;
          try {
            return allowed.has(new URL(c.source).hostname.replace(/^www\./, ""));
          } catch {
            return false;
          }
        })
        .map((c) => ({ ...c, emailStatus: c.email ? "published" : "none" }));
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
        ai,
        OutreachSchema,
        `${ctx}\n\nSegment: ${seg.name}. Job: ${seg.job}. Pain: ${seg.pain}. Hook: ${seg.angle}. Best channel: ${seg.bestChannel}.\n` +
          `Example accounts:\n${sample}\n\n` +
          `Write a 4-step outreach sequence across the channels that suit this segment (lead with ${seg.bestChannel}). ` +
          `Sound like a real founder: warm, short, specific, no hype, no "I hope this finds you well". DMs and WhatsApp under 60 words, emails under 110 words. ` +
          `Each step must give a reason to reply and a small, easy next step. Use {{first_name}} and {{company}} placeholders.`,
        "(No web notes for this step.)",
      );
    }
  }
}

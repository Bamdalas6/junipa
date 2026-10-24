import { ScoutError } from "./guard";
import { ApiError, GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse, type Tool } from "@google/genai";
import { z } from "zod";
import { mentionsCountry, namesCompany, namesPerson, readPageText, readSite, type SitePage } from "./detect";
import { RESEARCHER, STRUCTURER, brief, enrichEmails, targetMarket } from "./engine";
import { formatHits, webSearch, webSearchAll, webSearchOn, type Hit } from "./websearch";
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
// back to reading the pages it is given plus model knowledge otherwise.
// Either way, every company it names is checked against its own website
// (read just now), and every person against the pages that name them.

type Emit = (e: RunEvent) => void;

const RESEARCH_MODELS = () => [process.env.GEMINI_MODEL, "gemini-pro-latest", "gemini-flash-latest", "gemini-flash-lite-latest"].filter((m): m is string => !!m);
const FORMAT_MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];

// Search grounding needs a paid plan. After a refusal, research runs without it
// for a while and then tries again (billing may have been switched on since).
let searchOffUntil = 0;
const searchOn = () => searchOffUntil <= Date.now();
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
  // When every model is benched, still try the last one rather than fail outright.
  const ready = models.filter((m) => (benched.get(m) ?? 0) <= Date.now());
  for (const model of ready.length ? ready : models.slice(-1)) {
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
          // Hung or timed out: skip it for a minute, or retry once if it's the only model left.
          benched.set(model, Date.now() + 60_000);
          if (attempt === 0 && model === models[models.length - 1]) continue;
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
  if (searchOn()) {
    try {
      // Don't bench models here: a 429 may only mean search isn't on this plan.
      out = await generate(ai, RESEARCH_MODELS(), { contents: prompt, config: { systemInstruction: RESEARCHER, tools: withSearch } }, { bench: false, timeout: 45_000 });
      searched = true;
    } catch (e) {
      if (statusOf(e) !== 429 && statusOf(e) !== 403) throw e;
      // Not on this plan: check again in 15 minutes. A busy minute (the error says when to retry): check again in one.
      const hard = statusOf(e) === 403 || !/retryDelay|per.?minute/i.test(String((e as Error).message));
      searchOffUntil = Date.now() + (hard ? 15 * 60_000 : 60_000);
      console.info(`[gemini] search unavailable (${statusOf(e)}), retrying in ${hard ? "15m" : "1m"}`);
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

/** Runs `fn` over `items`, a few at a time. */
async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

const VetSchema = z.object({
  checks: z.array(z.object({ n: z.number().describe("Candidate number"), keep: z.boolean(), reason: z.string().describe("A few words") })),
});

const VETTER = `You check a sales tool's research against the real websites of the businesses it named.
For each numbered candidate you get the name it was given and what its website shows right now.
Judge only from the website text, and only reject clear mistakes. keep=false when the site plainly belongs to a different company than the name, is clearly a different kind of business than the question asks for (e.g. a florist given as a clothing boutique), or says it has closed.
When a segment names people (founders, managers, buyers), the candidate is the organisation those people work at: judge whether such people there would plausibly buy. Partial overlap is fine.
Never reject on size, age, funding stage or how established a business looks: a website can't show that reliably. When the text is thin or you are unsure, keep it.`;

/**
 * Reads each candidate's website and keeps only real, matching businesses:
 * no dead, parked or holding pages, no sites of a different company, and (from
 * what the page actually says) the right kind of business for the question.
 * Sites that block bots are kept, unverified. So are ones without a website when `keepSiteless`.
 * With `market` (a country code), a candidate also needs its site or the search result that named it
 * (`said`) to place it in that country, and is dropped when its site points to another one.
 * If the judgement can't run, `unjudged` decides what happens to candidates that passed the site checks.
 */
async function vet<T>(
  ai: GoogleGenAI,
  items: T[],
  get: (t: T) => { name: string; site: string; said?: string },
  question: string,
  emit: Emit,
  opts: { keepSiteless?: boolean; market?: string; unjudged?: (t: T) => T } = {},
): Promise<(T & { verified: boolean })[]> {
  emit({ type: "log", kind: "fetch", text: `Reading ${items.filter((t) => get(t).site).length} websites to check each one` });
  const pages: (SitePage | null)[] = await pool(items, 6, (t) => (get(t).site ? readSite(get(t).site) : Promise.resolve(null)));

  const { market } = opts;
  const keep: (boolean | "unverified")[] = items.map((t, i) => {
    const p = pages[i];
    const { name, site, said = "" } = get(t);
    let why = "";
    if (p?.status === "ok") {
      why = p.parked ? "parked domain" : p.placeholder ? "holding page" : !namesCompany(p, name) ? `site doesn't name it (${p.title.slice(0, 60)})` : "";
      if (!why && market && p.country && p.country !== market) why = `site is based in ${p.country}`;
      if (!why && market && !mentionsCountry(`${p.title} ${p.description} ${p.text} ${said}`, market)) why = `nothing places it in ${market}`;
    } else if (p?.status === "dead") why = "no website";
    else if (!p && !opts.keepSiteless) why = "no website given";
    else if (market && !mentionsCountry(said, market)) why = `nothing places it in ${market}`;
    if (why) {
      console.info(`[vet] drop ${name}${site ? ` (${site})` : ""}: ${why}`);
      return false;
    }
    return p?.status === "ok" ? true : "unverified";
  });

  const judged = items.map((_, i) => i).filter((i) => keep[i] === true);
  if (judged.length) {
    const notes = judged
      .map((i, n) => {
        const p = pages[i]!;
        const said = get(items[i]).said;
        return `${n + 1}. ${get(items[i]).name} — ${p.url}\nTitle: ${p.title}\nDescription: ${p.description}\nText: ${p.text.slice(0, 700)}${p.country ? `\nSite looks based in: ${p.country}` : ""}${said ? `\nSearch result that named it: ${said.slice(0, 400)}` : ""}`;
      })
      .join("\n\n");
    let done = false;
    for (let attempt = 0; attempt < 2 && !done; attempt++) {
      try {
        if (attempt) await sleep(2000);
        const { res } = await generate(ai, FORMAT_MODELS, {
          contents: `${question}\n\n<candidates>\n${notes}\n</candidates>`,
          config: { systemInstruction: VETTER, responseMimeType: "application/json", responseJsonSchema: jsonSchema(VetSchema) },
        });
        for (const c of VetSchema.parse(JSON.parse(res.text ?? "{}")).checks) {
          const i = judged[c.n - 1];
          if (i !== undefined && !c.keep) {
            keep[i] = false;
            console.info(`[vet] drop ${get(items[i]).name}: ${c.reason}`);
          }
        }
        done = true;
      } catch (e) {
        console.info("[vet] judgement failed:", statusOf(e) || (e as Error).message);
      }
    }
    // The site checks above still stand; only the judgement of what each business does is missing.
    if (!done && opts.unjudged) for (const i of judged) items[i] = opts.unjudged(items[i]);
  }

  const out = items.map((t, i) => ({ ...t, verified: keep[i] === true && get(t).site !== "" })).filter((_, i) => keep[i] !== false);
  const dropped = items.length - out.length;
  emit({ type: "log", kind: "think", text: `${out.filter((x) => x.verified).length} confirmed on their own websites${dropped ? `, ${dropped} left out (wrong business, closed or not found)` : ""}` });
  return out;
}

// Used when web search isn't available: lean on the model's knowledge, knowing the app checks every site.
const KNOWLEDGE_RESEARCHER = `You are Junia's go-to-market researcher, helping a small team find customers.
Web search is unavailable for this run, so draw on your own knowledge of real businesses and read any pages you are given.
Rules:
- Name only businesses you are confident exist and still operate. Give their real website domain and Instagram handle when you know them.
- Junia reads every website after you answer and drops ones that are dead, belong to someone else or are a different kind of business, so never guess a domain.
- If you don't know a business well, say so and rely only on the page text you were given.
- Never invent people. Only name a person if they appear in page text you were given.
- Write compact research notes, not prose for the end user.`;

const site = (s: string) => (s ? (s.startsWith("http") ? s : `https://${s}`) : "");
const bare = (s: string) => s.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0].toLowerCase();
const foldName = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
const LINKEDIN = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[\w\-%.]+\/?$/i;
const isFullName = (s: string) => s.trim().split(/\s+/).length >= 2 && !/unknown|n\/a|not (found|listed)|owner|founder|team/i.test(s);

const QueriesSchema = z.object({ queries: z.array(z.string()).describe("Plain web search queries") });

/** A search result in the shape the name checks take. */
const asPage = (h: Hit): SitePage => ({ status: "ok", url: h.url, title: h.title, description: "", text: h.content, parked: false, placeholder: false, teamLinks: [] });

/** The text within a couple of hundred characters of a company's name (or "" if the name isn't there). */
function aroundName(text: string, name: string) {
  const word = name.replace(/\(.*?\)/g, " ").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const lower = text.toLowerCase();
  const at = word.length > 2 ? lower.indexOf(word) : -1;
  return at < 0 ? "" : text.slice(Math.max(0, at - 200), at + word.length + 200);
}

/** The search result that names this business, if any. */
function hitNaming(hits: Hit[], name: string, domain = "") {
  const d = bare(domain);
  return hits.find((h) => (d && bare(h.url) === d) || namesCompany(asPage(h), name));
}

/**
 * Research notes for a step. With the web search API set up, from real search
 * results (the model only writes the queries, and the step may only use
 * businesses the results name). Otherwise the AI's own search when the plan
 * includes it, else what it knows, checked afterwards against each website.
 */
async function gather(
  ai: GoogleGenAI,
  prompt: string,
  emit: Emit,
  search: { ask: string; fallback: string; country?: string },
): Promise<{ text: string; searched: boolean; hits: Hit[] }> {
  if (webSearchOn()) {
    let queries: string[] = [];
    try {
      const { res } = await generate(ai, FORMAT_MODELS, {
        contents: `${search.ask}\nReturn 4 different queries.`,
        config: {
          systemInstruction:
            `You write web search queries for a sales research tool. Today is ${new Date().toISOString().slice(0, 10)}, so look for current information. ` +
            "Plain queries a person would type, in the language people search in there. No site: or quote operators.",
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchema(QueriesSchema),
        },
      });
      queries = QueriesSchema.parse(JSON.parse(res.text ?? "{}")).queries;
    } catch {
      // Fall back to the plain query below.
    }
    queries = [...new Set(queries.map((q) => q.trim()).filter(Boolean))].slice(0, 4);
    if (!queries.length) queries = [search.fallback];
    for (const q of queries) emit({ type: "log", kind: "search", text: `Searching "${q}"` });
    const hits = await webSearchAll(queries, { max: 10, country: search.country });
    emit({ type: "log", kind: "think", text: `Found ${hits.length} page${hits.length === 1 ? "" : "s"}` });
    if (hits.length) return { text: formatHits(hits), searched: true, hits };
  }
  const r = await research(ai, prompt, emit);
  return { ...r, hits: [] };
}

export async function runGeminiPhase(req: RunRequest, emit: Emit): Promise<unknown> {
  const ai = client();
  const ctx = brief(req);
  // Country to focus web searches on: the chosen market, else where the brand is based.
  const country = req.market?.scope === "country" ? req.market.country : req.market ? undefined : req.profile?.countryCode || undefined;

  switch (req.phase) {
    case "profile": {
      emit({ type: "log", text: `Opening ${req.domain}` });
      // Read the homepage ourselves, so the profile rests on what the site says rather than on memory.
      const home = await readSite(req.domain, { maxText: 5000 });
      const page =
        home.status === "ok"
          ? `Homepage ${home.url}, read just now:\nTitle: ${home.title}\nDescription: ${home.description}\nText: ${home.text}${home.country ? `\nLocation clues on the site point to: ${home.country}` : ""}`
          : "";
      if (!page) emit({ type: "log", kind: "fetch", text: `Couldn't read ${req.domain} directly, using other sources` });
      const { text } = await research(
        ai,
        `${ctx}\n\n${page ? `${page}\n\n` : ""}Pages: https://${req.domain}\n\nResearch this business from its website${searchOn() ? " and social profiles" : ""}. ` +
          `Base the profile on the website's own words. Only add facts from elsewhere when you are sure they are about this business at ${req.domain}, not another company with a similar name. ` +
          `Note: name, what it sells and to whom, country/city, price level, sales channels, social links, the words buyers would search for, strengths, and visible growth gaps.`,
        emit,
        [`https://${req.domain}`],
      );
      emit({ type: "log", kind: "done", text: "Writing the brand profile" });
      return structure(ai, ProfileSchema, `${ctx}\n\nBuild the company profile. Where the homepage text and the other notes disagree, trust the homepage.`, `${page}\n\n${text}`);
    }

    case "competitors": {
      const brand = req.profile ? `${req.profile.name} (${req.profile.oneLiner})` : req.domain;
      const where = targetMarket(req);
      const { text, hits } = await gather(
        ai,
        `${ctx}\n\nFind 8-12 real direct competitors: businesses selling a similar offer to similar buyers, focused on the target market (${where}); include notable international brands only when they actively sell there. ` +
          `For each, note name, website domain, location, positioning and price level. Then note where this brand could stand apart.`,
        emit,
        {
          ask: `${ctx}\n\nWrite web search queries that find businesses competing with ${brand} in ${where}: others offering ${req.profile?.offerings.slice(0, 3).join(", ") || "the same thing"}, "best ... in ..." lists, and alternatives to it.`,
          fallback: `${req.profile?.category || "companies like"} ${req.profile?.name ?? req.domain} competitors ${where}`,
          country,
        },
      );
      emit({ type: "log", kind: "done", text: "Ranking competitors by overlap" });
      const result = (await structure(
        ai,
        CompetitorsSchema,
        `${ctx}\n\nList the competitors. Exclude ${req.domain} itself.` +
          (hits.length ? ` Use only businesses named in the search results, and give each one's own website domain only when the results show it.` : ""),
        text,
      )) as Competitors;
      const own = bare(req.domain);
      const seen = new Set<string>();
      const unique = result.competitors.filter((c) => {
        const d = bare(c.domain);
        if (!d || d === own || seen.has(d)) return false;
        // With web results, keep only businesses the results actually name.
        if (hits.length && !hitNaming(hits, c.name, c.domain)) return false;
        seen.add(d);
        return true;
      });
      const competitors = await vet(
        ai,
        unique,
        (c) => ({ name: c.name, site: c.domain }),
        `Brand being researched: ${brand}, ${req.domain}. Question: does each candidate offer a similar kind of product or service to similar buyers, so buyers would compare the two? ` +
          `Reject suppliers, platforms or hubs that serve such businesses, retailers that stock them, customers, and unrelated businesses.`,
        emit,
      );
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
          `Base them on what this business actually sells (see the profile), not on the industry in general. ` +
          `Think beyond end consumers: who buys in volume, resells, recommends or partners. Never list competitors as a segment. Order strongest fit first. ` +
          `estimatedAccounts is a rough count of reachable businesses or professionals in ${targetMarket(req)}.`,
        "(No web notes for this step. Reason from the context above.)",
      );
    }

    case "accounts": {
      const seg = req.segment!;
      const where = targetMarket(req);
      const brand = req.profile ? `${req.profile.name} (${req.profile.oneLiner})` : req.domain;
      const { text, searched, hits } = await gather(
        ai,
        `${ctx}\n\nTarget segment: ${seg.name} - ${seg.job}. Pain: ${seg.pain}.\n` +
          `Find 10-12 real, currently active ${seg.name} in ${where} that would be good prospects. They must be buyers, not competitors of this brand. ` +
          `For each note name, website, Instagram handle, city, rough size, why they fit, any recent signal (opening, new collection, hiring, event, funding) and the URL where you found them.`,
        emit,
        {
          ask:
            `${ctx}\n\nWrite web search queries that find real, currently active ${seg.name} (${seg.job}) in ${where} who could buy from ${brand}. ` +
            `Aim for pages that name many of them: directories, "top ... in ..." lists, funding or opening news, association member lists, and their own sites.`,
          fallback: `${seg.name} in ${where}`,
          country,
        },
      );
      emit({ type: "log", kind: "done", text: "Scoring accounts" });
      const result = await structure(
        ai,
        AccountsSchema,
        `${ctx}\n\nList the prospect accounts for "${seg.name}", best fit first.` +
          (hits.length
            ? ` Use only organisations named in the search results; never add others. source is the URL of the result that names it. website is the organisation's own domain only when the results show it (or the result is its own site), else empty.`
            : ""),
        text,
      );
      // Never pitch the brand to itself or to its competitors.
      const skip = new Set([bare(req.domain), ...(req.competitors?.competitors ?? []).map((c) => bare(c.domain))]);
      const skipNames = new Set((req.competitors?.competitors ?? []).map((c) => foldName(c.name)));
      const seen = new Set<string>();
      const said = new Map<object, string>();
      const candidates = result.accounts.flatMap((a) => {
        const d = bare(a.website);
        const key = d || foldName(a.name);
        if ((d && skip.has(d)) || skipNames.has(foldName(a.name)) || seen.has(key)) return [];
        // With web results, keep only organisations a result names, and cite that result.
        const hit = hits.length ? hitNaming(hits, a.name, a.website) : undefined;
        if (hits.length && !hit) return [];
        seen.add(key);
        if (!hit) return [a];
        const grounded = { ...a, source: hit.url };
        // What the result says right around the name: a list of "startups in X" only counts for the companies placed there.
        said.set(grounded, aroundName(`${hit.title}. ${hit.content}`, a.name));
        return [grounded];
      });
      // List articles rarely give websites: look each one up, taking a result whose domain carries the name.
      const missing = candidates.filter((a) => !a.website).slice(0, 8);
      const lookedUp = new Set<(typeof candidates)[number]>();
      if (hits.length && missing.length) {
        emit({ type: "log", kind: "search", text: `Looking up the websites of ${missing.length} prospects` });
        await pool(missing, 4, async (a) => {
          const key = foldName(a.name.replace(/\(.*?\)/g, ""));
          const found = (await webSearch(`${a.name} ${where} official website`, { max: 5, country })).find((h) => {
            // The name must be the site's own domain (brand.com, brand.com.ng), not a page on
            // someone else's site such as brand.reviewsite.com.
            const parts = bare(h.url).split(".");
            const ccSecond = parts.length > 2 && /^(com|co|org|net|gov|edu|ac|ltd|plc)$/.test(parts[parts.length - 2]);
            if (parts.length > (ccSecond ? 3 : 2)) return false;
            const label = foldName(parts[0]);
            return key.length > 2 && (label.includes(key) || (label.length >= 4 && key.startsWith(label)));
          });
          if (found) {
            a.website = bare(found.url);
            lookedUp.add(a);
          }
        });
      }
      const worldwide = req.market?.scope === "worldwide";
      const vetted = await vet(
        ai,
        candidates,
        (a) => ({ name: a.name, site: a.website, said: said.get(a) }),
        `Brand looking for customers: ${brand}. Segment: ${seg.name} (${seg.job}). Question: is each candidate really one of "${seg.name}"` +
          `${worldwide ? "" : ` and based in or clearly serving ${where}`}, and a plausible buyer for this brand? Competitors of the brand are not buyers.`,
        emit,
        {
          // Instagram-only shops, and ones a search result names without a website, can't be read here; keep them, unverified.
          keepSiteless: true,
          market: req.market?.scope === "country" ? req.market.country : undefined,
          // A website found by name alone may belong to a namesake: without the judgement, don't use it.
          unjudged: (a) => (lookedUp.has(a) ? { ...a, website: "" } : a),
        },
      );
      const accounts: Account[] = vetted
        .filter((a) => a.website || (hits.length && a.source) || (a.instagram && (searched || !a.website)))
        // A source is always a link: the search result that named it, else the business's own site.
        .map((a) => ({ ...a, source: hits.length && /^https?:\/\//.test(a.source) ? a.source : site(a.website) }));
      return { accounts };
    }

    case "contacts": {
      const limits = req.limits ?? { accounts: 8, people: 1, verifiedEmails: false };
      const accounts = (req.accounts ?? []).slice(0, limits.accounts);
      // Read each prospect's homepage and its about/team pages, and give the model that text,
      // so every person can be checked against a page that really names them.
      emit({ type: "log", kind: "fetch", text: `Reading the about and team pages of ${accounts.filter((a) => a.website).length} prospects` });
      const read = await pool(accounts, 4, async (a) => {
        if (!a.website) return { a, pages: [] as { url: string; text: string }[] };
        const home = await readSite(a.website, { maxText: 4000 });
        if (home.status !== "ok") return { a, pages: [] };
        const extra = await Promise.all(home.teamLinks.slice(0, 3).map(async (url) => ({ url, text: await readPageText(url, 4000) })));
        return { a, pages: [{ url: home.url, text: home.text }, ...extra.filter((p) => p.text.length > 80)] };
      });
      for (const r of read) for (const p of r.pages.slice(1)) emit({ type: "log", kind: "fetch", text: `Read ${p.url.replace(/^https?:\/\//, "")}` });

      // With the web search API, also look each company's people up on the web (LinkedIn, press, directories).
      const web = webSearchOn();
      const found: Hit[][] = web
        ? await pool(accounts, 4, (a) => webSearch(`${a.name}${a.website ? ` ${bare(a.website)}` : ""} founder CEO owner`, { max: 6, country }))
        : accounts.map(() => []);
      if (web) emit({ type: "log", kind: "search", text: `Searching the web for the people behind ${accounts.length} prospects` });

      // One short section per account, so every account gets read, not just the first few.
      const sections = read.map((r, i) => {
        const pages = r.pages
          .slice(0, 3)
          .map((p) => `[${p.url}]\n${p.text.slice(0, 1500)}`)
          .join("\n\n");
        const results = found[i].length ? `Web search results:\n${formatHits(found[i].map((h) => ({ ...h, content: h.content.slice(0, 600) })))}` : "";
        return pages || results ? `### ${r.a.name}\n${[pages, results].filter(Boolean).join("\n\n")}` : "";
      });
      const ask = (some: Account[]) =>
        `For each account below, find the owner, founder, buyer or the person who decides on purchases like this. ` +
        `Note the person's name, role, LinkedIn URL and the URL of the page that names them in that role. Only note an email if it appears on the business's own pages. ` +
        `Name at most ${limits.people} ${limits.people === 1 ? "person" : "people"} per account, the most senior decision makers first. Skip an account if nobody is named on a page.\n\n` +
        some.map((a) => `- ${a.name}${a.website ? ` (${a.website})` : ""}${a.instagram ? ` IG @${a.instagram}` : ""}`).join("\n");
      const notes = sections.filter(Boolean).join("\n\n");
      // With web results in hand there is nothing for memory to add, so go straight to the list.
      const { text, searched } = web
        ? { text: "", searched: false }
        : await research(ai, `${ctx}\n\n${notes ? `Text of each account's own pages, read just now:\n${notes}\n\n` : ""}${ask(accounts)}`, emit);
      emit({ type: "log", kind: "done", text: "Matching people to accounts" });
      // A few accounts per call keeps the model's attention on each one.
      const batches = Array.from({ length: Math.ceil(accounts.length / 4) }, (_, b) => [b * 4, b * 4 + 4] as const);
      const parts = await pool(batches, 2, ([from, to]) =>
        structure(
          ai,
          ContactsSchema,
          `${ctx}\n\n${ask(accounts.slice(from, to))}\n\nList the decision makers found on the pages and search results. Use the exact account names from the list. Only people the text names; never add anyone.`,
          `${text ? `${text}\n\n` : ""}${sections.slice(from, to).filter(Boolean).join("\n\n")}`,
        ).catch((e: unknown) => (console.info("[contacts] batch failed:", statusOf(e) || (e as Error).message), null)),
      );
      if (parts.every((p) => p === null)) throw new ScoutError("Scout couldn't match people to these accounts. Try again in a moment.");
      const done = parts.filter((p): p is NonNullable<typeof p> => p !== null);
      const result = { contacts: done.flatMap((p) => p.contacts), rolesToTarget: done.find((p) => p.rolesToTarget.length)?.rolesToTarget ?? [] };

      // Keep a person only when a page we read or a search result names them at that company,
      // or (with the AI's own search) the page cited for them does.
      const findAccount = (name: string) => {
        const k = foldName(name);
        const i = read.findIndex((r) => foldName(r.a.name) === k);
        return i >= 0 ? i : read.findIndex((r) => foldName(r.a.name).includes(k) || k.includes(foldName(r.a.name)));
      };
      const checked = await pool(result.contacts, 4, async (c): Promise<Contact | null> => {
        const i = findAccount(c.account);
        if (i < 0 || !isFullName(c.name)) return null;
        const r = read[i];
        const hits = found[i];
        const linkedinHit = hits.find((h) => LINKEDIN.test(h.url) && namesPerson(`${h.title} ${h.content}`, c.name));
        const linkedin = linkedinHit?.url ?? (LINKEDIN.test(c.linkedin) && (searched || hits.some((h) => h.url === c.linkedin)) ? c.linkedin : "");
        const all = r.pages.map((p) => p.text).join(" ").toLowerCase();
        const email = c.email && all.includes(c.email.toLowerCase()) ? c.email : "";
        const onPage = r.pages.find((p) => namesPerson(p.text, c.name));
        if (onPage) return { ...c, account: r.a.name, linkedin, email, source: onPage.url, emailStatus: email ? "published" : "none" };
        // A search result counts only if it names both the person and the company.
        const host = bare(r.a.website);
        const inResult = hits.find((h) => {
          const t = `${h.title} ${h.content}`;
          return namesPerson(t, c.name) && (namesCompany(asPage(h), r.a.name) || (host && t.toLowerCase().includes(host)));
        });
        if (inResult) return { ...c, account: r.a.name, linkedin, email: "", source: inResult.url, emailStatus: "none" };
        if (!searched) return null;
        let source = "";
        try {
          source = /^https?:$/.test(new URL(c.source).protocol) ? c.source : "";
        } catch {}
        // LinkedIn won't show its pages to us; trust a grounded LinkedIn profile, check anything else.
        if (source && !/linkedin\.com/i.test(source) && !namesPerson(await readPageText(source), c.name)) return null;
        if (!source && !linkedin) return null;
        return { ...c, account: r.a.name, linkedin, email: "", source: source || linkedin, emailStatus: "none" };
      });
      const contacts = checked.filter((c): c is Contact => c !== null);
      const unconfirmed = result.contacts.length - contacts.length;
      if (unconfirmed) emit({ type: "log", kind: "think", text: `Left out ${unconfirmed} ${unconfirmed === 1 ? "person" : "people"} no public page confirms` });

      // Enforce the tier: at most N people per account.
      const perAccount = new Map<string, number>();
      const capped = contacts.filter((c) => {
        const k = c.account.toLowerCase();
        perAccount.set(k, (perAccount.get(k) ?? 0) + 1);
        return (perAccount.get(k) ?? 0) <= limits.people;
      });
      if (limits.verifiedEmails) await enrichEmails(capped, accounts, emit);
      return { ...result, contacts: capped };
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
          `Only mention facts about this brand that are in the profile; never invent results, clients, numbers or awards. ` +
          `Each step must give a reason to reply and a small, easy next step. Use {{first_name}} and {{company}} placeholders.`,
        "(No web notes for this step.)",
      );
    }
  }
}


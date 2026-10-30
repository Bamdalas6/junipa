import Anthropic from "@anthropic-ai/sdk";
import { ApiError } from "@google/genai";
import { currentUser } from "@/lib/auth";
import { entitlement, planOf } from "@/lib/billing";
import { MAX_ACCOUNTS } from "@/lib/plans";
import { runDemo } from "@/lib/demo";
import { sanitizeMarket } from "@/lib/geo";
import { provider, runPhase } from "@/lib/engine";
import { runGeminiPhase } from "@/lib/engine-gemini";
import { badRequest, clientIp, clip, clipDeep, rateLimit, readJson, userMessage } from "@/lib/guard";
import { RUN_IP, sharedLimit } from "@/lib/ratelimit";
import { isAdmin, recordEvent } from "@/lib/analytics";
import { TIERS, isPaidPhase, verifyUnlock } from "@/lib/payments";
import type { RunEvent, RunRequest } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PHASES = new Set(["profile", "competitors", "segments", "accounts", "contacts", "outreach"]);
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

// Streams newline-delimited JSON: progress logs, then one result or error.
export async function POST(request: Request) {
  let body: RunRequest;
  try {
    body = await readJson<RunRequest>(request, 200_000);
  } catch (err) {
    return badRequest(err)!;
  }
  if (!PHASES.has(body.phase) || typeof body.domain !== "string" || body.domain.length > 253 || !DOMAIN.test(body.domain)) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const demo = body.demo === true;
  // Live research costs money per call, so it's limited per visitor. Demo runs are cheap.
  const limited = demo ? rateLimit(request, "run-demo", 120, 10 * 60_000) : rateLimit(request, "run", 40, 10 * 60_000);
  if (limited) return limited;
  const shared = demo ? null : await sharedLimit(RUN_IP, `run:${clientIp(request)}`);
  if (shared) return shared;

  // Only known fields, with every string and list capped, go into the prompts.
  const req: RunRequest = {
    phase: body.phase,
    domain: body.domain.toLowerCase(),
    industry: clip(body.industry, 40) ?? "other",
    goal: clip(body.goal, 300),
    demo,
    unlock: typeof body.unlock === "string" ? body.unlock : undefined,
    profile: body.profile && typeof body.profile === "object" ? clipDeep(body.profile) : undefined,
    competitors: body.competitors && typeof body.competitors === "object" ? clipDeep(body.competitors) : undefined,
    segment: body.segment && typeof body.segment === "object" && typeof body.segment.id === "string" ? clipDeep(body.segment) : undefined,
    accounts: Array.isArray(body.accounts) ? clipDeep(body.accounts, { arr: MAX_ACCOUNTS }) : undefined,
    market: body.market,
  };
  if ((req.phase === "accounts" || req.phase === "outreach") && !req.segment) {
    return Response.json({ error: "Pick a segment first" }, { status: 400 });
  }
  req.market = sanitizeMarket(req.market);

  // The brand profile is free to try; every later step needs an account.
  const user = req.phase !== "profile" && !req.demo ? await currentUser(request) : null;
  if (req.phase !== "profile" && !req.demo && !user) {
    return Response.json({ error: "Create a free account to continue.", signIn: true }, { status: 401 });
  }

  // Decision makers and outreach need a Starter or Pro subscription, whose plan sets the limits.
  // A campaign bought before subscriptions (a signed unlock token) keeps working.
  // Demo runs only ever return sample data.
  req.limits = undefined;
  if (isPaidPhase(req.phase) && !req.demo) {
    const plan = user ? await entitlement(user.id) : "free";
    if (plan !== "free") {
      const p = planOf(plan);
      req.limits = { accounts: p.accounts, people: p.peoplePerAccount, verifiedEmails: p.verifiedEmails };
    } else {
      const tier = verifyUnlock(req.unlock, req.domain, req.segment?.id);
      if (!tier) return Response.json({ error: "Subscribe to Starter or Pro to see decision makers.", subscribe: true }, { status: 402 });
      const t = TIERS[tier];
      req.limits = { accounts: t.accounts, people: t.peoplePerAccount, verifiedEmails: t.verifiedEmails };
    }
  }

  // For the admin dashboard: which research steps people start, on which brands.
  if (!req.demo && !isAdmin(user)) await recordEvent(request, "search", req.phase, req.domain);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: RunEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        const engine = req.demo ? null : provider();
        const data = engine === "gemini" ? await runGeminiPhase(req, emit) : engine === "claude" ? await runPhase(req, emit) : await runDemo(req, emit);
        emit({ type: "result", data });
      } catch (err) {
        console.error(`[run:${req.phase}]`, operatorHint(err), err);
        emit({ type: "error", message: friendlyError(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// Users only ever see plain words about Scout; provider details stay in the server log above.
function friendlyError(err: unknown) {
  const status = err instanceof ApiError || err instanceof Anthropic.APIError ? Number(err.status) || 0 : 0;
  if (status === 429) return "Scout is handling a lot of research right now. Try again in a minute.";
  if (status >= 500) return "Scout is busy right now. Try again in a moment.";
  if (status >= 400) return "Research is temporarily unavailable. Please try again shortly.";
  return userMessage(err);
}

// Detailed reason for the operator, printed in the server log only.
function operatorHint(err: unknown) {
  if (err instanceof ApiError) {
    if (err.status === 429) return "Gemini's quota for this key is used up for now. Wait a minute, or enable billing for the key in Google AI Studio for higher limits.";
    if (err.status === 400 && /api key/i.test(err.message)) return "The Gemini API key was rejected. Check GEMINI_API_KEY in .env.local.";
    if (err.status === 401 || err.status === 403) return "The Gemini API key was rejected. Check GEMINI_API_KEY in .env.local.";
    if (err.status >= 500) return "Gemini is busy right now. Try again in a moment.";
    return "Gemini couldn't complete this step. Try again.";
  }
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local.";
  if (err instanceof Anthropic.RateLimitError) return "Too many requests right now. Wait a minute and try again.";
  if (err instanceof Anthropic.APIError) {
    const body = err.error as { error?: { message?: string } } | undefined;
    const message = body?.error?.message ?? err.message;
    if (/credit balance/i.test(message)) return "The Anthropic account is out of credits. Add credits in the Anthropic Console (Plans & Billing), then try again.";
    if (err.status && err.status >= 500) return "The research service is busy. Try again in a moment.";
    return message;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

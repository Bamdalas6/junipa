import { sanitizeMarket } from "@/lib/geo";
import { badRequest, clientIp, clip, rateLimit, readJson, userMessage } from "@/lib/guard";
import { RUN_IP, sharedLimit } from "@/lib/ratelimit";
import { SOCIAL, handlesKey, seal, verifySocial } from "@/lib/payments";
import type { RunEvent, SocialRequest } from "@/lib/schema";
import { runSocial } from "@/lib/social";
import { isPlatform, parseHandle } from "@/lib/social-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

// Streams newline-delimited JSON like /api/run: progress logs, then { profiles, plan } or an error.
export async function POST(request: Request) {
  let body: SocialRequest & { unlock?: string };
  try {
    body = await readJson<SocialRequest & { unlock?: string }>(request, 20_000);
  } catch (err) {
    return badRequest(err)!;
  }
  const limited = body.demo === true ? rateLimit(request, "social-demo", 60, 10 * 60_000) : rateLimit(request, "social", 15, 10 * 60_000);
  if (limited) return limited;
  const shared = body.demo === true ? null : await sharedLimit(RUN_IP, `social:${clientIp(request)}`);
  if (shared) return shared;
  const token = typeof body.unlock === "string" ? body.unlock : undefined;
  const handles = (Array.isArray(body.handles) ? body.handles.slice(0, 6) : [])
    .filter((h) => isPlatform(h?.platform))
    .map((h) => {
      const parsed = parseHandle(String(h.handle ?? ""), h.platform);
      return parsed ? { platform: h.platform, handle: parsed.handle, followers: clip(h.followers, 20), postsPerWeek: clip(h.postsPerWeek, 20) } : null;
    })
    .filter((h): h is NonNullable<typeof h> => !!h);
  if (handles.length === 0) return Response.json({ error: "Add at least one social handle." }, { status: 400 });

  const req: SocialRequest = {
    handles,
    industry: clip(body.industry, 40) ?? "",
    market: sanitizeMarket(body.market),
    goal: clip(body.goal, 200),
    brand: clip(body.brand, 80),
    about: clip(body.about, 300),
    demo: body.demo === true,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: RunEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        const { profiles, plan } = await runSocial(req, emit);
        const key = handlesKey(req.handles);
        if (verifySocial(token, key)) {
          emit({ type: "result", data: { key, unlocked: true, profiles, plan } });
        } else {
          // Free preview: the diagnosis and each account's score. The rest stays sealed until payment.
          const preview = {
            summary: plan.summary,
            audits: plan.audits.map(({ platform, handle, score, verdict }) => ({ platform, handle, score, verdict })),
            counts: { pillars: plan.pillars.length, hooks: plan.hooks.length, hashtags: plan.hashtags.length, collabs: plan.collabs.length, weeks: plan.plan.length },
          };
          emit({ type: "result", data: { key, unlocked: false, price: SOCIAL.price, profiles, preview, sealed: seal({ key, plan }) } });
        }
      } catch (err) {
        console.error("[social]", err);
        const status = Number((err as { status?: unknown })?.status) || 0;
        emit({
          type: "error",
          message:
            status === 429
              ? "Scout is handling a lot of requests right now. Try again in a minute."
              : status >= 400
                ? "Planning is temporarily unavailable. Please try again shortly."
                : userMessage(err),
        });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

import { readPublicProfile } from "./detect";
import { claudeJson, provider } from "./engine";
import { geminiJson } from "./engine-gemini";
import { describeMarket } from "./geo";
import { getIndustry } from "./industries";
import { SocialPlanSchema, type ProfileRead, type RunEvent, type SocialPlan, type SocialRequest } from "./schema";
import { PLATFORMS, profileUrl } from "./social-shared";

// Social growth: read whatever each public profile shows, then write a
// growth plan for the brand's niche and market. Never invents stats.

type Emit = (e: RunEvent) => void;

const STRATEGIST = `You are Junipa's social media growth strategist for small and growing brands.
Rules:
- Base the audit only on the information given. Never invent follower counts, engagement rates, past posts or results.
- When data is missing, say what to check instead of guessing, and keep the score moderate.
- Stats that a platform keeps private are a limit of what Junipa can see, not a weakness of the account. Never mention hidden or unavailable data, never blame the account for it and never lower a score because of it. If you can't see an account's posts, don't describe it as empty, new or a blank slate.
- Be specific to this brand, its products, its niche and its target market: local culture, language, holidays, time zone and how people there buy (e.g. DMs, WhatsApp, links).
- Prefer tactics that cost little: content, collaborations, community, replies and DMs. No buying followers or engagement pods.
- Short, plain sentences a busy founder can act on today.`;

const label = (p: string) => PLATFORMS.find((x) => x.id === p)?.label ?? p;

export async function runSocial(req: SocialRequest, emit: Emit): Promise<{ profiles: ProfileRead[]; plan: SocialPlan }> {
  const handles = req.handles.slice(0, 6);
  emit({ type: "log", kind: "think", text: `Opening ${handles.length} profile${handles.length === 1 ? "" : "s"}` });

  const profiles: ProfileRead[] = await Promise.all(
    handles.map(async (h) => {
      const url = profileUrl(h.platform, h.handle);
      emit({ type: "log", kind: "fetch", text: `Reading ${label(h.platform)} ${h.platform === "linkedin" ? h.handle : `@${h.handle}`}` });
      const r = await readPublicProfile(url);
      return { platform: h.platform, handle: h.handle, url, ...r };
    }),
  );
  const readable = profiles.filter((p) => p.readable).length;
  emit({ type: "log", kind: "think", text: `${readable} of ${profiles.length} profiles share public info` });

  const engine = req.demo ? null : provider();
  emit({ type: "log", kind: "think", text: "Auditing each account" });
  emit({ type: "log", kind: "done", text: "Planning content pillars and a 30-day calendar" });

  if (!engine) return { profiles, plan: demoPlan(req) };

  const ind = req.industry ? getIndustry(req.industry) : null;
  const accounts = handles
    .map((h, i) => {
      const p = profiles[i];
      const pub = p.readable ? [p.followers && `${p.followers}`, p.bio && `bio: "${p.bio}"`].filter(Boolean).join("; ") || "page readable, no stats shown" : "not available to Junipa (normal for this platform, not a problem with the account)";
      const own = [h.followers && `${h.followers} followers`, h.postsPerWeek && `posts ${h.postsPerWeek} times a week`].filter(Boolean).join(", ");
      return `- ${label(h.platform)} @${h.handle}. Public data: ${pub}.${own ? ` Owner says: ${own}.` : ""}`;
    })
    .join("\n");

  const prompt = [
    `Brand: ${req.brand || "(not given)"}${req.about ? `. About: ${req.about}` : ""}`,
    ind
      ? `Industry: ${ind.label}. Typical buyers: ${ind.buyers}. Channels that usually work: ${ind.channels}.`
      : "Industry: not given. Work out the niche from the brand name, handles and any bio, and say in the summary what you assumed.",
    `Target market: ${req.market ? describeMarket(req.market) : "the brand's home market"}`,
    `Goal: ${req.goal || "grow an engaged audience that turns into customers"}`,
    `Accounts:\n${accounts}`,
    "",
    "Write the growth plan. Audit every account listed above and only those. Give a cadence entry for each listed platform only. " +
      "Use best posting times in the target market's local time zone. Week numbers in the plan run 1 to 4.",
  ].join("\n");

  const plan = engine === "gemini" ? await geminiJson(SocialPlanSchema, STRATEGIST, prompt) : await claudeJson(SocialPlanSchema, STRATEGIST, prompt);
  const listed = new Set(handles.map((h) => `${h.platform}:${h.handle.toLowerCase()}`));
  return {
    profiles,
    plan: {
      ...plan,
      audits: plan.audits
        .filter((a) => listed.has(`${a.platform}:${a.handle.replace(/^@/, "").toLowerCase()}`) || handles.some((h) => h.platform === a.platform))
        .map((a) => ({ ...a, handle: a.handle.replace(/^@/, ""), score: Math.max(0, Math.min(100, Math.round(a.score))) })),
      cadence: plan.cadence.filter((c) => handles.some((h) => h.platform === c.platform)),
    },
  };
}

/** Sample plan for demo mode (no AI call). */
function demoPlan(req: SocialRequest): SocialPlan {
  const where = req.market ? describeMarket(req.market) : "your market";
  return {
    summary: `Your accounts have a clear look but post too rarely to be pushed by the algorithm. The biggest opportunity is short try-on and styling videos, posted consistently, with a simple way to order by DM in ${where}.`,
    audits: req.handles.map((h, i) => ({
      platform: h.platform,
      handle: h.handle,
      score: [62, 48, 55, 40, 50, 45][i % 6],
      verdict: i === 0 ? "Strong visuals, weak consistency and no clear call to action" : "Underused: repost your best short videos here",
      strengths: ["Consistent brand colours", "Good product photography"],
      fixes: ["Add a one-line promise and a DM/WhatsApp order link to the bio", "Post 4 short videos a week instead of single photos", "Pin 3 posts: bestseller, how to order, customer reviews"],
      bio: "Bold everyday pieces made in Lagos ✦ Same-week delivery ✦ DM or tap to order 👇",
    })),
    pillars: [
      { name: "Try-ons & styling", why: "Shows fit and movement, the top questions before buying", ideas: ["1 piece, 3 ways", "Size S vs L on real people", "Owambe outfit in 30 seconds"] },
      { name: "Behind the seams", why: "Builds trust and justifies premium prices", ideas: ["Fabric sourcing day", "Cutting a pattern timelapse", "Meet the tailor"] },
      { name: "Customer spotlights", why: "Social proof converts browsers", ideas: ["Repost buyers' photos weekly", "Unboxing reactions", "Before-event fittings"] },
    ],
    cadence: req.handles.map((h) => ({
      platform: h.platform,
      perWeek: h.platform === "tiktok" ? "5 videos" : h.platform === "instagram" ? "4 Reels + daily Stories" : "2-3 posts",
      formats: h.platform === "instagram" ? ["Reels", "Carousels", "Stories with polls"] : ["Short videos", "Photo posts"],
      bestTimes: "Tue-Thu 7-9pm local time",
    })),
    hooks: [
      "This dress has sold out 3 times. Here's why.",
      "Stop wearing the same outfit to every owambe.",
      "How it fits on a size 16 vs a size 8",
      "We made this from one yard of fabric",
      "3 ways to wear our bestseller this week",
      "The outfit our customers keep asking about",
      "POV: you ordered on Monday, wore it Saturday",
      "Don't buy a two-piece until you see this",
      "Rating our pieces from 'everyday' to 'event'",
      "What ₦50k gets you at our studio",
    ],
    hashtags: ["#lagosfashion", "#naijafashion", "#owambestyle", "#asoebi", "#madeinnigeria", "#africanfashion", "#ootdlagos", "#lagosbrand", "#ankarastyles", "#readytowear", "#styleinspo", "#fashionreels", "#lagosstylist", "#nigeriandesigner", "#shoplocal"],
    collabs: [
      { who: "Micro-influencers (5-30K followers)", idea: "Gift a piece for a styling video with a discount code" },
      { who: "Wedding planners", idea: "Co-host a 'what to wear' guide for their couples' guests" },
      { who: "Photographers", idea: "Free outfit for a shoot in exchange for usage rights" },
      { who: "Complementary brands (shoes, bags)", idea: "Joint giveaway that grows both audiences" },
    ],
    plan: [
      { week: 1, focus: "Fix the profile", tasks: ["Rewrite bios and add order links", "Pin 3 posts", "Set up story highlights: Shop, Sizes, Reviews"] },
      { week: 2, focus: "Start the video habit", tasks: ["Post 4 try-on Reels", "Reply to every comment within 2 hours", "Collect 5 customer photos"] },
      { week: 3, focus: "Borrow audiences", tasks: ["Send 10 gifting DMs to micro-influencers", "Run one collab post", "Go live for a 20-minute try-on"] },
      { week: 4, focus: "Convert", tasks: ["Post a limited drop with a deadline", "Share 3 customer spotlights", "Review which hooks got the most saves"] },
    ],
    kpis: [
      { metric: "Followers", target: "+10-15% in 30 days" },
      { metric: "Reel average views", target: "2× your follower count" },
      { metric: "Saves per post", target: "3%+ of reach" },
      { metric: "DM enquiries", target: "15+ a week" },
    ],
  };
}

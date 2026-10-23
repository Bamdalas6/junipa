import { countryName } from "./geo";
import { getIndustry } from "./industries";
import type { Account, Competitors, Contacts, Outreach, Profile, RunEvent, RunRequest, Segments } from "./schema";

// Demo mode: runs without an API key. Every company and person here is
// fictional (".example" domains) and the UI labels it as sample data.

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function brandName(domain: string) {
  const base = domain.replace(/^www\./, "").split(".")[0] ?? domain;
  return base
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const SCRIPTS: Record<string, string[]> = {
  profile: ["Opening {domain}", 'Searching "{name} instagram"', "Reading {domain}/about", "Found 9 results", "Writing the brand profile"],
  competitors: ['Searching "{short} brands like {name}"', 'Searching "best {short} labels {country}"', "Found 12 results", "Reading 4 competitor sites", "Ranking competitors by overlap"],
  segments: ["Clustering buyer groups from the profile and competitors", "Estimating reachable accounts", "Writing hooks for each segment"],
  accounts: ['Searching "{segment} {country}"', "Found 14 results", 'Searching "{segment} instagram {country}"', "Checking recent activity", "Scoring accounts"],
  contacts: ["Reading team and about pages", 'Searching "founder" on LinkedIn', "Found 18 results", "Matching people to accounts"],
  outreach: ["Writing a sequence for {segment}", "Tuning tone to the segment", "Adding follow-ups"],
};

export async function runDemo(req: RunRequest, emit: (e: RunEvent) => void): Promise<unknown> {
  const ind = getIndustry(req.industry);
  const name = req.profile?.name ?? brandName(req.domain);
  const vars: Record<string, string> = {
    domain: req.domain,
    name,
    short: ind.short.toLowerCase(),
    country: req.market?.scope === "worldwide" ? "worldwide" : req.market?.region || countryName(req.market?.country) || "Lagos",
    segment: req.segment?.name.toLowerCase() ?? "",
  };
  for (const line of SCRIPTS[req.phase]) {
    await wait(550 + Math.random() * 500);
    const text = line.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
    emit({ type: "log", kind: line.startsWith("Searching") ? "search" : line.startsWith("Reading") ? "fetch" : "think", text });
  }
  await wait(400);

  switch (req.phase) {
    case "profile":
      return demoProfile(req.domain, name, ind.id);
    case "competitors":
      return demoCompetitors();
    case "segments":
      return demoSegments(ind.id);
    case "accounts":
      return demoAccounts(req.segment?.name ?? "Prospects");
    case "contacts":
      return demoContacts(req.accounts ?? []);
    case "outreach":
      return demoOutreach(req.segment?.bestChannel ?? "instagram", name);
  }
}

function demoProfile(domain: string, name: string, industry: string): Profile {
  const fashion = industry === "fashion";
  return {
    name,
    oneLiner: fashion
      ? "Contemporary ready-to-wear and occasion pieces for confident city women"
      : `A ${getIndustry(industry).short.toLowerCase()} business serving growing companies`,
    description: fashion
      ? `${name} designs modern African ready-to-wear with bold prints and clean tailoring. It sells online and through Instagram, with made-to-order occasion wear for weddings and events.`
      : `${name} offers a focused service to small and mid-size businesses, selling mostly through referrals and its website.`,
    category: fashion ? "Womenswear label" : getIndustry(industry).label,
    country: "Nigeria",
    countryCode: "NG",
    priceTier: "premium",
    offerings: fashion
      ? ["Ready-to-wear dresses", "Two-piece sets", "Occasion wear", "Made-to-measure", "Accessories"]
      : ["Core service", "Monthly retainer", "Strategy workshop"],
    channels: fashion ? ["Own website", "Instagram shop", "WhatsApp orders", "Pop-ups"] : ["Website", "Referrals", "LinkedIn"],
    socials: [
      { platform: "Instagram", url: `https://instagram.com/${name.toLowerCase()}` },
      { platform: "Website", url: `https://${domain}` },
    ],
    keywords: fashion
      ? ["ankara dresses", "lagos fashion brand", "owambe outfits", "african print two piece", "made to measure lagos", "nigerian designer dresses", "wedding guest outfits"]
      : ["outsourced sales", "lead generation", "b2b growth", "sales consulting"],
    strengths: fashion
      ? ["Distinct print-led design language", "Strong Instagram imagery", "Made-to-measure option"]
      : ["Clear niche", "Founder-led service"],
    gaps: fashion
      ? ["No wholesale or stockist programme", "Few creator collaborations", "Diaspora shipping not promoted"]
      : ["No outbound engine", "Thin case studies"],
  };
}

function demoCompetitors(): Competitors {
  const rows: [string, string, string, string, Competitors["competitors"][number]["priceTier"], "high" | "medium" | "low"][] = [
    ["Atelier Nova", "Lagos", "Minimal luxury tailoring for executives", "Same premium buyer, cleaner look", "luxury", "high"],
    ["Ìfẹ́ Studio", "Lagos", "Print-led party wear with fast drops", "Same owambe occasion market", "mid", "high"],
    ["Kora & Thread", "Abuja", "Made-to-measure bridal and aso-ebi", "Competes on group orders", "premium", "medium"],
    ["Sunday Muse", "Accra", "Resort wear for the diaspora", "Targets the same diaspora shoppers", "premium", "medium"],
    ["Okun Label", "Lagos", "Affordable everyday ankara basics", "Overlaps on entry pieces", "budget", "low"],
    ["Maison Adire", "London", "Adire textiles for global stores", "Wins concept-store shelf space", "luxury", "medium"],
    ["Ruby & Raffia", "Nairobi", "Handmade accessories and sets", "Shares stockists", "mid", "low"],
    ["Velvet Calabash", "Lagos", "Evening wear for red carpets", "Courts the same stylists", "luxury", "high"],
  ];
  return {
    summary: "A crowded premium occasion-wear market in Lagos, with a few labels already selling into concept stores and the diaspora.",
    whitespace: "Print-led pieces with reliable group-order delivery and a proper stockist programme.",
    competitors: rows.map(([name, location, positioning, overlap, priceTier, threat]) => ({
      name,
      domain: `${name.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}.example`,
      location,
      positioning,
      overlap,
      priceTier,
      threat,
    })),
  };
}

function demoSegments(industry: string): Segments {
  const counts = ["1.4K", "900", "820", "640", "2.1K", "3.5K"];
  return {
    segments: getIndustry(industry).demoSegments.map((s, i) => ({
      id: s.name.toLowerCase().replace(/[^a-z]+/g, "-"),
      name: s.name,
      emoji: s.emoji,
      estimatedAccounts: counts[i % counts.length],
      job: s.job,
      pain: s.pain,
      angle: s.angle,
      bestChannel: s.channel as Segments["segments"][number]["bestChannel"],
      fit: i < 2 ? "strong" : i < 4 ? "good" : "experimental",
    })),
  };
}

function demoAccounts(segment: string): { accounts: Account[] } {
  const names = ["The Edit Room", "Kemi & Co Concept", "Lekki Loft Store", "Bloom Closet", "Orange Door Boutique", "Ivory House", "Market Twelve", "Studio Ẹwà", "Gallery 9", "Palm Row Stores"];
  const cities = ["Lekki, Lagos", "Ikoyi, Lagos", "Victoria Island", "Abuja", "Yaba, Lagos", "Port Harcourt"];
  const signals = ["Opened a second store last month", "Posted a call for new local labels", "Hosting a pop-up in December", "", "Launched online shop this week", ""];
  return {
    accounts: names.map((name, i) => {
      const slug = name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
      return {
        name,
        website: `${slug}.example`,
        instagram: slug,
        location: cities[i % cities.length],
        size: i % 3 === 0 ? "2 stores" : i % 3 === 1 ? "1 store · 18K followers" : "1 store · 6K followers",
        why: i % 2 ? "Stocks 20+ local labels and posts new arrivals weekly" : `Well-known among ${segment.toLowerCase()} for premium local pieces`,
        signal: signals[i % signals.length],
        source: `https://${slug}.example`,
      };
    }),
  };
}

function demoContacts(accounts: Account[]): Contacts {
  const people = [
    ["Adaeze Okafor", "Founder & Buyer"],
    ["Tolu Bankole", "Creative Director"],
    ["Ngozi Eze", "Owner"],
    ["Seyi Adebayo", "Head of Merchandising"],
    ["Ifeoma Nwosu", "Co-founder"],
    ["Bisi Lawal", "Store Manager"],
  ];
  const contacts = accounts.slice(0, 8).flatMap((a, i) => {
    const [name, role] = people[i % people.length];
    const first = name.split(" ")[0].toLowerCase();
    return [{
      account: a.name,
      name,
      role,
      linkedin: "",
      email: i % 2 === 0 ? `${first}@${a.website}` : "",
      source: a.source,
      emailStatus: (i % 2 === 0 ? "verified" : "none") as "verified" | "none",
    }];
  });
  return { contacts, rolesToTarget: ["Founder / Owner", "Buyer", "Creative Director", "Merchandising Lead"] };
}

function demoOutreach(channel: string, brand: string): Outreach {
  const first = channel === "email" || channel === "linkedin" ? channel : channel;
  return {
    steps: [
      {
        day: 0,
        channel: first as Outreach["steps"][number]["channel"],
        subject: first === "email" ? `A capsule for {{company}}'s racks` : "",
        body: `Hi {{first_name}}, love how {{company}} mixes local labels. I'm the founder of ${brand}. We're picking 3 stores for a small consignment capsule this season, 12 pieces, no upfront cost. Could I send the lookbook?`,
        goal: "Open with the offer",
      },
      {
        day: 2,
        channel: "email",
        subject: `${brand} x {{company}}: lookbook + terms`,
        body: `Hi {{first_name}},\n\nFollowing my message, here's the lookbook and simple terms: 12 pieces on consignment, 35% margin for you, we restock bestsellers within 7 days and handle the content for your page.\n\nWould a 15-minute call on Thursday work, or should I drop samples at the store?\n\nThanks,\n${brand}`,
        goal: "Share proof and terms",
      },
      {
        day: 5,
        channel: "whatsapp",
        subject: "",
        body: `Hi {{first_name}}, ${brand} here 👋 Just checking you saw the lookbook. Happy to bring 4 sample pieces by this week so you can feel the fabric. What day suits?`,
        goal: "Make it easy to say yes",
      },
      {
        day: 10,
        channel: "instagram",
        subject: "",
        body: `Last one from me, {{first_name}} 🙂 If now isn't the time, no stress. Want me to keep {{company}} on the list for our next drop in January?`,
        goal: "Polite close, keep the door open",
      },
    ],
    tips: ["Send DMs from the brand account, not a personal one", "Reply within an hour during store hours", "Bring samples: fabric sells better than photos"],
  };
}

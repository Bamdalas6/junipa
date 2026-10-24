// Industry presets steer every prompt: who usually buys, which channels work,
// and what "a good lead" means for that kind of business.

export interface Industry {
  id: string;
  label: string;
  short: string;
  emoji: string;
  buyers: string;
  channels: string;
  leadDefinition: string;
  demoSegments: { name: string; emoji: string; job: string; pain: string; angle: string; channel: string }[];
}

export const INDUSTRIES: Industry[] = [
  {
    id: "fashion",
    label: "Fashion & apparel",
    short: "Fashion",
    emoji: "👗",
    buyers:
      "multi-brand boutiques and concept stores (wholesale or consignment), stylists and image consultants, bridal and event planners, corporate and uniform buyers, creators and influencers, diaspora shoppers, pop-up and market organisers",
    channels: "Instagram DMs and WhatsApp first, then email; LinkedIn only for corporate buyers",
    leadDefinition:
      "a business or professional who could stock, style, wear at scale, collaborate with, or resell the brand's pieces",
    demoSegments: [
      { name: "Concept stores", emoji: "🛍️", job: "Fill racks with fresh local labels each season", pain: "Same brands everywhere make their store forgettable", angle: "Exclusive capsule or consignment drop for their floor", channel: "instagram" },
      { name: "Stylists", emoji: "✂️", job: "Pull standout looks for clients and shoots", pain: "Hard to source pieces that photograph well on short notice", angle: "Stylist pull list with loan and credit terms", channel: "instagram" },
      { name: "Event planners", emoji: "💍", job: "Dress wedding parties and corporate events", pain: "Matching outfits for big groups arrive late or uneven", angle: "Group orders with fittings and a fixed delivery date", channel: "whatsapp" },
      { name: "Corporate buyers", emoji: "🏢", job: "Outfit staff for brand events and front-of-house", pain: "Uniforms feel generic and off-brand", angle: "Custom branded workwear that staff want to wear", channel: "linkedin" },
      { name: "Creators", emoji: "📸", job: "Post fresh outfits their audience can shop", pain: "Repeating looks kills engagement", angle: "Gifted pieces plus an affiliate code", channel: "instagram" },
      { name: "Diaspora shoppers", emoji: "✈️", job: "Buy home-grown fashion for occasions abroad", pain: "Shipping and sizing feel risky from overseas", angle: "Size guide call and tracked express shipping", channel: "whatsapp" },
    ],
  },
  {
    id: "sales",
    label: "Sales & B2B services",
    short: "B2B sales",
    emoji: "🤝",
    buyers: "founders, heads of sales, revenue and operations leaders at small and mid-size companies",
    channels: "email and LinkedIn first, phone for warm leads",
    leadDefinition: "a company with a clear need and budget for the service, plus a named decision maker",
    demoSegments: [
      { name: "Seed-stage startups", emoji: "🚀", job: "Land first 20 paying customers", pain: "Founders sell alone with no repeatable process", angle: "Done-for-you outbound sprint", channel: "email" },
      { name: "Agencies", emoji: "🎨", job: "Keep the pipeline full between projects", pain: "Feast-or-famine revenue", angle: "Retainer pipeline built in 30 days", channel: "linkedin" },
      { name: "SaaS scale-ups", emoji: "📈", job: "Hit quarterly pipeline targets", pain: "SDR team ramps too slowly", angle: "Plug-in SDR pod", channel: "email" },
      { name: "Professional firms", emoji: "⚖️", job: "Win bigger clients", pain: "Rely on referrals only", angle: "Account-based outreach to 50 dream clients", channel: "email" },
    ],
  },
  {
    id: "beauty",
    label: "Beauty & cosmetics",
    short: "Beauty",
    emoji: "💄",
    buyers: "salons, spas, makeup artists, pharmacies and beauty retailers, creators, bridal artists",
    channels: "Instagram and WhatsApp first, then email",
    leadDefinition: "a business or artist who could stock, use or promote the products",
    demoSegments: [
      { name: "Salons & spas", emoji: "💆", job: "Upsell retail products after treatments", pain: "Shelf products don't move", angle: "Starter retail kit with display", channel: "whatsapp" },
      { name: "Makeup artists", emoji: "🖌️", job: "Build a reliable kit", pain: "Products that fail under flash", angle: "Pro discount and kit samples", channel: "instagram" },
      { name: "Beauty retailers", emoji: "🏬", job: "Stock fast-moving local brands", pain: "Imported stock is slow and pricey", angle: "Wholesale price list and sell-through data", channel: "email" },
    ],
  },
  {
    id: "food",
    label: "Food & hospitality",
    short: "Food",
    emoji: "🍲",
    buyers: "offices, event planners, hotels, schools, caterers, retailers and supermarkets",
    channels: "WhatsApp and phone first, then email",
    leadDefinition: "an organisation that orders food regularly or could stock the product",
    demoSegments: [
      { name: "Office managers", emoji: "🗂️", job: "Feed teams for meetings and Fridays", pain: "Late deliveries embarrass them", angle: "Fixed-time office platters", channel: "email" },
      { name: "Event planners", emoji: "🎉", job: "Cater weddings and parties", pain: "Vendors cancel last minute", angle: "Guaranteed slot with tasting", channel: "whatsapp" },
      { name: "Supermarkets", emoji: "🛒", job: "Stock local favourites", pain: "Inconsistent supply", angle: "Weekly supply schedule", channel: "phone" },
    ],
  },
  {
    id: "agency",
    label: "Creative & marketing agency",
    short: "Agency",
    emoji: "🎬",
    buyers: "founders, marketing leads and brand managers at growing companies",
    channels: "email, Instagram and LinkedIn",
    leadDefinition: "a company launching, rebranding or marketing actively, with a named decision maker",
    demoSegments: [
      { name: "Fashion brands", emoji: "👗", job: "Launch new collections", pain: "Visuals look dated next to competitors", angle: "Campaign shoot and launch kit", channel: "instagram" },
      { name: "Event promoters", emoji: "🎤", job: "Sell out shows", pain: "Promos don't stop the scroll", angle: "48-hour flyer and motion pack", channel: "instagram" },
      { name: "Startups", emoji: "🚀", job: "Look credible before traction", pain: "DIY brand undermines trust", angle: "Brand sprint in two weeks", channel: "email" },
    ],
  },
  {
    id: "realestate",
    label: "Real estate",
    short: "Real estate",
    emoji: "🏠",
    buyers: "home buyers, investors, relocating professionals, diaspora buyers, companies leasing space",
    channels: "WhatsApp and Instagram first, email for investors and companies",
    leadDefinition: "a person or company actively looking to buy, rent or invest",
    demoSegments: [
      { name: "Diaspora investors", emoji: "✈️", job: "Own property back home safely", pain: "Fear of fraud from afar", angle: "Verified listings with video tours", channel: "whatsapp" },
      { name: "Relocating staff", emoji: "🧳", job: "Find a home fast", pain: "Too many unverified agents", angle: "Shortlist in 48 hours", channel: "email" },
      { name: "SMEs leasing", emoji: "🏢", job: "Find office or retail space", pain: "Spaces don't match listing photos", angle: "Same-week inspections", channel: "linkedin" },
    ],
  },
  {
    id: "saas",
    label: "Software & tech",
    short: "Software",
    emoji: "💻",
    buyers: "operators, team leads and executives in the departments the product serves",
    channels: "email and LinkedIn",
    leadDefinition: "a company with the problem the product solves, plus a named buyer",
    demoSegments: [
      { name: "Ops teams", emoji: "⚙️", job: "Remove manual work", pain: "Spreadsheets break at scale", angle: "Automate one workflow in a week", channel: "email" },
      { name: "Finance leads", emoji: "💳", job: "Close the books faster", pain: "Reconciliation eats days", angle: "Benchmark of close time", channel: "linkedin" },
      { name: "Founders", emoji: "🧑‍💼", job: "Do more with a small team", pain: "Too many tools", angle: "Replace three tools with one", channel: "email" },
    ],
  },
  {
    id: "other",
    label: "Something else",
    short: "Other",
    emoji: "✨",
    buyers: "whoever is most likely to pay for this business's offer",
    channels: "whichever channels the buyers actually use",
    leadDefinition: "an organisation or professional with a clear need for the offer",
    demoSegments: [
      { name: "Small businesses", emoji: "🏪", job: "Grow revenue", pain: "No time for marketing", angle: "Quick win in 7 days", channel: "whatsapp" },
      { name: "Mid-size companies", emoji: "🏢", job: "Scale a function", pain: "Hiring is slow", angle: "Flexible service plan", channel: "email" },
      { name: "Creators", emoji: "📸", job: "Monetise an audience", pain: "Inconsistent income", angle: "Partnership offer", channel: "instagram" },
    ],
  },
];

export function getIndustry(id: string | undefined): Industry {
  // Unknown ids get the neutral profile, so research isn't steered towards one industry.
  return INDUSTRIES.find((i) => i.id === id) ?? INDUSTRIES.find((i) => i.id === "other")!;
}

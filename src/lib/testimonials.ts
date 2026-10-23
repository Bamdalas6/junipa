// Customer testimonials shown on the landing page.
//
// Only add REAL quotes, from real customers, with their permission to publish
// their name, role and company. Invented testimonials are illegal in the US
// (FTC rule on fake reviews) and the EU, and buyers can tell.
//
// If the customer got something in return (for example the founding-customer
// discount), set `incentive` so the card discloses it, e.g. "Founding customer
// (received a discount)". Up to 20 are shown, in this order.

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  company: string;
  country?: string; // e.g. "US", "GB", "DE"
  photo?: string; // optional URL; initials are used otherwise
  incentive?: string;
}

export const TESTIMONIALS: Testimonial[] = [
  // {
  //   quote: "Scout found 14 boutiques that stock labels like ours, and three replied in the first week.",
  //   name: "Full Name",
  //   role: "Founder",
  //   company: "Company",
  //   country: "US",
  //   incentive: "Founding customer (received a discount)",
  // },
];

/** Placeholder cards so the layout can be reviewed on your computer. Never shown on the live site. */
export const SAMPLE_TESTIMONIALS: Testimonial[] = Array.from({ length: 20 }, (_, i) => ({
  quote: [
    "Sample quote. Replace with what a real customer said about Junia.",
    "Sample quote. A longer one, to check how two or three lines sit in the card next to shorter quotes in the same row.",
    "Sample quote. Short and specific results read best: what they found, how fast, what happened next.",
    "Sample.",
  ][i % 4],
  name: `Customer ${i + 1}`,
  role: "Role",
  company: "Company",
  incentive: i % 5 === 0 ? "Founding customer (received a discount)" : undefined,
}));

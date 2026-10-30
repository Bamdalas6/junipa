import type { MetadataRoute } from "next";

// The public pages search engines should know about. Workspaces, billing and
// the owner dashboard are private, so they stay out (see robots.ts).
const SITE = "https://junipa.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/social`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
}

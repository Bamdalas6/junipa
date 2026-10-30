import type { MetadataRoute } from "next";

// Cloudflare adds its content-signal notes above these rules on the live site.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/w/", "/billing", "/pay/", "/reset-password"] },
    sitemap: "https://junipa.app/sitemap.xml",
  };
}

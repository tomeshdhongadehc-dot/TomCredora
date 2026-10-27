import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Crawlers may read the public pages. The tool pages hold no content of their own, and the API is not for crawling. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/studio", "/build", "/quick", "/profile", "/signin", "/signup"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

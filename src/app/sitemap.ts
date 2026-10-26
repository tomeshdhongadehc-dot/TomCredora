import type { MetadataRoute } from "next";
import { LEGAL_UPDATED, PUBLIC_PATHS, SITE_URL } from "@/lib/site";

const legalDate = new Date(LEGAL_UPDATED);
const priority = (p: string) => (p === "/" ? 1 : p.startsWith("/guides") || p === "/ats-resume-templates" ? 0.8 : 0.3);

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((p) => ({
    url: `${SITE_URL}${p === "/" ? "" : p}`,
    lastModified: Number.isNaN(legalDate.getTime()) ? new Date() : legalDate,
    changeFrequency: p === "/" ? "weekly" : "monthly",
    priority: priority(p),
  }));
}

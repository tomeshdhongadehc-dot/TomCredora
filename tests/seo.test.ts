import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JsonLd } from "@/components/JsonLd";
import { articleLd, breadcrumbLd, faqLd, noIndexMeta, pageMeta, webAppLd } from "@/lib/seo";
import { HOME_TITLE, PUBLIC_PATHS } from "@/lib/site";

describe("page metadata", () => {
  it("every page names its own canonical address and keeps the share image", () => {
    const m = pageMeta({ title: "T", description: "D", path: "/guides/x" });
    expect(m.alternates?.canonical).toBe("/guides/x");
    expect((m.openGraph as { url: string }).url).toBe("/guides/x");
    expect((m.openGraph as { images: { url: string; width: number; height: number }[] }).images[0]).toMatchObject({ url: "/opengraph-image", width: 1200, height: 630 });
    expect((m.twitter as { card: string }).card).toBe("summary_large_image");
  });

  it("tool pages are noindex", () => {
    expect(noIndexMeta("Workspace").robots).toEqual({ index: false, follow: false });
  });

  it("the home title fits a search result", () => {
    expect(HOME_TITLE.length).toBeLessThanOrEqual(60);
  });

  it("the public pages list is unique and starts with the home page", () => {
    expect(new Set(PUBLIC_PATHS).size).toBe(PUBLIC_PATHS.length);
    expect(PUBLIC_PATHS[0]).toBe("/");
  });
});

describe("structured data", () => {
  it("breadcrumbs are numbered from 1 and use absolute addresses", () => {
    const b = breadcrumbLd([
      { name: "Home", path: "/" },
      { name: "Guide", path: "/guides/a" },
    ]);
    expect(b.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    expect(b.itemListElement[1].item).toMatch(/^https?:\/\/.+\/guides\/a$/);
  });

  it("an FAQ lists each question with its answer", () => {
    const f = faqLd([{ q: "Q1?", a: "A1." }]);
    expect(f.mainEntity[0]).toMatchObject({ "@type": "Question", name: "Q1?", acceptedAnswer: { text: "A1." } });
  });

  it("never claims ratings or reviews", () => {
    for (const d of [webAppLd(), articleLd({ title: "T", description: "D", path: "/a", published: "2026-01-01", modified: "2026-01-01" })]) {
      expect(JSON.stringify(d)).not.toMatch(/aggregateRating|ratingValue|reviewCount|"review"/);
    }
  });

  it("a '<' in the data can never close the script tag", () => {
    const html = renderToStaticMarkup(JsonLd({ data: { headline: "</script><script>alert(1)</script>" } }));
    expect(html).not.toContain("</script><script>");
    expect(html.match(/<\/script>/g)).toHaveLength(1); // only the real closing tag
    expect(html).toContain("\\u003c/script>");
  });
});

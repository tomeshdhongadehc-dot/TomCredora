import { describe, expect, it } from "vitest";
import { cleanName, isCustomId, parseCustomTemplates } from "@/lib/custom-templates";
import { presetById } from "@/lib/templates";

const good = (over: object = {}) => ({ id: "custom-abc12345", name: "My one-pager", config: presetById("slate").config, ...over });

describe("parseCustomTemplates (localStorage is untrusted)", () => {
  it("accepts valid saved templates and forces config.id to match the template id", () => {
    const [t] = parseCustomTemplates([good({ config: { ...presetById("slate").config, id: "something-else" } })]);
    expect(t.config.id).toBe("custom-abc12345");
    expect(t.name).toBe("My one-pager");
  });
  it("drops entries with bad ids, names, configs or duplicates", () => {
    const out = parseCustomTemplates([
      good({ id: "slate" }), // not a custom id
      good({ id: "custom-../../x" }),
      good({ name: "   " }),
      good({ name: 42 }),
      good({ config: { nope: 1 } }),
      good({ config: { ...presetById("slate").config, sectionTitles: { experience: "<script>" } } }),
      good({ id: "custom-keep1234" }),
      good({ id: "custom-keep1234" }), // duplicate id
      null,
      "string",
    ]);
    expect(out.map((t) => t.id)).toEqual(["custom-keep1234"]);
  });
  it("returns nothing for non-arrays and caps the list at 12", () => {
    expect(parseCustomTemplates({})).toEqual([]);
    expect(parseCustomTemplates(null)).toEqual([]);
    const many = Array.from({ length: 30 }, (_, i) => good({ id: `custom-id${String(i).padStart(4, "0")}` }));
    expect(parseCustomTemplates(many)).toHaveLength(12);
  });
  it("accepts configs saved before the custom-layout options existed (defaults fill in)", () => {
    const legacy: Record<string, unknown> = { ...presetById("classic").config };
    for (const k of ["hidden", "sectionTitles", "contactOrder", "contactSep", "contactLayout", "sectionGap"]) delete legacy[k];
    expect(parseCustomTemplates([good({ config: legacy })])).toHaveLength(1);
  });
});

describe("cleanName / isCustomId", () => {
  it("normalises whitespace, strips control characters and caps the length", () => {
    expect(cleanName("  My   template \n ")).toBe("My template");
    expect(cleanName("a\u0000b\u0007c")).toBe("abc");
    expect(cleanName("x".repeat(80))).toHaveLength(40);
  });
  it("only generated-looking ids are custom ids", () => {
    expect(isCustomId("custom-abc12345")).toBe(true);
    for (const id of ["classic", "custom-", "custom-ABC", "custom-<b>", "../custom-abc12345", "custom-" + "a".repeat(13)]) expect(isCustomId(id), id).toBe(false);
  });
});

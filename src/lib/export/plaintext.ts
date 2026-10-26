import { asciiPunctuation } from "@/lib/escape";
import type { Resume } from "@/lib/schema";
import { CONTACT_SEP, DEFAULT_CONFIG, contactParts, sectionTitle, visibleSections, type SectionId, type TemplateConfig } from "@/lib/templates";

const a = asciiPunctuation;

/** What an ATS "sees": linear text in reading order. Also the TXT export. */
export function renderPlainText(r: Resume, config: TemplateConfig = DEFAULT_CONFIG): string {
  const c = r.contact;
  const out: string[] = [a(c.fullName).toUpperCase()];
  if (c.headline) out.push(a(c.headline));
  const parts = contactParts(c, config);
  // plain text stays ASCII: the middle-dot separator becomes a pipe
  const sep = config.contactSep === "dot" ? " | " : CONTACT_SEP[config.contactSep];
  if (config.contactLayout === "stacked") out.push(...parts);
  else out.push(parts.join(sep));

  // A heading-less section (e.g. a short intro under the name) has no heading line here either.
  const titled = (id: SectionId) => (config.untitled.includes(id) ? "" : sectionTitle(config, id));
  const block = (title: string, lines: string[]) => {
    if (!lines.length) return;
    out.push("", ...(title ? [title.toUpperCase()] : []), ...lines);
  };

  const sections: Record<SectionId, () => void> = {
    summary: () => block(titled("summary"), r.summary ? [a(r.summary)] : []),
    skills: () => block(titled("skills"), r.skills.filter((g) => g.items.length).map((g) => `${a(g.label)}: ${g.items.map(a).join(", ")}`)),
    experience: () =>
      block(
        titled("experience"),
        r.experience.flatMap((e, i) => [
          ...(i ? [""] : []),
          [config.entryOrder === "role-first" ? e.role : e.company, config.entryOrder === "role-first" ? e.company : e.role, [e.start, e.end].filter(Boolean).join(" - ")]
            .filter(Boolean)
            .map(a)
            .join(" | "),
          ...e.bullets.filter(Boolean).map((b) => `- ${a(b)}`),
        ]),
      ),
    projects: () =>
      block(
        titled("projects"),
        r.projects.flatMap((p, i) => [
          ...(i ? [""] : []),
          `${a(p.name)}${p.tech.length ? " | " + p.tech.join(", ") : ""}`,
          ...p.bullets.filter(Boolean).map((b) => `- ${a(b)}`),
        ]),
      ),
    education: () => block(titled("education"), r.education.map((e) => `${a(e.degree)} | ${a(e.school)} | ${[e.start, e.end].filter(Boolean).join(" - ")}`)),
    certifications: () => block(titled("certifications"), r.certifications.map((x) => `- ${a(x)}`)),
  };
  visibleSections(config).forEach((id) => sections[id]());
  return out.join("\n") + "\n";
}

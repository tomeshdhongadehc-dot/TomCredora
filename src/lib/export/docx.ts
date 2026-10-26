import { AlignmentType, BorderStyle, Document, Packer, Paragraph, ShadingType, TabStopType, TextRun } from "docx";
import { asciiPunctuation } from "@/lib/escape";
import type { Resume } from "@/lib/schema";
import {
  ACCENTS, CONTACT_SEP, DEFAULT_CONFIG, FONTS, GAP_EM, NAME_EM, NAME_SPACING_EM, PAPER,
  contactParts, nameIsAccent, sectionTitle, skillLabelWidthEm, splitContact, tint, visibleSections, type SectionId, type TemplateConfig,
} from "@/lib/templates";

const a = asciiPunctuation;
const twips = (inches: number) => Math.round(inches * 1440);
const dates = (s: string, e: string) => [s, e].filter(Boolean).join(" - ");
const DASH = " — ";

/** Build the document (browser or Node). Single column, real paragraphs, no tables/images/text boxes. */
export function buildDocx(r: Resume, config: TemplateConfig = DEFAULT_CONFIG): Document {
  const font = FONTS[config.font].docx;
  const size = Math.round(config.sizePt * 2); // half-points
  const accent = ACCENTS[config.accent].slice(1);
  const width = twips(PAPER[config.paper].widthIn - 2 * config.marginIn);
  const line = Math.round(config.lineHeight * 240);
  const c = r.contact;
  const roleFirst = config.entryOrder === "role-first";

  // User text is normalised to ASCII punctuation; the em dash of "dash" layouts is written directly (see dash()).
  const run = (t: string, o: { bold?: boolean; italics?: boolean; size?: number; color?: string; smallCaps?: boolean; underline?: boolean } = {}) =>
    new TextRun({ text: a(t), font, size: o.size ?? size, bold: o.bold, italics: o.italics, color: o.color, smallCaps: o.smallCaps, underline: o.underline ? {} : undefined });
  /** A date: bold when the template says so. */
  const dateRun = (t: string) => run(t, { bold: config.dateWeight === "bold" });
  /** A contact detail: accent beats grey; underline is independent. */
  const contactRun = (t: string) => run(t, { color: config.headerBand ? "FFFFFF" : config.contactAccent ? accent : config.contactMuted ? "555555" : undefined, underline: config.contactUnderline });
  /** The lead term of an entry: bold black, or accent colour. */
  const lead = (t: string) => run(t, config.leadStyle === "accent" ? { color: accent } : { bold: true });
  /** The em dash itself: written directly, never passed through the ASCII normaliser. */
  const dash = () => new TextRun({ text: DASH, font, size });

  const heading = (id: SectionId): Paragraph[] => {
    if (config.untitled.includes(id)) return [];
    const raw = sectionTitle(config, id);
    const title = config.headingCase === "upper" || config.sectionTitles[id] ? raw : raw.charAt(0) + raw.slice(1).toLowerCase();
    return [
      new Paragraph({
        spacing: { before: Math.round(GAP_EM[config.sectionGap] * 145), after: 60, line },
        shading: config.headingStyle === "shade" ? { type: ShadingType.CLEAR, fill: tint(ACCENTS[config.accent]).slice(1), color: "auto" } : undefined,
        border:
          config.headingStyle === "rule"
            ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1 } }
            : config.headingStyle === "bar"
              ? { left: { style: BorderStyle.SINGLE, size: 24, color: accent, space: 6 } }
              : config.headingStyle === "tick"
                ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: accent, space: 1 } }
                : undefined,
        children: [
          run(config.headingCase === "upper" ? title.toUpperCase() : title, {
            bold: config.headingWeight === "bold",
            smallCaps: config.headingCase === "smallcaps",
            size: size + 2,
            color: config.headingStyle === "accent" || config.headingStyle === "tick" ? accent : undefined,
          }),
        ],
      }),
    ];
  };
  /** First paragraph of a heading-less section keeps some space from the block above. */
  const gapBefore = (id: SectionId) => (config.untitled.includes(id) ? Math.round(GAP_EM[config.sectionGap] * 100) : undefined);

  /** Entry heading: "inline" is one paragraph ("Role | Company | dates"); "dash" is "Role — Company" + dates on the right; "right" is two lines. */
  const head = (leadText: string, sub: string, date: string, where: string): Paragraph[] => {
    const tab = [{ type: TabStopType.RIGHT, position: width }];
    if (config.dateStyle === "inline") {
      const rest = [sub, date, where].filter(Boolean).map((x) => ` | ${x}`).join("");
      return [new Paragraph({ spacing: { line }, children: [lead(leadText), ...(rest ? [run(rest)] : [])] })];
    }
    if (config.dateStyle === "dash") {
      const rest = [sub, where].filter(Boolean).join(", ");
      return [new Paragraph({ spacing: { line }, tabStops: tab, children: [lead(leadText), ...(rest ? [dash(), run(rest)] : []), ...(date ? [run("\t"), dateRun(date)] : [])] })];
    }
    return [
      new Paragraph({ spacing: { line }, tabStops: tab, children: [lead(leadText), ...(date ? [run("\t"), dateRun(date)] : [])] }),
      ...(sub || where
        ? [new Paragraph({ spacing: { line }, tabStops: tab, children: [run(sub, { italics: true }), ...(where ? [run(`\t${where}`)] : [])] })]
        : []),
    ];
  };

  const bullet = (t: string) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 20, line }, children: [run(t)] });

  // One paragraph ("a | b | c") or one per detail when stacked; the optional header rule sits under the last one.
  function contactParagraphs(): Paragraph[] {
    const parts = contactParts(c, config);
    const groups = config.contactLayout === "stacked" ? parts.map((p) => [p]) : [parts];
    const sep = CONTACT_SEP[config.contactSep];
    return groups.map(
      (group, i) =>
        new Paragraph({
          alignment: align,
          ...bandFill,
          border:
            config.headerRule && i === groups.length - 1
              ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: nameIsAccent(config) ? accent : "000000", space: 4 } }
              : undefined,
          // plain: ONE run so the text stays contiguous; accent: one coloured run per detail
          children:
            config.contactAccent || config.contactMuted || config.contactUnderline
              ? group.flatMap((p, k) => [...(k ? [run(sep)] : []), contactRun(p)])
              : [run(group.join(sep))],
        }),
    );
  }

  const align = { center: AlignmentType.CENTER, left: AlignmentType.LEFT, right: AlignmentType.RIGHT }[config.headerAlign];
  /** Band: every header paragraph carries the accent fill, and its text is white. */
  const bandFill = config.headerBand ? { shading: { type: ShadingType.CLEAR, fill: accent, color: "auto" } } : {};
  const headRun = (t: string) => run(t, { color: config.headerBand ? "FFFFFF" : undefined });
  const nameRun = () =>
    new TextRun({
      text: a(config.nameStyle === "caps" ? c.fullName.toUpperCase() : c.fullName),
      font,
      bold: config.nameWeight === "bold",
      size: Math.round(size * NAME_EM[config.nameSize]),
      color: config.headerBand ? "FFFFFF" : nameIsAccent(config) ? accent : undefined,
      characterSpacing: config.nameStyle === "caps" ? Math.round(config.sizePt * NAME_SPACING_EM * 20 * 2) : undefined,
    });
  /** Split header: rows of "left detail <tab> name or headline <tab> right detail" using centre and right tab stops (no table). */
  const splitHeader = (): Paragraph[] => {
    const sides = splitContact(c, config);
    const rows = Math.max(sides.left.length, sides.right.length, c.headline ? 2 : 1);
    const tabs = [
      { type: TabStopType.CENTER, position: Math.round(width / 2) },
      { type: TabStopType.RIGHT, position: width },
    ];
    return Array.from(
      { length: rows },
      (_, i) =>
        new Paragraph({
          tabStops: tabs,
          spacing: { line },
          ...bandFill,
          border:
            config.headerRule && i === rows - 1
              ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: nameIsAccent(config) ? accent : "000000", space: 4 } }
              : undefined,
          children: [
            ...(sides.left[i] ? [contactRun(sides.left[i])] : []),
            run("\t"),
            ...(i === 0 ? [nameRun()] : i === 1 && c.headline ? [headRun(c.headline)] : []),
            run("\t"),
            ...(sides.right[i] ? [contactRun(sides.right[i])] : []),
          ],
        }),
    );
  };
  const kids: Paragraph[] =
    config.headerStyle === "split"
      ? splitHeader()
      : [
          new Paragraph({ alignment: align, children: [nameRun()], ...bandFill }),
          ...(c.headline ? [new Paragraph({ alignment: align, children: [headRun(c.headline)], ...bandFill })] : []),
          ...contactParagraphs(),
        ];

  const skills = r.skills.filter((g) => g.items.length);
  const sections: Record<SectionId, () => Paragraph[]> = {
    summary: () => (r.summary ? [...heading("summary"), new Paragraph({ spacing: { line, before: gapBefore("summary") }, children: [run(r.summary)] })] : []),
    skills: () => {
      if (!skills.length) return [];
      if (config.skillsStyle === "inline") {
        const runs = skills.flatMap((g, i) => [...(i ? [run("  |  ")] : []), lead(`${g.label}: `), run(g.items.join(", "))]);
        return [...heading("skills"), new Paragraph({ spacing: { line, before: gapBefore("skills") }, children: runs })];
      }
      if (config.skillsStyle === "table") {
        // aligned columns with a left tab stop and a hanging indent (no table): label, tab, skills
        const w = Math.round(skillLabelWidthEm(skills.map((g) => g.label)) * config.sizePt * 20);
        return [
          ...heading("skills"),
          ...skills.map(
            (g, i) =>
              new Paragraph({
                spacing: { line, after: 40, before: i === 0 ? gapBefore("skills") : undefined },
                tabStops: [{ type: TabStopType.LEFT, position: w }],
                indent: { left: w, hanging: w },
                children: [lead(g.label), run("\t"), run(g.items.join(", "))],
              }),
          ),
        ];
      }
      if (config.skillsStyle === "dash") {
        return [
          ...heading("skills"),
          ...skills.map((g, i) => new Paragraph({ spacing: { line, after: 80, before: i === 0 ? gapBefore("skills") : undefined }, children: [lead(g.label), dash(), run(g.items.join(", "))] })),
        ];
      }
      return [
        ...heading("skills"),
        ...skills.map((g, i) => new Paragraph({ spacing: { line, before: i === 0 ? gapBefore("skills") : undefined }, children: [lead(`${g.label}: `), run(g.items.join(", "))] })),
      ];
    },
    experience: () =>
      r.experience.length
        ? [
            ...heading("experience"),
            ...r.experience.flatMap((e) => [
              ...(roleFirst ? head(e.role, e.company, dates(e.start, e.end), e.location) : head(e.company, e.role, dates(e.start, e.end), e.location)),
              ...e.bullets.filter(Boolean).map(bullet),
            ]),
          ]
        : [],
    projects: () =>
      r.projects.length
        ? [
            ...heading("projects"),
            ...r.projects.flatMap((p) => [
              ...(config.projectStyle === "inline"
                ? [new Paragraph({ spacing: { line }, children: [lead(p.name), ...(p.tech.length ? [run(" | "), run(p.tech.join(", "), { italics: true })] : [])] })]
                : [
                    ...head(p.name, "", "", ""),
                    ...(p.tech.length ? [new Paragraph({ spacing: { line }, children: [run(p.tech.join(", "), { italics: true })] })] : []),
                  ]),
              ...p.bullets.filter(Boolean).map(bullet),
            ]),
          ]
        : [],
    education: () =>
      r.education.length
        ? [
            ...heading("education"),
            ...r.education.flatMap((e) => {
              const below = config.educationDetails === "below";
              const where = below ? "" : e.details;
              return [
                ...(roleFirst ? head(e.degree, e.school, dates(e.start, e.end), where) : head(e.school, e.degree, dates(e.start, e.end), where)),
                ...(below && e.details ? [new Paragraph({ spacing: { line }, children: [run(e.details)] })] : []),
              ];
            }),
          ]
        : [],
    certifications: () => (r.certifications.length ? [...heading("certifications"), ...r.certifications.map(bullet)] : []),
  };
  visibleSections(config).forEach((id) => kids.push(...sections[id]()));

  const m = twips(config.marginIn);
  return new Document({
    creator: "TomCredora",
    title: `${c.fullName} - Resume`,
    sections: [
      {
        properties: {
          page: {
            size: { width: twips(PAPER[config.paper].widthIn), height: twips(PAPER[config.paper].heightIn) },
            margin: { top: m, bottom: m, left: m, right: m },
          },
        },
        children: kids,
      },
    ],
  });
}

/** Node-side (tests, server) */
export const renderDocx = (r: Resume, config?: TemplateConfig) => Packer.toBuffer(buildDocx(r, config));

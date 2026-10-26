import { latexText } from "@/lib/escape";
import type { Resume } from "@/lib/schema";
import { ACCENTS, DEFAULT_CONFIG, FONTS, contactParts, nameIsAccent, sectionTitle, skillLabelWidthEm, splitContact, tint, visibleSections, type SectionId, type TemplateConfig } from "@/lib/templates";

const t = latexText;
const dates = (a: string, b: string) => [a, b].filter(Boolean).map(t).join(" -- ");
const NAME_CMD = { md: "\\Large", lg: "\\LARGE", xl: "\\huge" } as const;

/**
 * ATS-safe single-column LaTeX (Overleaf compatible). No tables, icons or images.
 * `\pdfgentounicode` keeps the PDF text layer extractable. All user text is escaped.
 * Layout comes from the same TemplateConfig as the preview, DOCX and PDF.
 */
export function renderLatex(r: Resume, config: TemplateConfig = DEFAULT_CONFIG): string {
  const c = r.contact;
  const sizeOpt = config.sizePt >= 11.5 ? 12 : config.sizePt >= 10.5 ? 11 : 10;
  const paper = config.paper === "a4" ? "a4paper" : "letterpaper";
  const family = FONTS[config.font].latex === "sans" ? "\\renewcommand{\\familydefault}{\\sfdefault}\n" : "";
  const accentHex = ACCENTS[config.accent].slice(1).toUpperCase();
  /** One contact detail, escaped and styled like the preview: accent beats grey, underline is independent. */
  const style = (raw: string) => {
    let x = t(raw);
    if (config.contactUnderline) x = `\\underline{${x}}`;
    if (config.headerBand) return x; // the band's white text colour is inherited
    if (config.contactAccent) x = `\\textcolor[HTML]{${accentHex}}{${x}}`;
    else if (config.contactMuted) x = `\\textcolor[HTML]{555555}{${x}}`;
    return x;
  };
  const parts = contactParts(c, config).map(style);
  const SEP = { pipe: " | ", slash: " / ", dot: " \\textperiodcentered{} ", comma: ", " } as const;
  const contact = config.contactLayout === "stacked" ? parts.join("\\\\\n  ") : parts.join(SEP[config.contactSep]);
  const gapPt = { tight: 5, normal: 8, airy: 13 }[config.sectionGap];

  /** A section with its heading, or (for `untitled` sections) just its content. */
  const section = (id: SectionId, body: string) => {
    if (!body.trim()) return "";
    if (config.untitled.includes(id)) return `\\vspace{${Math.max(gapPt - 3, 2)}pt}\n${body}\n`;
    const raw = sectionTitle(config, id);
    const title = config.headingCase === "upper" ? raw.toUpperCase() : config.sectionTitles[id] ? raw : raw.charAt(0) + raw.slice(1).toLowerCase();
    return `\\section*{${title}}\n${body}\n`;
  };
  const bullets = (items: string[]) => {
    const list = items.filter(Boolean);
    return list.length ? `\\begin{itemize}\n${list.map((b) => `  \\item ${t(b)}`).join("\n")}\n\\end{itemize}` : "";
  };

  /**
   * Entry heading. The lead term is styled by \leadfmt (bold, or accent colour).
   *  - "inline": one linear line   - "dash": "Lead --- rest" with dates right   - otherwise two lines, dates right.
   */
  const head = (lead: string, sub: string, when: string, where: string) => {
    if (config.dateStyle === "inline") {
      const rest = [sub, when, where].filter(Boolean).map((x) => ` | ${x}`).join("");
      return `\\entryinline{${lead}}{${rest}}`;
    }
    if (config.dateStyle === "dash") {
      const rest = [sub, where].filter(Boolean).join(", ");
      return `\\entrydash{${lead}}{${rest ? ` --- ${rest}` : ""}}{${when}}`;
    }
    return `\\entry{${lead}}{${when}}` + (sub || where ? `\n\\entrysub{${sub}}{${where}}` : "");
  };
  const roleFirst = config.entryOrder === "role-first";

  const skillGroups = r.skills.filter((g) => g.items.length);
  const groupText = (g: (typeof skillGroups)[number]) => g.items.map(t).join(", ");
  const skillsBody = () => {
    if (!skillGroups.length) return "";
    if (config.skillsStyle === "inline") return skillGroups.map((g) => `\\leadfmt{${t(g.label)}:} ${groupText(g)}`).join(" ~|~ ") + "\\par";
    if (config.skillsStyle === "table") {
      const w = skillLabelWidthEm(skillGroups.map((g) => g.label));
      return skillGroups.map((g) => `{\\hangindent=${w}em \\hangafter=1 \\makebox[${w}em][l]{\\leadfmt{${t(g.label)}}}${groupText(g)}\\par}`).join("\n");
    }
    if (config.skillsStyle === "dash") return skillGroups.map((g) => `\\leadfmt{${t(g.label)}} --- ${groupText(g)}\\par\\vspace{3pt}`).join("\n");
    return skillGroups.map((g) => `\\leadfmt{${t(g.label)}:} ${groupText(g)}`).join("\\\\\n") + "\\par";
  };

  const body: Record<SectionId, () => string> = {
    summary: () => section("summary", t(r.summary)),
    skills: () => section("skills", skillsBody()),
    experience: () =>
      section(
        "experience",
        r.experience
          .map((e) => {
            const d = dates(e.start, e.end);
            const h = roleFirst ? head(t(e.role), t(e.company), d, t(e.location)) : head(t(e.company), t(e.role), d, t(e.location));
            return `${h}\n${bullets(e.bullets)}`;
          })
          .join("\n\n"),
      ),
    projects: () =>
      section(
        "projects",
        r.projects
          .map((p) =>
            config.projectStyle === "inline"
              ? `\\entryinline{${t(p.name)}}{${p.tech.length ? ` | \\textit{${t(p.tech.join(", "))}}` : ""}}\n${bullets(p.bullets)}`
              : `${head(t(p.name), "", "", "")}\n${p.tech.length ? `\\textit{${t(p.tech.join(", "))}}\\par\n` : ""}${bullets(p.bullets)}`,
          )
          .join("\n\n"),
      ),
    education: () =>
      section(
        "education",
        r.education
          .map((e) => {
            const d = dates(e.start, e.end);
            const below = config.educationDetails === "below";
            const where = below ? "" : t(e.details);
            const h = roleFirst ? head(t(e.degree), t(e.school), d, where) : head(t(e.school), t(e.degree), d, where);
            return below && e.details ? `${h}\n${t(e.details)}\\par` : h;
          })
          .join("\n\n"),
      ),
    certifications: () => section("certifications", bullets(r.certifications)),
  };

  // Headings are upper-cased in code (not with \uppercase, which swallows the next token and breaks colour/bar commands).
  const color = config.headingStyle === "accent" ? `\\color[HTML]{${accentHex}}` : "";
  const before = config.headingStyle === "shade" ? "\\sectionshade" : config.headingStyle === "bar" ? `\\textcolor[HTML]{${accentHex}}{\\rule{3pt}{1.05em}}\\hspace{6pt}` : "";
  const after =
    config.headingStyle === "rule"
      ? "[\\titlerule]"
      : config.headingStyle === "tick"
        ? `[\\vspace{-3pt}{\\color[HTML]{${accentHex}}\\rule{2.4em}{1.6pt}}]`
        : "";
  const weight = (config.headingWeight === "regular" ? "\\normalfont" : "\\bfseries") + (config.headingCase === "smallcaps" ? "\\scshape" : "");
  const titleFmt = `\\titleformat{\\section}{${weight}\\large${color}}{}{0em}{${before}}${after}`;
  const align = { center: "center", left: "flushleft", right: "flushright" }[config.headerAlign];
  const mark = config.bullet === "dash" ? "label=--," : config.bullet === "circle" ? "label=\\textopenbullet," : "";
  const itemMark = `\\setlist[itemize]{${mark}leftmargin=1.2em,itemsep=1pt,topsep=2pt,parsep=0pt}`;
  const nameText = config.nameStyle === "caps" ? `\\textls[80]{${t(c.fullName.toUpperCase())}}` : t(c.fullName);
  const nameAccent = nameIsAccent(config);
  const headerRule = config.headerRule ? `\\vspace{2pt}\\noindent{\\color[HTML]{${nameAccent ? accentHex : "000000"}}\\rule{\\linewidth}{0.6pt}}\\par\n` : "";
  const spread = config.lineHeight > 1.2 ? `\\linespread{${(config.lineHeight / 1.2).toFixed(2)}}\n` : "";
  const nameStyle = `${NAME_CMD[config.nameSize]}${config.nameWeight === "bold" ? "\\bfseries" : "\\normalfont"}${nameAccent && !config.headerBand ? ` \\color[HTML]{${accentHex}}` : ""}`;
  const leadFmt = config.leadStyle === "accent" ? `\\textcolor[HTML]{${accentHex}}{#1}` : "\\textbf{#1}";

  const nameBlock = `{${nameStyle} ${nameText}}`;
  const sides = splitContact(c, config);
  const lines = (xs: string[]) => xs.map(style).join("\\\\\n    ");
  // Split header: three side-by-side boxes (left details | name | right links). Note a PDF reads them left to right.
  const header =
    config.headerStyle === "split"
      ? `\\noindent\\begin{minipage}[c]{0.29\\linewidth}\\raggedright
    ${lines(sides.left)}
\\end{minipage}\\hfill\\begin{minipage}[c]{0.38\\linewidth}\\centering
    ${nameBlock}${c.headline ? `\\\\[2pt]\n    ${t(c.headline)}` : ""}
\\end{minipage}\\hfill\\begin{minipage}[c]{0.29\\linewidth}\\raggedleft
    ${lines(sides.right)}
\\end{minipage}\\par`
      : `\\begin{${align}}
  ${nameBlock}\\\\[2pt]
  ${c.headline ? t(c.headline) + "\\\\[2pt]\n  " : ""}${contact}
\\end{${align}}`;

  // A band: the whole header on a solid accent box with white text (the width stays inside the margins).
  const banded = config.headerBand
    ? `\\noindent\\colorbox[HTML]{${accentHex}}{\\parbox{\\dimexpr\\linewidth-2\\fboxsep\\relax}{\\color{white}\\vspace{3pt}${header}\\vspace{3pt}}}\\par\\vspace{2pt}`
    : header;

  return `\\documentclass[${sizeOpt}pt,${paper}]{article}
\\usepackage[margin=${config.marginIn}in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{lmodern}
\\usepackage{textcomp}
\\usepackage{enumitem}
\\usepackage[dvipsnames]{xcolor}
\\usepackage{titlesec}
\\usepackage{microtype}
% Keep the PDF text layer clean for ATS parsers
\\input{glyphtounicode}
\\pdfgentounicode=1
${family}${spread}\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{0pt}
\\raggedbottom
${titleFmt}
\\titlespacing*{\\section}{0pt}{${gapPt}pt}{4pt}
${itemMark}
\\newcommand{\\leadfmt}[1]{${leadFmt}}
${config.headingStyle === "shade" ? `\\newcommand{\\sectionshade}[1]{\\colorbox[HTML]{${tint(ACCENTS[config.accent]).slice(1).toUpperCase()}}{\\parbox{\\dimexpr\\linewidth-2\\fboxsep\\relax}{#1}}}\n` : ""}\\newcommand{\\datefmt}[1]{${config.dateWeight === "bold" ? "\\textbf{#1}" : "#1"}}
\\newcommand{\\entry}[2]{\\leadfmt{#1}\\hfill \\datefmt{#2}\\par}
\\newcommand{\\entrysub}[2]{\\textit{#1}\\hfill #2\\par}
\\newcommand{\\entryinline}[2]{\\leadfmt{#1}#2\\par}
\\newcommand{\\entrydash}[3]{\\leadfmt{#1}#2\\hfill \\datefmt{#3}\\par}

\\begin{document}
${banded}
${headerRule}
${visibleSections(config).map((id) => body[id]()).join("")}
\\end{document}
`;
}

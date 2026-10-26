import { Fragment, memo, type CSSProperties, type ReactNode } from "react";
import type { Resume } from "@/lib/schema";
import {
  ACCENTS, CONTACT_SEP, DEFAULT_CONFIG, FONTS, GAP_EM, NAME_EM, NAME_SPACING_EM,
  contactParts, inToCqw, nameIsAccent, pageHeightCqw, ptToCqw, sectionTitle, skillLabelWidthEm, splitContact, tint, visibleSections,
  type SectionId, type TemplateConfig,
} from "@/lib/templates";

const dates = (a: string, b: string) => [a, b].filter(Boolean).join(" - ");
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const DASH = " — ";
const MUTED = "#555555"; // 7.5:1 on white

interface PaperProps {
  resume: Resume;
  config?: TemplateConfig;
  showGuide?: boolean;
  /** "print": absolute units (pt) and no padding: page margins come from @page so every page is padded. */
  mode?: "screen" | "print";
  /** Thumbnails: hidden from assistive tech so only the real preview is announced. */
  decorative?: boolean;
}

/**
 * Template-driven, ATS-safe resume page: single column of real text, standard headings,
 * no tables/icons/images. Everything is sized in container units so it keeps true page
 * proportions at any width (thumbnail, preview, print). The exported HTML reuses this component.
 */
function ResumePaperImpl({ resume: r, config = DEFAULT_CONFIG, showGuide = true, mode = "screen", decorative = false }: PaperProps) {
  const print = mode === "print";
  // Thumbnails are pictures of a resume, not part of the page: they must add no headings (a page with 24 <h1>s from 24
  // thumbnails confuses search engines and screen readers). The real preview, print and HTML export keep real headings.
  const Name = decorative ? "div" : "h1";
  const Head = decorative ? "div" : "h2";
  const c = r.contact;
  const accent = ACCENTS[config.accent];
  const contactList = contactParts(c, config);
  const contactSep = CONTACT_SEP[config.contactSep];
  const pageH = pageHeightCqw(config.paper);
  const pad = inToCqw(config.marginIn, config.paper);
  const listStyleType = config.bullet === "dash" ? '"- "' : config.bullet === "circle" ? "circle" : "disc";
  const accentText: CSSProperties = { color: accent };

  /** The lead term of an entry (job title, skill group, degree): bold black, or accent colour. */
  const lead = (text: string) => (config.leadStyle === "accent" ? <span style={accentText}>{text}</span> : <strong>{text}</strong>);

  /** A contact detail, in the template's colour (accent wins over grey) and underlined if asked. */
  const band = config.headerBand;
  const contactStyle: CSSProperties = {
    ...(band ? {} : config.contactAccent ? accentText : config.contactMuted ? { color: MUTED } : {}),
    ...(config.contactUnderline ? { textDecoration: "underline" } : {}),
  };
  const styledContact = Object.keys(contactStyle).length > 0;
  const contactEl = (x: string) => (styledContact ? <span style={contactStyle}>{x}</span> : x);

  const headingStyle: CSSProperties = {
    marginTop: `${GAP_EM[config.sectionGap]}em`,
    marginBottom: "0.45em",
    fontWeight: config.headingWeight === "regular" ? 400 : 700,
    letterSpacing: config.headingCase === "upper" ? "0.04em" : config.headingCase === "smallcaps" ? "0.03em" : undefined,
    textTransform: config.headingCase === "upper" ? "uppercase" : undefined,
    fontVariant: config.headingCase === "smallcaps" ? "small-caps" : undefined,
    borderBottom: config.headingStyle === "rule" ? "0.08em solid #000" : undefined,
    color: config.headingStyle === "accent" ? accent : "#000",
    // "shade": the section title sits on a light tint of the accent, full width (dark text on it stays above 4.5:1)
    backgroundColor: config.headingStyle === "shade" ? tint(accent) : undefined,
    // "bar": a solid accent bar to the left of the heading. "tick": a short accent underline (see .rp-h-tick in paper-css).
    borderLeft: config.headingStyle === "bar" ? `0.3em solid ${accent}` : undefined,
    // Longhand padding only: React warns when a re-render swaps `padding` for `paddingBottom` (or back).
    paddingTop: config.headingStyle === "shade" ? "0.2em" : undefined,
    paddingRight: config.headingStyle === "shade" ? "0.55em" : undefined,
    paddingBottom: config.headingStyle === "rule" ? "0.15em" : config.headingStyle === "shade" ? "0.2em" : undefined,
    paddingLeft: config.headingStyle === "bar" ? "0.5em" : config.headingStyle === "shade" ? "0.55em" : undefined,
    ["--rp-accent" as string]: accent,
  };
  // Heading text: the user's own title as typed, otherwise the standard name (CSS upper-cases it when asked).
  const H = (id: SectionId) => {
    if (config.untitled.includes(id)) return null;
    const t = sectionTitle(config, id);
    return (
      <Head className={config.headingStyle === "tick" ? "rp-h-tick" : undefined} style={headingStyle}>
        {config.headingCase !== "upper" && !config.sectionTitles[id] ? titleCase(t) : t}
      </Head>
    );
  };
  /** A section; one drawn without a heading still keeps its space from the block above. */
  const sec = (id: SectionId, children: ReactNode) => (
    <section key={id} style={config.untitled.includes(id) ? { marginTop: `${GAP_EM[config.sectionGap] * 0.7}em` } : undefined}>
      {H(id)}
      {children}
    </section>
  );

  const bullets = (items: string[]) => (
    <ul className="rp-list" style={{ listStyleType }}>
      {items.filter(Boolean).map((b, i) => (
        <li key={i} style={{ breakInside: "avoid" }}>
          {b}
        </li>
      ))}
    </ul>
  );

  const whenEl = (when: string) => <span style={config.dateWeight === "bold" ? { fontWeight: 700 } : undefined}>{when}</span>;

  /**
   * One entry heading.
   * "inline": a single linear line ("Role | Company | dates").
   * "dash":   one line, "Role — Company, place" on the left and the dates on the right.
   * "right":  two lines, dates on the right of the first and place on the right of the second.
   */
  const entryHead = (head: string, sub: string, when: string, where: string) => {
    if (config.dateStyle === "inline") {
      return (
        <p>
          {lead(head)}
          {[sub, when, where].filter(Boolean).map((x) => ` | ${x}`)}
        </p>
      );
    }
    if (config.dateStyle === "dash") {
      const rest = [sub, where].filter(Boolean).join(", ");
      return (
        <p className="rp-split">
          <span>
            {lead(head)}
            {rest && `${DASH}${rest}`}
          </span>
          {whenEl(when)}
        </p>
      );
    }
    return (
      <>
        <p className="rp-split">
          <span>{lead(head)}</span>
          {whenEl(when)}
        </p>
        {(sub || where) && (
          <p className="rp-split rp-i">
            <span>{sub}</span>
            <span>{where}</span>
          </p>
        )}
      </>
    );
  };

  const sections: Record<SectionId, () => ReactNode> = {
    summary: () => r.summary && sec("summary", <p>{r.summary}</p>),
    skills: () => {
      const groups = r.skills.filter((g) => g.items.length);
      const labelW = skillLabelWidthEm(groups.map((g) => g.label));
      return (
        groups.length > 0 &&
        sec(
          "skills",
          config.skillsStyle === "inline" ? (
            <p>
              {groups.map((g, i) => (
                <span key={i}>
                  {i > 0 && "  |  "}
                  {lead(`${g.label}:`)} {g.items.join(", ")}
                </span>
              ))}
            </p>
          ) : config.skillsStyle === "table" ? (
            // aligned columns made with CSS grid (not a table element): label, then its skills, in reading order
            groups.map((g, i) => (
              <p key={i} className="rp-skillrow" style={{ ["--rp-labelw" as string]: `${labelW}em` }}>
                <span>{lead(g.label)}</span>
                <span>{g.items.join(", ")}</span>
              </p>
            ))
          ) : config.skillsStyle === "dash" ? (
            groups.map((g, i) => (
              <p key={i} style={{ marginBottom: "0.45em" }}>
                {lead(g.label)}
                {DASH}
                {g.items.join(", ")}
              </p>
            ))
          ) : (
            groups.map((g, i) => (
              <p key={i}>
                {lead(`${g.label}:`)} {g.items.join(", ")}
              </p>
            ))
          ),
        )
      );
    },
    experience: () =>
      r.experience.length > 0 &&
      sec(
        "experience",
        r.experience.map((e) => (
          <div key={e.id} style={{ marginBottom: "0.7em", breakInside: "avoid" }}>
            {config.entryOrder === "role-first"
              ? entryHead(e.role, e.company, dates(e.start, e.end), e.location)
              : entryHead(e.company, e.role, dates(e.start, e.end), e.location)}
            {bullets(e.bullets)}
          </div>
        )),
      ),
    projects: () =>
      r.projects.length > 0 &&
      sec(
        "projects",
        r.projects.map((p) => (
          <div key={p.id} style={{ marginBottom: "0.7em", breakInside: "avoid" }}>
            {config.projectStyle === "inline" ? (
              <p>
                {lead(p.name)}
                {p.tech.length > 0 && (
                  <>
                    {" | "}
                    <em>{p.tech.join(", ")}</em>
                  </>
                )}
              </p>
            ) : (
              <>
                {entryHead(p.name, "", "", "")}
                {p.tech.length > 0 && <p className="rp-i">{p.tech.join(", ")}</p>}
              </>
            )}
            {bullets(p.bullets)}
          </div>
        )),
      ),
    education: () =>
      r.education.length > 0 &&
      sec(
        "education",
        r.education.map((e) => {
          const below = config.educationDetails === "below";
          const where = below ? "" : e.details;
          return (
            <div key={e.id} style={{ marginBottom: "0.4em", breakInside: "avoid" }}>
              {config.entryOrder === "role-first"
                ? entryHead(e.degree, e.school, dates(e.start, e.end), where)
                : entryHead(e.school, e.degree, dates(e.start, e.end), where)}
              {below && e.details && <p>{e.details}</p>}
            </div>
          );
        }),
      ),
    certifications: () => r.certifications.length > 0 && sec("certifications", bullets(r.certifications)),
  };

  const nameText = (config.nameStyle === "caps" ? c.fullName.toUpperCase() : c.fullName) || "Your Name";
  const nameEl = (
    <Name
      style={{
        fontSize: `${NAME_EM[config.nameSize]}em`,
        fontWeight: config.nameWeight === "regular" ? 400 : 700,
        lineHeight: 1.15,
        color: band ? "#fff" : nameIsAccent(config) ? accent : "#000",
        ...(config.nameStyle === "caps" ? { letterSpacing: `${NAME_SPACING_EM}em` } : {}),
      }}
    >
      {nameText}
    </Name>
  );
  // Longhand padding only (see the heading style): toggling the band must not swap `padding` for `paddingBottom`.
  const bandStyle: CSSProperties = { backgroundColor: accent, color: "#fff", paddingTop: "0.8em", paddingRight: "1em", paddingBottom: "0.8em", paddingLeft: "1em", marginBottom: "0.3em" };
  const headerRule: CSSProperties = band ? bandStyle : config.headerRule ? { borderBottom: `0.08em solid ${nameIsAccent(config) ? accent : "#000"}`, paddingBottom: "0.5em" } : {};
  const split = config.headerStyle === "split";
  const sides = splitContact(c, config);

  return (
    <div className={print ? undefined : "rp-container"} aria-hidden={decorative || undefined}>
      <article
        aria-label={decorative ? undefined : print ? "Resume (print)" : "Resume preview"}
        data-resume-paper={decorative || print ? undefined : ""}
        className={`rp-article ${print ? "" : "rp-shadow"}`}
        style={{
          fontFamily: FONTS[config.font].css,
          fontSize: print ? `${config.sizePt}pt` : `${ptToCqw(config.sizePt, config.paper)}cqw`,
          lineHeight: config.lineHeight,
          padding: print ? 0 : `${pad}cqw`,
          minHeight: print ? undefined : `${pageH}cqw`,
        }}
      >
        {split ? (
          // The name comes FIRST in the document (reading order); CSS grid areas put the blocks left / centre / right.
          <header className="rp-head3" style={headerRule}>
            <div style={{ gridArea: "name", textAlign: "center" }}>
              {nameEl}
              {c.headline && <p>{c.headline}</p>}
            </div>
            <div style={{ gridArea: "left", textAlign: "left", fontSize: "0.95em" }}>
              {sides.left.map((x, i) => (
                <p key={i}>{contactEl(x)}</p>
              ))}
            </div>
            <div style={{ gridArea: "right", textAlign: "right", fontSize: "0.95em" }}>
              {sides.right.map((x, i) => (
                <p key={i}>{contactEl(x)}</p>
              ))}
            </div>
          </header>
        ) : (
          <header style={{ textAlign: config.headerAlign, ...headerRule }}>
            {nameEl}
            {c.headline && <p>{c.headline}</p>}
            {config.contactLayout === "stacked" && contactList.length > 0 ? (
              contactList.map((x, i) => (
                <p key={i} style={{ fontSize: "0.95em" }}>
                  {contactEl(x)}
                </p>
              ))
            ) : styledContact && contactList.length > 0 ? (
              <p style={{ fontSize: "0.95em" }}>
                {contactList.map((x, i) => (
                  <Fragment key={i}>
                    {i > 0 && contactSep}
                    {contactEl(x)}
                  </Fragment>
                ))}
              </p>
            ) : (
              <p style={{ fontSize: "0.95em" }}>{contactList.join(contactSep) || "email | phone | location"}</p>
            )}
          </header>
        )}

        {visibleSections(config).map((id) => sections[id]())}

        {showGuide && !print && (
          <div aria-hidden data-no-print className="pointer-events-none absolute inset-x-0 border-t border-dashed border-red-400/70" style={{ top: `${pageH}cqw` }}>
            <span className="absolute -top-[1.6em] right-2 text-[0.7em] text-red-700">page 2</span>
          </div>
        )}
      </article>
    </div>
  );
}

export const ResumePaper = memo(ResumePaperImpl);

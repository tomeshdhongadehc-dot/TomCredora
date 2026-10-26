"use client";

import { useMemo, useState, type FormEvent } from "react";
import { cleanResume } from "@/lib/clean";
import { renderLatex } from "@/lib/export/latex";
import { exportCss } from "@/lib/paper-css";
import { renderPlainText } from "@/lib/export/plaintext";
import { downloadBlob, downloadText, exportFileName, openInOverleaf, printAsPdf } from "@/lib/export/files";
import { MAX_CUSTOM_TEMPLATES, useCustomTemplates } from "@/lib/custom-templates";
import type { Resume } from "@/lib/schema";
import { SAMPLE_RESUME } from "@/lib/sample";
import {
  ACCENTS, FONTS, PAPER, PRESETS, SECTION_IDS, guardConfig, presetById, sameConfig,
  type AccentId, type FontId, type SectionId, type TemplateConfig,
} from "@/lib/templates";
import { ResumePaper } from "../ResumePaper";
import { SaveNudge } from "../account/SaveNudge";
import { Button, Card, Chip } from "../ui";
import { Row, Seg } from "./controls";
import { LayoutEditor } from "./LayoutEditor";

export type DesignPart = "templates" | "style" | "export";

interface Props {
  resume: Resume;
  config: TemplateConfig;
  setConfig: (c: TemplateConfig) => void;
  /** Which cards to show. The guided wizard shows all; the workspace shows one per tab. */
  parts?: DesignPart[];
}

export function DesignStep({ resume, config, setConfig, parts = ["templates", "style", "export"] }: Props) {
  const show = (p: DesignPart) => parts.includes(p);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAts, setShowAts] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [filter, setFilter] = useState("All");
  const tags = useMemo(() => ["All", ...new Set(PRESETS.flatMap((p) => p.tags).filter((t) => !/page/i.test(t)))], []);
  const shown = PRESETS.filter((p) => filter === "All" || p.tags.includes(filter) || p.id === config.id);

  const cleaned = useMemo(() => cleanResume(resume), [resume]);
  const hasContent = cleaned.contact.fullName.length > 0;
  const preview = hasContent ? cleaned : SAMPLE_RESUME;
  const warnings = useMemo(() => guardConfig(config), [config]);
  // Sections with nothing to draw yet, so the editor can say so.
  const emptySections = useMemo<SectionId[]>(
    () =>
      SECTION_IDS.filter((id) => {
        const r = hasContent ? cleaned : null;
        if (!r) return false;
        return { summary: !r.summary, skills: !r.skills.some((g) => g.items.length), experience: !r.experience.length, projects: !r.projects.length, education: !r.education.length, certifications: !r.certifications.length }[id];
      }),
    [cleaned, hasContent],
  );
  const custom = useCustomTemplates();
  const [saveName, setSaveName] = useState("");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const activeCustom = custom.list.find((t) => t.id === config.id);
  const base = activeCustom ? activeCustom.config : presetById(config.id).config;
  const baseName = activeCustom ? activeCustom.name : presetById(config.id).name;
  const customised = !sameConfig(base, config);

  function saveNew(e: FormEvent) {
    e.preventDefault();
    const t = custom.add(saveName, config);
    if (!t) return;
    setConfig(t.config);
    setSaveName("");
    setSavedMsg(`Saved "${t.name}" to My templates`);
    setTimeout(() => setSavedMsg(null), 3500);
  }
  const set = <K extends keyof TemplateConfig>(k: K, v: TemplateConfig[K]) => setConfig({ ...config, [k]: v });

  async function run(kind: string, fn: () => Promise<void> | void) {
    setBusy(kind);
    setNotice(null);
    try {
      await fn();
      setDone(`Downloaded ${kind === "overleaf" ? "to Overleaf" : kind.toUpperCase()} - check your downloads`);
      setTimeout(() => setDone(null), 3500);
    } catch {
      setNotice("That export failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const name = (ext: string) => exportFileName(cleaned, ext);
  const needsName = !hasContent;

  return (
    <div className="space-y-5">
      {show("templates") && (
      <Card>
        <h2 className="font-display text-xl">Choose a template</h2>
        <p className="mb-3 text-sm text-ink-2">All {PRESETS.length} are single-column and ATS-safe. Thumbnails show your real content.</p>
        <div role="group" aria-label="Filter templates" className="mb-4 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              aria-pressed={filter === t}
              className={`rounded-full px-3 py-1 text-xs transition-colors duration-[var(--dur)] ${filter === t ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2 hover:text-ink"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Template" className="grid grid-cols-2 gap-3">
          {shown.map((p) => {
            const on = config.id === p.id;
            return (
              <button
                key={p.id}
                role="radio"
                aria-checked={on}
                onClick={() => setConfig(p.config)}
                className={`group rounded-xl border p-2 text-left transition duration-[var(--dur)] ease-[var(--ease-out)] hover:-translate-y-0.5 ${on ? "border-accent ring-2 ring-accent/30" : "border-line hover:border-ink-2/50"}`}
              >
                <div className="pointer-events-none overflow-hidden rounded-md border border-line">
                  <ResumePaper resume={preview} config={p.config} showGuide={false} decorative />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 px-1">
                  <span className="text-sm font-medium">{p.name}</span>
                  {on && <Chip tone="good">{customised ? "Customised" : "Selected"}</Chip>}
                </div>
                <p className="px-1 pb-1 text-xs text-ink-2">{p.blurb}</p>
              </button>
            );
          })}
        </div>
      </Card>
      )}

      {show("templates") && (
      <Card>
        <h2 className="font-display text-xl">My templates</h2>
        <p className="mb-4 text-sm text-ink-2">
          Start from any template above, rearrange it below, then save it here to reuse it. Saved in this browser ({custom.list.length}/{MAX_CUSTOM_TEMPLATES}).
        </p>
        {custom.list.length > 0 && (
          <div role="radiogroup" aria-label="My templates" className="mb-4 grid grid-cols-2 gap-3">
            {custom.list.map((t) => {
              const on = config.id === t.id;
              return (
                <div key={t.id} className={`rounded-xl border p-2 ${on ? "border-accent ring-2 ring-accent/30" : "border-line"}`}>
                  <button type="button" role="radio" aria-checked={on} aria-label={t.name} onClick={() => setConfig(t.config)} className="block w-full text-left">
                    <div className="pointer-events-none overflow-hidden rounded-md border border-line">
                      <ResumePaper resume={preview} config={t.config} showGuide={false} decorative />
                    </div>
                  </button>
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      aria-label={`Rename ${t.name}`}
                      defaultValue={t.name}
                      maxLength={40}
                      onBlur={(e) => custom.update(t.id, { name: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium hover:border-line focus:border-accent"
                    />
                    {on && <Chip tone="good">{customised ? "Edited" : "Selected"}</Chip>}
                    <Button variant="quiet" className="!px-2 !py-1 text-xs" aria-label={`Delete ${t.name}`} onClick={() => custom.remove(t.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <form onSubmit={saveNew} className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <label htmlFor="tpl-name" className="mb-1 block text-xs text-ink-2">Name for the current design</label>
            <input
              id="tpl-name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              maxLength={40}
              placeholder="e.g. Consulting one-pager"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            />
          </div>
          <Button type="submit" variant="ghost" disabled={!saveName.trim() || custom.full}>Save as new template</Button>
          {activeCustom && customised && (
            <Button type="button" onClick={() => { custom.update(activeCustom.id, { config }); setSavedMsg(`Updated "${activeCustom.name}"`); setTimeout(() => setSavedMsg(null), 3500); }}>
              Update &ldquo;{activeCustom.name}&rdquo;
            </Button>
          )}
        </form>
        {custom.full && <p className="mt-2 text-xs text-warn">You have reached {MAX_CUSTOM_TEMPLATES} saved templates. Delete one to save another.</p>}
        <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm text-accent">{savedMsg ? `✓ ${savedMsg}` : ""}</p>
      </Card>
      )}

      {show("style") && (
      <Card>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-display text-xl">Customise</h2>
          <Button variant="quiet" className="!px-2 !py-1 text-xs" onClick={() => setConfig(base)} disabled={!customised}>
            Reset to {baseName}
          </Button>
        </div>
        <div className="divide-y divide-line">
          <Row label="Font" htmlFor="font">
            <select id="font" value={config.font} onChange={(e) => set("font", e.target.value as FontId)} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm">
              {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
            </select>
          </Row>
          <Row label={`Text size: ${config.sizePt}pt`} htmlFor="size">
            <input id="size" type="range" min={9} max={12.5} step={0.5} value={config.sizePt} onChange={(e) => set("sizePt", Number(e.target.value))} className="h-6 w-44 accent-[var(--accent)]" />
          </Row>
          <Row label={`Line spacing: ${config.lineHeight.toFixed(2)}`} htmlFor="lh">
            <input id="lh" type="range" min={1.1} max={1.6} step={0.05} value={config.lineHeight} onChange={(e) => set("lineHeight", Number(e.target.value))} className="h-6 w-44 accent-[var(--accent)]" />
          </Row>
          <Row label={`Margins: ${config.marginIn.toFixed(2)} in`} htmlFor="mg">
            <input id="mg" type="range" min={0.4} max={1} step={0.05} value={config.marginIn} onChange={(e) => set("marginIn", Number(e.target.value))} className="h-6 w-44 accent-[var(--accent)]" />
          </Row>
          <Row label="Paper">
            <Seg label="Paper" value={config.paper} onChange={(v) => set("paper", v)} options={(Object.keys(PAPER) as (keyof typeof PAPER)[]).map((k) => ({ v: k, t: PAPER[k].label }))} />
          </Row>
          <Row label="Headings">
            <Seg label="Heading style" value={config.headingStyle} onChange={(v) => set("headingStyle", v)} options={[{ v: "rule", t: "Ruled" }, { v: "plain", t: "Plain" }, { v: "accent", t: "Accent" }, { v: "bar", t: "Bar" }, { v: "tick", t: "Tick" }, { v: "shade", t: "Shaded" }]} />
          </Row>
          <Row label="Heading case">
            <Seg label="Heading case" value={config.headingCase} onChange={(v) => set("headingCase", v)} options={[{ v: "upper", t: "UPPER" }, { v: "title", t: "Title" }, { v: "smallcaps", t: "Small caps" }]} />
          </Row>
          <Row label="Name size">
            <Seg label="Name size" value={config.nameSize} onChange={(v) => set("nameSize", v)} options={[{ v: "md", t: "Medium" }, { v: "lg", t: "Large" }, { v: "xl", t: "Extra" }]} />
          </Row>
          <Row label="Name weight">
            <Seg label="Name weight" value={config.nameWeight} onChange={(v) => set("nameWeight", v)} options={[{ v: "bold", t: "Bold" }, { v: "regular", t: "Regular" }]} />
          </Row>
          <Row label="Name colour">
            <Seg label="Name colour" value={config.nameColor} onChange={(v) => set("nameColor", v)} options={[{ v: "auto", t: "Auto" }, { v: "ink", t: "Black" }, { v: "accent", t: "Accent" }]} />
          </Row>
          <Row label="Contact colour">
            <Seg
              label="Contact colour"
              value={config.contactAccent ? "accent" : config.contactMuted ? "muted" : "plain"}
              onChange={(v) => setConfig({ ...config, contactAccent: v === "accent", contactMuted: v === "muted" })}
              options={[{ v: "plain", t: "Black" }, { v: "muted", t: "Grey" }, { v: "accent", t: "Accent" }]}
            />
          </Row>
          <Row label="Underline contact details">
            <Seg label="Underline contact" value={config.contactUnderline ? "on" : "off"} onChange={(v) => set("contactUnderline", v === "on")} options={[{ v: "off", t: "Off" }, { v: "on", t: "On" }]} />
          </Row>
          <Row label="Date weight">
            <Seg label="Date weight" value={config.dateWeight} onChange={(v) => set("dateWeight", v)} options={[{ v: "normal", t: "Normal" }, { v: "bold", t: "Bold" }]} />
          </Row>
          <Row label="Education details">
            <Seg label="Education details" value={config.educationDetails} onChange={(v) => set("educationDetails", v)} options={[{ v: "right", t: "On the right" }, { v: "below", t: "Own line" }]} />
          </Row>
          <Row label="Project line">
            <Seg label="Project line" value={config.projectStyle} onChange={(v) => set("projectStyle", v)} options={[{ v: "stacked", t: "Stacked" }, { v: "inline", t: "One line" }]} />
          </Row>
          <Row label="Heading weight">
            <Seg label="Heading weight" value={config.headingWeight} onChange={(v) => set("headingWeight", v)} options={[{ v: "bold", t: "Bold" }, { v: "regular", t: "Regular" }]} />
          </Row>
          <Row label="Lead terms (job title, skill group, degree)">
            <Seg label="Lead terms" value={config.leadStyle} onChange={(v) => set("leadStyle", v)} options={[{ v: "bold", t: "Bold" }, { v: "accent", t: "Accent colour" }]} />
          </Row>
          <Row label="Name style">
            <Seg label="Name style" value={config.nameStyle} onChange={(v) => set("nameStyle", v)} options={[{ v: "normal", t: "Normal" }, { v: "caps", t: "CAPITALS" }]} />
          </Row>
          <Row label="Rule under header">
            <Seg label="Header rule" value={config.headerRule ? "on" : "off"} onChange={(v) => set("headerRule", v === "on")} options={[{ v: "off", t: "Off" }, { v: "on", t: "On" }]} />
          </Row>
          <Row label="Each entry leads with">
            <Seg label="Entry lead" value={config.entryOrder} onChange={(v) => set("entryOrder", v)} options={[{ v: "company-first", t: "Company" }, { v: "role-first", t: "Job title" }]} />
          </Row>
          <Row label="Dates">
            <Seg label="Date style" value={config.dateStyle} onChange={(v) => set("dateStyle", v)} options={[{ v: "right", t: "Right-aligned" }, { v: "dash", t: "Dash line" }, { v: "inline", t: "In one line" }]} />
          </Row>
          <Row label="Skills">
            <Seg label="Skills style" value={config.skillsStyle} onChange={(v) => set("skillsStyle", v)} options={[{ v: "lines", t: "Per line" }, { v: "dash", t: "Dash list" }, { v: "inline", t: "One line" }, { v: "table", t: "Aligned columns" }]} />
          </Row>
          <Row label="Bullets">
            <Seg label="Bullet style" value={config.bullet} onChange={(v) => set("bullet", v)} options={[{ v: "disc", t: "Dot" }, { v: "circle", t: "Ring" }, { v: "dash", t: "Dash" }]} />
          </Row>
          <Row label="Accent colour">
            <div role="radiogroup" aria-label="Accent colour" className="flex gap-2">
              {(Object.keys(ACCENTS) as AccentId[]).map((a) => (
                <button key={a} role="radio" aria-checked={config.accent === a} aria-label={a} onClick={() => set("accent", a)}
                  className={`size-7 rounded-full border-2 transition duration-[var(--dur-fast)] ${config.accent === a ? "scale-110 border-ink" : "border-transparent"}`}
                  style={{ background: ACCENTS[a] }} />
              ))}
            </div>
          </Row>
        </div>

        <h3 className="mb-3 mt-6 font-display text-lg">Arrange your resume</h3>
        <LayoutEditor config={config} set={set} empty={emptySections} />

        {warnings.length > 0 && (
          <ul aria-label="Design warnings" className="mt-4 space-y-1.5 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
            {warnings.map((w) => <li key={w.id}>{w.message}</li>)}
          </ul>
        )}
      </Card>
      )}

      {show("export") && (
      <Card>
        <h2 className="font-display text-xl">Export</h2>
        <p className="mb-4 text-sm text-ink-2">Everything is generated in your browser. Nothing is uploaded.</p>
        {needsName && <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">Add your name in the Profile step to enable exports.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button disabled={needsName} onClick={() => run("pdf", () => printAsPdf(name("pdf").replace(/\.pdf$/, "")))}>Download PDF</Button>
          <Button variant="ghost" disabled={needsName || busy === "docx"} onClick={() => run("docx", async () => {
            const [{ Packer }, { buildDocx }] = await Promise.all([import("docx"), import("@/lib/export/docx")]);
            downloadBlob(name("docx"), await Packer.toBlob(buildDocx(cleaned, config)));
          })}>{busy === "docx" ? "Preparing..." : "Download DOCX"}</Button>
          <Button variant="ghost" disabled={needsName} onClick={() => run("tex", () => downloadText(name("tex"), renderLatex(cleaned, config), "application/x-tex"))}>Download LaTeX (.tex)</Button>
          <Button variant="ghost" disabled={needsName} onClick={() => run("overleaf", () => openInOverleaf(renderLatex(cleaned, config), "resume"))}>Open in Overleaf</Button>
          <Button variant="ghost" disabled={needsName || busy === "html"} onClick={() => run("html", async () => {
            const { renderResumeHtml } = await import("@/lib/export/html-render");
            downloadText(name("html"), renderResumeHtml(cleaned, config), "text/html");
          })}>{busy === "html" ? "Preparing..." : "Download HTML (web page)"}</Button>
          <Button variant="ghost" disabled={needsName} onClick={() => run("css", () => downloadText(name("css"), exportCss(config), "text/css"))}>Download CSS (styles)</Button>
          <Button variant="quiet" disabled={needsName} onClick={() => run("txt", () => downloadText(name("txt"), renderPlainText(cleaned, config)))}>Plain text (.txt)</Button>
          <Button variant="quiet" disabled={needsName} onClick={() => run("json", () => downloadText(name("json"), JSON.stringify({ resume: cleaned, template: config }, null, 2), "application/json"))}>Backup (.json)</Button>
        </div>
        {notice && <p role="alert" className="mt-3 text-sm text-bad">{notice}</p>}
        <p role="status" aria-live="polite" className={`mt-3 text-sm text-accent transition-opacity duration-[var(--dur)] ${done ? "opacity-100" : "opacity-0"}`}>{done ? `✓ ${done}` : " "}</p>
        <SaveNudge kind="export" className="mt-3" />
        <p className="mt-3 text-xs text-ink-2">PDF opens your browser&apos;s print dialog. Choose &quot;Save as PDF&quot; and turn off headers and footers. The text stays selectable, which is what ATS parsers need.</p>

        <button onClick={() => setShowAts((s) => !s)} aria-expanded={showAts} className="mt-3 inline-flex min-h-10 items-center text-sm font-medium text-accent hover:underline">
          {showAts ? "Hide" : "Show"} how an ATS reads this
        </button>
        {showAts && (
          <pre aria-label="Plain text as an ATS sees it" className="rise mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-mono text-xs leading-relaxed">
            {renderPlainText(cleaned, config)}
          </pre>
        )}
      </Card>
      )}
    </div>
  );
}

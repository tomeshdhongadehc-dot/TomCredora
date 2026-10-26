"use client";

import { Reorder, useDragControls } from "framer-motion";
import { CONTACT_FIELDS, DEFAULT_TITLES, type ContactField, type SectionId, type TemplateConfig } from "@/lib/templates";
import { Button } from "../ui";
import { Row, Seg } from "./controls";

export type SetConfig = <K extends keyof TemplateConfig>(k: K, v: TemplateConfig[K]) => void;

const CONTACT_LABEL: Record<ContactField, string> = { email: "Email", phone: "Phone", location: "Location", links: "Links" };

/** Keep only characters the schema allows, and make sure the title starts with a letter. */
const cleanTitle = (s: string) => s.replace(/[^A-Za-z &/,'-]/g, "").replace(/^[^A-Za-z]+/, "").slice(0, 30);

function SectionRow({ id, index, count, config, set, move, empty }: { id: SectionId; index: number; count: number; config: TemplateConfig; set: SetConfig; move: (id: SectionId, d: -1 | 1) => void; empty: boolean }) {
  const controls = useDragControls();
  const label = DEFAULT_TITLES[id];
  const shown = !config.hidden.includes(id);

  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      className={`flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm ${shown ? "" : "opacity-60"}`}
      whileDrag={{ scale: 1.02, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 10 }}
    >
      <button
        type="button"
        aria-label={`Drag ${label} to reorder`}
        onPointerDown={(e) => controls.start(e)}
        style={{ touchAction: "none" }}
        className="min-w-7 cursor-grab rounded px-2 py-1 text-ink-2 hover:bg-surface-2 active:cursor-grabbing"
      >
        <span aria-hidden>⠿</span>
      </button>
      <span className="w-5 text-center tabular-nums text-ink-2">{index + 1}</span>
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={shown}
          aria-label={`Show ${label}`}
          onChange={(e) => set("hidden", e.target.checked ? config.hidden.filter((h) => h !== id) : [...config.hidden, id])}
          className="size-4 accent-[var(--accent)]"
        />
        <span className="w-24 truncate font-medium">{label}</span>
      </label>
      {empty && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-2">no content yet</span>}
      <input
        aria-label={`Heading for ${label}`}
        value={config.sectionTitles[id] ?? ""}
        placeholder={label}
        maxLength={30}
        onChange={(e) => {
          const v = cleanTitle(e.target.value);
          const next = { ...config.sectionTitles };
          if (v.trim()) next[id] = v;
          else delete next[id];
          set("sectionTitles", next);
        }}
        className="min-w-0 flex-1 rounded-md border border-line bg-bg/50 px-2 py-1 text-sm placeholder:text-ink-2/60"
      />
      <label className="flex items-center gap-1 text-xs text-ink-2">
        <input
          type="checkbox"
          checked={!config.untitled.includes(id)}
          aria-label={`Show heading line for ${label}`}
          onChange={(e) => set("untitled", e.target.checked ? config.untitled.filter((x) => x !== id) : [...config.untitled, id])}
          className="size-4 accent-[var(--accent)]"
        />
        Heading
      </label>
      <span className="flex gap-0.5">
        <Button variant="quiet" className="!px-2 !py-0.5" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => move(id, -1)}>
          ↑
        </Button>
        <Button variant="quiet" className="!px-2 !py-0.5" aria-label={`Move ${label} down`} disabled={index === count - 1} onClick={() => move(id, 1)}>
          ↓
        </Button>
      </span>
    </Reorder.Item>
  );
}

/**
 * Arrange the resume: reorder (drag or arrows), show/hide and rename sections, choose which contact
 * details appear and in what order, and where the header sits. Everything stays a single ATS-safe column.
 */
/** `empty`: sections with nothing to show yet (so "move up" past one of them is explained, not mysterious). */
export function LayoutEditor({ config, set, empty = [] }: { config: TemplateConfig; set: SetConfig; empty?: SectionId[] }) {
  const moveSection = (id: SectionId, d: -1 | 1) => {
    const order = [...config.sectionOrder];
    const i = order.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    set("sectionOrder", order);
  };

  // Contact rows: the shown fields in their order, then the hidden ones (so they can be switched back on).
  const contactRows: ContactField[] = [...config.contactOrder, ...CONTACT_FIELDS.filter((f) => !config.contactOrder.includes(f))];
  const toggleContact = (f: ContactField, on: boolean) => set("contactOrder", on ? [...config.contactOrder, f] : config.contactOrder.filter((x) => x !== f));
  const moveContact = (f: ContactField, d: -1 | 1) => {
    const order = [...config.contactOrder];
    const i = order.indexOf(f);
    const j = i + d;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    set("contactOrder", order);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium">Sections</h3>
        <p className="mb-2 text-xs text-ink-2">Drag the handle or use the arrows to reorder. Untick to hide. Rename a heading in the box (standard names parse best).</p>
        <Reorder.Group as="ol" axis="y" values={config.sectionOrder} onReorder={(o) => set("sectionOrder", o)} aria-label="Section order" className="space-y-1.5">
          {config.sectionOrder.map((id, i) => (
            <SectionRow key={id} id={id} index={i} count={config.sectionOrder.length} config={config} set={set} move={moveSection} empty={empty.includes(id)} />
          ))}
        </Reorder.Group>
      </div>

      <div>
        <h3 className="text-sm font-medium">Contact details</h3>
        <p className="mb-2 text-xs text-ink-2">Choose what appears under your name and in what order.</p>
        <ul aria-label="Contact details" className="space-y-1.5">
          {contactRows.map((f) => {
            const on = config.contactOrder.includes(f);
            const i = config.contactOrder.indexOf(f);
            return (
              <li key={f} className={`flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm ${on ? "" : "opacity-60"}`}>
                <label className="flex flex-1 items-center gap-2">
                  <input type="checkbox" checked={on} aria-label={`Show ${CONTACT_LABEL[f]}`} onChange={(e) => toggleContact(f, e.target.checked)} className="size-4 accent-[var(--accent)]" />
                  {CONTACT_LABEL[f]}
                </label>
                <Button variant="quiet" className="!px-2 !py-0.5" aria-label={`Move ${CONTACT_LABEL[f]} up`} disabled={!on || i === 0} onClick={() => moveContact(f, -1)}>
                  ↑
                </Button>
                <Button variant="quiet" className="!px-2 !py-0.5" aria-label={`Move ${CONTACT_LABEL[f]} down`} disabled={!on || i === config.contactOrder.length - 1} onClick={() => moveContact(f, 1)}>
                  ↓
                </Button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="divide-y divide-line">
        <Row label="Header layout">
          <Seg label="Header layout" value={config.headerStyle} onChange={(v) => set("headerStyle", v)} options={[{ v: "stack", t: "Stacked" }, { v: "split", t: "Three columns" }]} />
        </Row>
        <Row label="Header band">
          <Seg label="Header band" value={config.headerBand ? "on" : "off"} onChange={(v) => set("headerBand", v === "on")} options={[{ v: "off", t: "Off" }, { v: "on", t: "Coloured band" }]} />
        </Row>
        <Row label="Header position">
          <Seg label="Header position" value={config.headerAlign} onChange={(v) => set("headerAlign", v)} options={[{ v: "left", t: "Left" }, { v: "center", t: "Centre" }, { v: "right", t: "Right" }]} />
        </Row>
        <Row label="Contact layout">
          <Seg label="Contact layout" value={config.contactLayout} onChange={(v) => set("contactLayout", v)} options={[{ v: "line", t: "One line" }, { v: "stacked", t: "Stacked" }]} />
        </Row>
        <Row label="Contact separator">
          <Seg label="Contact separator" value={config.contactSep} onChange={(v) => set("contactSep", v)} options={[{ v: "pipe", t: "Pipe" }, { v: "slash", t: "Slash" }, { v: "dot", t: "Dot" }, { v: "comma", t: "Comma" }]} />
        </Row>
        <Row label="Space between sections">
          <Seg label="Section spacing" value={config.sectionGap} onChange={(v) => set("sectionGap", v)} options={[{ v: "tight", t: "Tight" }, { v: "normal", t: "Normal" }, { v: "airy", t: "Airy" }]} />
        </Row>
      </div>
    </div>
  );
}

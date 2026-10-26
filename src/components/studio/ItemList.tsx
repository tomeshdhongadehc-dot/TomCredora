"use client";

import { Reorder, useDragControls } from "framer-motion";
import { useId, useState, type ReactNode } from "react";
import { Button } from "../ui";

/** A small inline icon (decorative: the button carries the accessible name). */
function Icon({ paths }: { paths: string[] }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
const COPY = ["M9 9h11v11H9z", "M5 15V5h10"];
const TRASH = ["M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 13h10l1-13", "M9 7V4h6v3"];
const iconBtn = "min-w-7 rounded-md p-1.5 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-40";

export interface ItemListProps<T> {
  /** Names the list for assistive tech and the buttons ("Experience" -> "Move role 2 up"). */
  noun: string;
  items: T[];
  onChange: (items: T[]) => void;
  /** A stable key per item (an id, or the index for items that have none). */
  getKey: (item: T, index: number) => string;
  create: () => T;
  /** How to copy an item (give the copy a fresh id when it has one). */
  copy?: (item: T) => T;
  addLabel: string;
  title: (item: T, index: number) => string;
  subtitle?: (item: T) => string;
  /** The form for one item. `update` merges a patch into it. */
  children: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode;
  emptyHint?: string;
  max?: number;
}

function Row<T>({
  k, item, index, count, noun, title, subtitle, open, toggle, move, duplicate, remove, bodyId, children,
}: {
  k: string; item: T; index: number; count: number; noun: string; title: string; subtitle?: string; open: boolean; toggle: () => void;
  move: (d: -1 | 1) => void; duplicate: () => void; remove: () => void; bodyId: string; children: ReactNode;
}) {
  const controls = useDragControls();
  const label = `${noun} ${index + 1}${title ? `: ${title}` : ""}`;
  void item;
  return (
    <Reorder.Item value={k} dragListener={false} dragControls={controls} className="rounded-xl border border-line bg-surface" whileDrag={{ scale: 1.01, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 10 }}>
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          aria-label={`Drag ${label} to reorder`}
          onPointerDown={(e) => controls.start(e)}
          style={{ touchAction: "none" }}
          className="min-w-7 cursor-grab rounded px-2 py-1 text-ink-2 hover:bg-surface-2 active:cursor-grabbing"
        >
          <span aria-hidden>⠿</span>
        </button>
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls={bodyId} className="min-w-0 flex-1 rounded px-1 py-1 text-left hover:bg-surface-2">
          <span className="block truncate text-sm font-medium">{title || <span className="text-ink-2">Untitled {noun.toLowerCase()}</span>}</span>
          {subtitle && <span className="block truncate text-xs text-ink-2">{subtitle}</span>}
        </button>
        <button type="button" className={iconBtn} aria-label={`Move ${label} up`} title="Move up" disabled={index === 0} onClick={() => move(-1)}>
          <span aria-hidden>↑</span>
        </button>
        <button type="button" className={iconBtn} aria-label={`Move ${label} down`} title="Move down" disabled={index === count - 1} onClick={() => move(1)}>
          <span aria-hidden>↓</span>
        </button>
        <button type="button" className={iconBtn} aria-label={`Duplicate ${label}`} title="Duplicate" onClick={duplicate}>
          <Icon paths={COPY} />
        </button>
        <button type="button" className={`${iconBtn} hover:!text-bad`} aria-label={`Delete ${label}`} title="Delete" onClick={remove}>
          <Icon paths={TRASH} />
        </button>
      </div>
      {open && (
        <div id={bodyId} className="space-y-3 border-t border-line px-3 py-3">
          {children}
        </div>
      )}
    </Reorder.Item>
  );
}

/** An editable, reorderable list of items (roles, schools, projects...). Drag the handle or use the arrows. */
export function ItemList<T>({ noun, items, onChange, getKey, create, copy, addLabel, title, subtitle, children, emptyHint, max = 50 }: ItemListProps<T>) {
  const uid = useId();
  const keys = items.map(getKey);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div>
      {items.length === 0 && emptyHint && <p className="mb-2 text-sm text-ink-2">{emptyHint}</p>}
      <Reorder.Group
        as="ul"
        axis="y"
        values={keys}
        onReorder={(order: string[]) => onChange(order.map((k) => items[keys.indexOf(k)]))}
        aria-label={`${noun}s`}
        className="space-y-2"
      >
        {items.map((item, i) => {
          const k = keys[i];
          return (
            <Row
              key={k}
              k={k}
              item={item}
              index={i}
              count={items.length}
              noun={noun}
              title={title(item, i)}
              subtitle={subtitle?.(item)}
              open={open.has(k)}
              toggle={() => toggle(k)}
              move={(d) => move(i, d)}
              duplicate={() => {
                const c = copy ? copy(item) : structuredClone(item);
                const next = [...items];
                next.splice(i + 1, 0, c);
                onChange(next);
                setOpen((s) => new Set(s).add(getKey(c, i + 1)));
              }}
              remove={() => onChange(items.filter((_, j) => j !== i))}
              bodyId={`${uid}-${k}`}
            >
              {children(item, (patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))), i)}
            </Row>
          );
        })}
      </Reorder.Group>
      <Button
        variant="ghost"
        className="mt-3 w-full"
        disabled={items.length >= max}
        onClick={() => {
          const fresh = create();
          onChange([...items, fresh]);
          setOpen((s) => new Set(s).add(getKey(fresh, items.length)));
        }}
      >
        + {addLabel}
      </Button>
    </div>
  );
}

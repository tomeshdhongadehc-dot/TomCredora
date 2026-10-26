"use client";

import Link from "next/link";
import { createContext, useContext, useId, useRef, useState, type ReactNode } from "react";

const OpenContext = createContext(true);

/** One list item inside <ShowMore>. The ones marked `extra` are hidden (not removed) until the list is opened. */
export function ShowMoreItem({ extra = false, className, children }: { extra?: boolean; className?: string; children: ReactNode }) {
  const open = useContext(OpenContext);
  return (
    <li hidden={extra && !open} className={className}>
      {children}
    </li>
  );
}

/**
 * A list that shows its first few items and the rest on request. Every item is rendered into the page either way
 * (the extras are only hidden), so search engines and the "find in page" feature still see all of them. The items are
 * rendered on the server and passed in, so this small client piece only toggles visibility.
 * Without JavaScript the button cannot work, so a plain link to the full page is offered next to it.
 */
export function ShowMore({
  children,
  initial,
  total,
  noun,
  fullHref,
  label,
  className = "",
}: {
  /** the list items: <ShowMoreItem> elements */
  children: ReactNode;
  /** how many items are shown before the button is pressed (the rest must be marked `extra`) */
  initial: number;
  /** how many items there are in all */
  total: number;
  noun: string;
  fullHref: string;
  /** names the list for screen readers (and for tests) */
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const top = useRef<HTMLUListElement>(null);
  const extra = total - initial;

  if (extra <= 0) return <ul aria-label={label} className={className}>{children}</ul>;

  return (
    <>
      <ul id={id} ref={top} aria-label={label} className={`${className} scroll-mt-24`}>
        <OpenContext.Provider value={open}>{children}</OpenContext.Provider>
      </ul>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => {
            setOpen((o) => !o);
            // collapsing from far down the page would leave you looking at the footer: bring the list back into view
            if (open) top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
          }}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-6 text-sm font-medium transition hover:bg-surface-2 active:scale-[0.99]"
        >
          {open ? `Show fewer ${noun}` : `View all ${total} ${noun}`}
        </button>
        <Link href={fullHref} prefetch={false} className="inline-flex min-h-10 items-center text-sm font-medium text-accent underline-offset-4 hover:underline">
          Compare them with descriptions
        </Link>
      </div>
    </>
  );
}

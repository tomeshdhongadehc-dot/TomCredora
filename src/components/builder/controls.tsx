import type { ReactNode } from "react";

/** A segmented radio control (one choice from a few). */
export function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; t: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg bg-surface-2 p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-md px-3 py-2 transition-colors duration-[var(--dur)] ${value === o.v ? "bg-surface font-medium shadow-sm" : "text-ink-2 hover:text-ink"}`}
        >
          {o.t}
        </button>
      ))}
    </div>
  );
}

/** A labelled settings row: label on the left, control on the right. */
export function Row({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-2">
      <label htmlFor={htmlFor} className="text-sm text-ink-2">
        {label}
      </label>
      {children}
    </div>
  );
}

"use client";

import { useId, useState } from "react";

export interface Option {
  /** what goes into the box when picked */
  value: string;
  /** what is shown in the list (defaults to value) */
  label?: string;
  /** a quieter second line, e.g. the state */
  detail?: string;
}

const fieldClass = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-2/60 transition-colors hover:border-ink-2/50 focus:border-accent";

/**
 * A text box with a list of suggestions under it. You can always type your own text; the list only helps.
 * Keyboard: Up and Down move, Enter picks, Escape closes. The list scrolls when it is long and the rows are tall
 * enough to tap on a phone.
 */
export function Combobox({
  id,
  value,
  onChange,
  options,
  onFocusOpen,
  placeholder,
  maxLength,
  autoComplete = "off",
  required,
  invalid,
  listLabel = "Suggestions",
  chevron,
}: {
  id: string;
  value: string;
  onChange: (text: string) => void;
  options: Option[];
  /** called when the box gets focus or is typed in, so the parent can load or filter the options */
  onFocusOpen?: () => void;
  placeholder?: string;
  maxLength?: number;
  autoComplete?: string;
  required?: boolean;
  invalid?: boolean;
  listLabel?: string;
  /** draw a small arrow so it reads as a dropdown */
  chevron?: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const shown = open ? options : [];
  const safeActive = Math.min(active, Math.max(shown.length - 1, 0));

  const pick = (o: Option) => {
    onChange(o.value);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown.length > 0 ? `${listId}-${safeActive}` : undefined}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        autoComplete={autoComplete}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        className={`${fieldClass} ${invalid ? "!border-bad" : ""} ${chevron ? "pr-9" : ""}`}
        onFocus={() => {
          onFocusOpen?.();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          onChange(e.target.value);
          onFocusOpen?.();
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => (shown.length ? (Math.min(i, shown.length - 1) + 1) % shown.length : 0));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (shown.length ? (Math.min(i, shown.length - 1) + shown.length - 1) % shown.length : 0));
          } else if (e.key === "Enter" && shown.length > 0 && shown[safeActive]) {
            e.preventDefault();
            pick(shown[safeActive]);
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {chevron && <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-2">▾</span>}
      <ul
        id={listId}
        role="listbox"
        aria-label={listLabel}
        hidden={shown.length === 0}
        className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface py-1 shadow-lg"
      >
        {shown.map((o, i) => (
          <li
            key={o.value}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === safeActive}
            // mouse down (not click) so the box keeps focus and the list is not closed before the pick lands
            onMouseDown={(e) => {
              e.preventDefault();
              pick(o);
            }}
            onMouseEnter={() => setActive(i)}
            className={`flex min-h-11 cursor-pointer flex-col justify-center px-3 py-1.5 text-sm sm:min-h-9 ${i === safeActive ? "bg-accent-soft text-ink" : "text-ink hover:bg-surface-2"}`}
          >
            <span>{o.label ?? o.value}</span>
            {o.detail && <span className="text-xs text-ink-2">{o.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

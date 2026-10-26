import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");
const [lightSrc, darkSrc] = css.split("@media (prefers-color-scheme: dark)");

const vars = (src: string) => Object.fromEntries([...src.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
const light = vars(lightSrc);
const dark = { ...light, ...vars(darkSrc.split("@theme")[0]) };

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Every foreground/background combination the UI actually renders.
const PAIRS: [string, string][] = [
  ["ink", "bg"], ["ink", "surface"], ["ink", "surface-2"],
  ["ink-2", "bg"], ["ink-2", "surface"], ["ink-2", "surface-2"],
  ["accent", "bg"], ["accent", "surface"], ["accent", "accent-soft"], ["accent-ink", "accent"],
  ["warn", "warn-soft"], ["warn", "surface"], ["warn", "bg"],
  ["bad", "bad-soft"], ["bad", "surface"], ["bad", "bg"],
];

describe("design tokens meet WCAG AA (4.5:1)", () => {
  for (const [name, theme] of [["light", light], ["dark", dark]] as const) {
    it(`${name} theme`, () => {
      const failures = PAIRS.filter(([f, b]) => contrast(theme[f], theme[b]) < 4.5).map(([f, b]) => `${f} on ${b}: ${contrast(theme[f], theme[b]).toFixed(2)}`);
      expect(failures).toEqual([]);
    });
  }
});

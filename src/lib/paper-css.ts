import { FONTS, PAPER, type TemplateConfig } from "./templates";

/**
 * The resume page's stylesheet. Shared by the in-app preview AND the exported HTML/CSS file, so the two
 * cannot drift. It deliberately re-states the few CSS resets the app gets from Tailwind's preflight,
 * because an exported file has no framework underneath it.
 */
export const PAPER_CSS = `
.rp-container{container-type:inline-size}
.rp-article{position:relative;margin-left:auto;margin-right:auto;width:100%;background:#fff;color:#000;box-sizing:border-box}
.rp-article *,.rp-article *::before,.rp-article *::after{box-sizing:border-box}
.rp-article h1,.rp-article h2,.rp-article p,.rp-article ul{margin:0;padding:0}
.rp-article h1,.rp-article h2{font-size:inherit;font-weight:inherit}
.rp-article strong{font-weight:bolder}
.rp-article ul.rp-list{margin-left:1.3em}
.rp-shadow{box-shadow:var(--paper-shadow,0 1px 2px rgba(27,26,23,.06),0 12px 32px -8px rgba(27,26,23,.18))}
.rp-split{display:flex;justify-content:space-between;gap:1rem}
.rp-b{font-weight:700}
.rp-n{font-weight:400}
.rp-i{font-style:italic}
.rp-head3{display:grid;grid-template-columns:1fr auto 1fr;grid-template-areas:"left name right";align-items:center;column-gap:1em}
.rp-skillrow{display:grid;grid-template-columns:var(--rp-labelw,9em) minmax(0,1fr);column-gap:1em;margin:0 0 0.3em}
.rp-h-tick::after{content:"";display:block;width:2.4em;margin-top:0.2em;border-bottom:0.18em solid var(--rp-accent,#000)}
`.trim();

/** Page chrome for a standalone file: a centred sheet on screen, and true page margins when printed. */
export function sheetCss(config: TemplateConfig): string {
  const paper = PAPER[config.paper];
  const size = config.paper === "a4" ? "A4" : "letter";
  return `
html{background:#e9e6df;-webkit-text-size-adjust:100%}
body{margin:0;padding:24px 12px;font-family:${FONTS[config.font].css}}
.rp-sheet{box-sizing:border-box;width:min(${paper.widthIn.toFixed(4)}in,100%);min-height:${paper.heightIn.toFixed(4)}in;margin:0 auto;padding:${config.marginIn}in;background:#fff;box-shadow:0 1px 2px rgba(27,26,23,.06),0 12px 32px -8px rgba(27,26,23,.18)}
@page{size:${size};margin:${config.marginIn}in}
@media screen and (max-width:640px){.rp-head3{grid-template-columns:1fr;grid-template-areas:"name" "left" "right"}.rp-head3>*{text-align:center!important}}
@media print{html{background:#fff}body{padding:0}.rp-sheet{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`.trim();
}

/** The complete, self-contained stylesheet for an exported resume. */
export const exportCss = (config: TemplateConfig) => `/* TomCredora resume styles. Template: ${config.id} */\n${PAPER_CSS}\n\n${sheetCss(config)}\n`;

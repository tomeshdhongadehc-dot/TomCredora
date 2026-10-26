import { escapeHtml } from "@/lib/escape";
import { exportCss } from "@/lib/paper-css";
import type { TemplateConfig } from "@/lib/templates";

/**
 * Wraps the rendered resume markup (produced by the same ResumePaper component as the preview)
 * in a complete, self-contained HTML page: inline CSS, no scripts, no external requests.
 * The CSP meta tag makes that guarantee enforceable by the browser, not just by convention.
 */
export function buildHtmlDocument(bodyHtml: string, config: TemplateConfig, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="generator" content="TomCredora">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>${escapeHtml(title)}</title>
<style>
${exportCss(config)}
</style>
</head>
<body>
<main class="rp-sheet">
${bodyHtml}
</main>
</body>
</html>
`;
}

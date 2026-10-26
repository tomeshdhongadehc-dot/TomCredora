import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { ResumePaper } from "@/components/ResumePaper";
import type { Resume } from "@/lib/schema";
import type { TemplateConfig } from "@/lib/templates";
import { buildHtmlDocument } from "./html";

/**
 * Browser-only. Renders the REAL ResumePaper component (print mode) into a detached element and wraps
 * the resulting markup in a standalone document, so the exported file is the preview's markup, not a copy.
 */
export function renderResumeHtml(resume: Resume, config: TemplateConfig): string {
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    flushSync(() => root.render(createElement(ResumePaper, { resume, config, mode: "print", showGuide: false })));
    return buildHtmlDocument(host.innerHTML, config, `${resume.contact.fullName} - Resume`);
  } finally {
    root.unmount();
  }
}

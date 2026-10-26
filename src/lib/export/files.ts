import type { Resume } from "@/lib/schema";

const clean = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);

/** ATS-friendly file name: Name_Role[_Company].ext. Never contains path or odd characters. */
export function exportFileName(r: Resume, ext: string, company?: string): string {
  const role = r.experience[0]?.role || r.contact.headline;
  const parts = [r.contact.fullName, role, company].map((p) => clean(p ?? "")).filter(Boolean);
  const base = parts.length ? parts.join("_") : "Resume";
  return `${base}.${ext.replace(/[^a-z0-9]/gi, "")}`;
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const downloadText = (name: string, text: string, type = "text/plain") =>
  downloadBlob(name, new Blob([text], { type: `${type};charset=utf-8` }));

/** Opens the LaTeX source in Overleaf via their documented POST form (new tab). */
export function openInOverleaf(tex: string, name = "resume") {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "https://www.overleaf.com/docs";
  form.target = "_blank";
  form.rel = "noopener";
  for (const [k, v] of Object.entries({ encoded_snip: encodeURIComponent(tex), snip_name: name })) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = k;
    input.value = v;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
  form.remove();
}

/** Browsers use document.title as the default PDF name when printing. */
export function printAsPdf(fileBase: string) {
  const prev = document.title;
  document.title = fileBase;
  const restore = () => {
    document.title = prev;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
}

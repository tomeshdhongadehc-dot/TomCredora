import { Document, Packer, Paragraph, TextRun } from "docx";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { handleImportFile } from "@/lib/api/import-handler";
import { MemoryRateLimiter } from "@/lib/api/ratelimit";
import { extractText, sniff, wordXmlToText } from "@/lib/import/extract";
import { parseResumeText } from "@/lib/import/parse";

const enc = (s: string) => new TextEncoder().encode(s);

/** A one-page PDF with real text, built by hand so the test needs no PDF writer. */
function tinyPdf(lines: string[]): Uint8Array {
  const esc = (l: string) => l.split("").map((c) => ("()".includes(c) || c.charCodeAt(0) === 92 ? String.fromCharCode(92) + c : c)).join("");
  const content = "BT /F1 12 Tf 14 TL 50 740 Td " + lines.map((l) => `(${esc(l)}) Tj T*`).join(" ") + " ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return enc(out);
}

async function docx(lines: string[]): Promise<Uint8Array> {
  const d = new Document({ sections: [{ children: lines.map((t) => new Paragraph({ children: [new TextRun(t)] })) }] });
  return new Uint8Array(await Packer.toBuffer(d));
}

const post = (body: BodyInit | null, type = "application/pdf", extra: Record<string, string> = {}) =>
  new Request("http://localhost/api/v1/import-file", { method: "POST", headers: { "content-type": type, ...extra }, body });
const deps = () => ({ limiter: new MemoryRateLimiter() });

describe("file type detection", () => {
  it("goes by the first bytes, not the name", async () => {
    expect(sniff(tinyPdf(["x"]))).toBe("pdf");
    expect(sniff(await docx(["x"]))).toBe("docx");
    expect(sniff(enc("hello world"))).toBeNull();
    expect(sniff(enc("<html></html>"))).toBeNull();
    expect(sniff(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBeNull(); // old .doc
  });
});

describe("reading Word files", () => {
  it("turns paragraphs into lines and decodes entities", () => {
    const xml = '<w:body><w:p><w:r><w:t>Jo &amp; Co</w:t></w:r></w:p><w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t xml:space="preserve">Did a thing</w:t></w:r></w:p><w:p></w:p></w:body>'.replace("<w:numPr/>", "<w:numPr></w:numPr>");
    expect(wordXmlToText(xml)).toBe("Jo & Co\n• Did a thing");
  });
  it("reads a real .docx and the importer understands it", async () => {
    const bytes = await docx(["Asha Rao", "asha@example.com", "EXPERIENCE", "Frontend Engineer", "Acme Corp    Jan 2021 - Present", "- Rebuilt checkout in React", "SKILLS", "React, TypeScript"]);
    const text = await extractText(bytes, "docx");
    const r = parseResumeText(text);
    expect(r.resume.contact.email).toBe("asha@example.com");
    expect(r.resume.experience[0]).toMatchObject({ role: "Frontend Engineer", company: "Acme Corp", start: "Jan 2021", end: "Present" });
    expect(r.resume.skills[0].items).toEqual(["React", "TypeScript"]);
  });
  it("refuses a zip that is not a Word document, and one that expands enormously", async () => {
    const notWord = new JSZip().file("hello.txt", "hi");
    await expect(extractText(await notWord.generateAsync({ type: "uint8array" }), "docx")).rejects.toThrow();
    const bomb = new JSZip().file("word/document.xml", "<w:p><w:r><w:t>a</w:t></w:r></w:p>" + " ".repeat(12 * 1024 * 1024));
    await expect(extractText(await bomb.generateAsync({ type: "uint8array", compression: "DEFLATE" }), "docx")).rejects.toThrow();
  });
});

describe("reading PDFs", () => {
  it("extracts text from a real PDF", async () => {
    const text = await extractText(tinyPdf(["Asha Rao", "asha@example.com", "EXPERIENCE", "Frontend Engineer", "Acme Corp   Jan 2021 - Present"]), "pdf");
    expect(text).toContain("Asha Rao");
    expect(parseResumeText(text).resume.experience[0].company).toBe("Acme Corp");
  });
});

describe("POST /api/v1/import-file", () => {
  const body = (b: Uint8Array) => b as unknown as BodyInit;
  it("returns the text of a PDF and of a .docx", async () => {
    const a = await (await handleImportFile(post(body(tinyPdf(["Asha Rao the engineer", "She builds the frontends of web products for a living"]))), deps())).json();
    expect(a.kind).toBe("pdf");
    expect(a.text).toContain("Asha Rao");
    const b = await handleImportFile(post(body(await docx(["Jo Bloggs the analyst", "Analyses data for a living and writes reports every week"])), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), deps());
    expect((await b.json()).kind).toBe("docx");
  });
  it("does not trust the declared type: a text file called a PDF is refused", async () => {
    const r = await handleImportFile(post(enc("not a pdf at all, just text pretending")), deps());
    expect(r.status).toBe(415);
  });
  it("refuses wrong content types, empty and oversized files", async () => {
    expect((await handleImportFile(post(body(tinyPdf(["x"])), "text/html"), deps())).status).toBe(415);
    expect((await handleImportFile(post(new Uint8Array(0) as unknown as BodyInit), deps())).status).toBe(400);
    expect((await handleImportFile(post(body(tinyPdf(["x"])), "application/pdf", { "content-length": String(5 * 1024 * 1024) }), deps())).status).toBe(413);
    expect((await handleImportFile(post(new Uint8Array(4 * 1024 * 1024 + 10) as unknown as BodyInit), deps())).status).toBe(413);
  });
  it("says so when a file has no text, or cannot be read", async () => {
    const empty = await handleImportFile(post(body(tinyPdf(["."]))), deps());
    expect(empty.status).toBe(422);
    expect((await empty.json()).error.code).toBe("no_text");
    const broken = await handleImportFile(post(enc("%PDF-1.4 this is damaged")), deps());
    expect(broken.status).toBe(422);
    expect((await broken.json()).error.code).toBe("unreadable_file");
  });
  it("rejects other origins and rate limits", async () => {
    expect((await handleImportFile(post(body(tinyPdf(["x"])), "application/pdf", { origin: "https://evil.example", host: "localhost" }), deps())).status).toBe(403);
    const d = deps();
    let last = 200;
    for (let i = 0; i < 10; i++) last = (await handleImportFile(post(enc("nope")), d)).status;
    expect(last).toBe(429);
  });
  it("never puts the file's words in an error message", async () => {
    const r = await handleImportFile(post(enc("%PDF-1.4 SECRET-RESUME-TEXT damaged")), deps());
    expect(JSON.stringify(await r.json())).not.toContain("SECRET");
  });
});

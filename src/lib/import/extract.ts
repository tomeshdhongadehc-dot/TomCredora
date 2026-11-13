import JSZip from "jszip";
import { PDFParse } from "pdf-parse";
import { getData } from "pdf-parse/worker";

/** Server side only: pull the plain text out of an uploaded PDF or Word file. Nothing is stored and nothing is executed. */

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // below the platform's 4.5 MB request limit
export const MAX_TEXT_CHARS = 60_000;
const MAX_XML_BYTES = 10 * 1024 * 1024; // what a Word file may expand to (zip-bomb guard)

export type FileKind = "pdf" | "docx";

/** The real type comes from the first bytes, never from the file name or the header the browser sent. */
export function sniff(bytes: Uint8Array): FileKind | null {
  if (bytes.length > 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return "pdf";
  if (bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05) && (bytes[3] === 0x04 || bytes[3] === 0x06)) return "docx";
  return null;
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)))
    .replace(/&amp;/g, "&");

/** The text of a Word XML part, one line per paragraph; list items get a bullet so the parser can see them. */
export function wordXmlToText(xml: string): string {
  const out: string[] = [];
  for (const para of xml.split(/<w:p[ >]/).slice(1)) {
    const body = para.split("</w:p>")[0];
    let line = "";
    for (const m of body.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g)) line += m[1] !== undefined ? decode(m[1]) : m[0].startsWith("<w:tab") ? "    " : " ";
    line = line.replace(/\s+$/g, "");
    if (!line.trim()) continue;
    out.push((/<w:numPr>/.test(body) ? "• " : "") + line);
  }
  return out.join("\n");
}

async function docxText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files).filter((n) => /^word\/(?:document|header\d*)\.xml$/.test(n));
  if (!names.includes("word/document.xml")) throw new Error("not a Word document");
  let total = 0;
  for (const n of names) {
    const size = (zip.files[n] as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
    if (typeof size !== "number") throw new Error("unreadable");
    total += size;
  }
  if (total > MAX_XML_BYTES) throw new Error("too large");
  // headers first: contact details are often kept there
  const ordered = [...names.filter((n) => n.includes("header")).sort(), "word/document.xml"];
  const parts = await Promise.all(ordered.map(async (n) => wordXmlToText(await zip.files[n].async("string"))));
  return parts.filter(Boolean).join("\n");
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  PDFParse.setWorker(getData());
  const parser = new PDFParse({ data: bytes });
  try {
    const { text } = await parser.getText();
    return text;
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

export async function extractText(bytes: Uint8Array, kind: FileKind): Promise<string> {
  const text = kind === "pdf" ? await pdfText(bytes) : await docxText(bytes);
  return text.replace(/\u0000/g, "").slice(0, MAX_TEXT_CHARS);
}

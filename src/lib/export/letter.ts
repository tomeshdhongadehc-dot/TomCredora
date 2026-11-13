import { Document, Packer, Paragraph, TextRun } from "docx";
import { asciiPunctuation } from "@/lib/escape";

/** The letter as plain paragraphs split on blank lines. */
export const letterBlocks = (text: string): string[] => text.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

/** A Word file of the letter: one real paragraph per block, a standard font, nothing else. */
export async function letterDocx(text: string): Promise<Blob> {
  const doc = new Document({
    sections: [
      {
        properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
        children: letterBlocks(text).map(
          (block) =>
            new Paragraph({
              spacing: { after: 220, line: 276 },
              children: block.split("\n").flatMap((line, i) => [new TextRun({ text: asciiPunctuation(line), font: "Calibri", size: 23, break: i > 0 ? 1 : undefined })]),
            }),
        ),
      },
    ],
  });
  return Packer.toBlob(doc);
}

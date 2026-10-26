/**
 * Renders schema.org structured data. This is the one place `dangerouslySetInnerHTML` is used, and it is safe here:
 * the data is fixed text from our own code (never user input), and `<` is escaped so it cannot close the script tag.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

import Link from "next/link";
import { ContentPage, type Faq } from "@/components/ContentPage";
import { pageMeta } from "@/lib/seo";

const TITLE = "ATS-Friendly Resume: The Complete Checklist";
const DESCRIPTION = "How applicant tracking systems read a resume, the formatting rules that keep yours readable, and a two-minute test you can run yourself.";
const PATH = "/guides/ats-friendly-resume";

export const metadata = pageMeta({ title: TITLE, description: DESCRIPTION, path: PATH, type: "article" });

const FAQ: Faq[] = [
  {
    q: "Does an ATS automatically reject resumes?",
    a: "Usually not. Most applicant tracking systems parse your resume into fields and store it so recruiters can search and filter. Rejections mostly come from a recruiter's filters (for example a required skill or location) or from the parse failing so the system cannot find what it was asked to find. A clean, single-column resume avoids the second problem.",
  },
  {
    q: "Is a PDF or a Word file better for an ATS?",
    a: "Both work if the PDF contains real, selectable text. Use a text-based PDF (made by saving or printing from a document or web page) rather than a scanned image. If an application asks for a specific format, use that one.",
  },
  {
    q: "Can I use colour and a bit of design?",
    a: "Yes, as long as the structure stays simple. Colour on headings or your name is fine. What causes trouble is layout trickery: columns, tables, text boxes, icons, images and skill bars.",
  },
  {
    q: "How long should an ATS-friendly resume be?",
    a: "One page is the safe default, and two pages are fine for a long, relevant career. Length matters less to the software than to the person who reads the result.",
  },
];

export default function Page() {
  return (
    <ContentPage
      title={TITLE}
      description={DESCRIPTION}
      path={PATH}
      crumb="ATS-friendly resume checklist"
      published="2026-10-12"
      modified="2026-10-12"
      faq={FAQ}
      related={[
        { href: "/guides/tailor-resume-to-job-description", title: "How to tailor a resume to a job description", text: "Match the job honestly, without adding skills you do not have." },
        { href: "/ats-resume-templates", title: "ATS resume templates", text: "23 single-column designs that follow every rule on this page." },
      ]}
    >
      <section aria-labelledby="how-h">
        <h2 id="how-h">How an ATS actually reads your resume</h2>
        <p>
          An applicant tracking system (ATS) is software that collects applications and helps recruiters sort them. When you upload a resume, it tries to turn the file into structured data: your name, contact details, job titles,
          employers, dates, skills and education. It does this by reading the text in order and guessing which part is which, mostly from the headings and the layout.
        </p>
        <p>
          That guessing is where problems start. If the text is in a table, a second column, a text box or an image, the system may read it out of order or not at all. A recruiter then searches the stored data for keywords, so
          anything that failed to parse is invisible to them. The goal of an ATS-friendly resume is simple: make the order of the text on the page match the order a machine will read it.
        </p>
      </section>

      <section aria-labelledby="rules-h">
        <h2 id="rules-h">The formatting rules that matter</h2>
        <ol>
          <li>
            <strong>One column.</strong> Put everything in a single column, top to bottom. Side columns for skills or contact details are the most common cause of scrambled text.
          </li>
          <li>
            <strong>Standard section names.</strong> Use headings a parser expects: Summary, Skills, Experience, Projects, Education, Certifications. Creative names like &quot;My journey&quot; or &quot;Toolbox&quot; may not be
            recognised as a section.
          </li>
          <li>
            <strong>Real text, not graphics.</strong> No images of text, no icons for phone or email, and no skill-level bars or star ratings. Write &quot;Python&quot; instead of drawing four dots.
          </li>
          <li>
            <strong>No tables or text boxes.</strong> They break reading order. Use paragraphs, lists and tab-aligned dates instead.
          </li>
          <li>
            <strong>Contact details in the body.</strong> Some systems ignore page headers and footers entirely. Put your name, email, phone and city at the top of the first page, in normal text.
          </li>
          <li>
            <strong>Common fonts.</strong> Calibri, Arial, Georgia and Times New Roman are safe. Keep body text between 10 and 12 points.
          </li>
          <li>
            <strong>Consistent, conventional dates.</strong> Write &quot;Jan 2022 - Present&quot; or &quot;2019 - 2021&quot; the same way everywhere, so the system can calculate how long you held each role.
          </li>
          <li>
            <strong>Simple bullets.</strong> Standard round bullets or hyphens are fine. Avoid unusual symbols that may turn into odd characters.
          </li>
          <li>
            <strong>A text-based file.</strong> A PDF with selectable text or a .docx works. A scanned page or a PDF made from a picture does not contain text for the system to read.
          </li>
          <li>
            <strong>A sensible file name.</strong> Something like <em>First-Last-Resume.pdf</em> is easy for a person to find in a pile of downloads.
          </li>
        </ol>
      </section>

      <section aria-labelledby="keywords-h">
        <h2 id="keywords-h">Keywords: use the job&apos;s own words, truthfully</h2>
        <p>
          Recruiters search by the terms in the job posting, such as a tool, a certification or a job title. If the posting says &quot;Kubernetes&quot; and you wrote &quot;container orchestration&quot;, a search for the first will
          miss you. Where you genuinely have a skill, use the exact wording from the posting. Include both the spelled-out form and the abbreviation once if both are common, for example &quot;search engine optimization (SEO)&quot;.
        </p>
        <p>
          Do not add skills you do not have. It will not survive the first interview, and it can disqualify you later. The honest approach is covered step by step in{" "}
          <Link href="/guides/tailor-resume-to-job-description">how to tailor a resume to a job description</Link>.
        </p>
      </section>

      <section aria-labelledby="test-h">
        <h2 id="test-h">A two-minute test you can run yourself</h2>
        <ol>
          <li>Open your resume file and select all the text, then copy it.</li>
          <li>Paste it into a plain text editor such as Notepad.</li>
          <li>Read it from top to bottom. Is your name first? Are the sections in the right order? Do dates sit next to the right jobs? Are any words missing or joined together?</li>
        </ol>
        <p>
          If the pasted text reads cleanly, an ATS will probably read it cleanly too. If it is jumbled, find the table, column or text box that is causing it. TomCredora includes this view in the builder under &quot;Show how an
          ATS reads this&quot;, so you can check every template with your own details.
        </p>
      </section>

      <section aria-labelledby="myths-h">
        <h2 id="myths-h">Common myths</h2>
        <ul>
          <li>
            <strong>&quot;You need a plain black-and-white document.&quot;</strong> You do not. Clean structure matters, not the absence of colour.
          </li>
          <li>
            <strong>&quot;Keyword stuffing beats the system.&quot;</strong> Repeating words or hiding white text is easy for software to detect and unpleasant for the person who reads your resume. Use each important term where it is true
            and relevant.
          </li>
          <li>
            <strong>&quot;A score of 100% guarantees an interview.&quot;</strong> No checker can promise that. Scores are guides to formatting and keyword coverage; the job, your experience and the people involved decide the rest.
          </li>
        </ul>
      </section>
    </ContentPage>
  );
}

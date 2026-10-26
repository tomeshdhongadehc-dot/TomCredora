import Link from "next/link";
import { ContentPage, type Faq } from "@/components/ContentPage";
import { pageMeta } from "@/lib/seo";

const TITLE = "How to Tailor Your Resume to a Job Description";
const DESCRIPTION = "Match your resume to a job posting step by step: find the keywords, map them to your real experience and rewrite bullets, without adding skills you lack.";
const PATH = "/guides/tailor-resume-to-job-description";

export const metadata = pageMeta({ title: TITLE, description: DESCRIPTION, path: PATH, type: "article" });

const FAQ: Faq[] = [
  {
    q: "How much of my resume should change for each job?",
    a: "Usually the summary, the order of your skills, and a few bullets in your most relevant roles. Your facts stay the same. You are choosing which true things to put first and describing them in the job's words.",
  },
  {
    q: "What if the job asks for a skill I do not have?",
    a: "Leave it off. If you have something close, such as a similar tool, mention that honestly. If you can learn it quickly, say so in a cover letter. Claiming a skill you lack is the fastest way to fail an interview.",
  },
  {
    q: "How many keywords should I use?",
    a: "Use the important ones that are true for you, once or twice each, in natural sentences. There is no magic number, and repeating words does not help. A recruiter still has to read the page.",
  },
  {
    q: "Can AI tailor my resume safely?",
    a: "It can, if it only rewords what you wrote and never invents. Check every line it changes. A good tool shows you what was added, lets you revert to your own wording and never adds a skill without asking you.",
  },
];

export default function Page() {
  return (
    <ContentPage
      title={TITLE}
      description={DESCRIPTION}
      path={PATH}
      crumb="Tailor a resume to a job"
      published="2026-10-12"
      modified="2026-10-12"
      faq={FAQ}
      related={[
        { href: "/guides/ats-friendly-resume", title: "ATS-friendly resume checklist", text: "The formatting rules that keep your resume readable by software." },
        { href: "/ats-resume-templates", title: "ATS resume templates", text: "Pick a clean single-column design, then tailor it." },
      ]}
    >
      <section aria-labelledby="why-h">
        <h2 id="why-h">Why tailoring works</h2>
        <p>
          A job posting is a short list of what the employer needs. A recruiter, or a search inside an applicant tracking system, looks for those needs on your resume. If your resume says the same thing in the same words, you are
          easy to find and easy to say yes to. If it says a similar thing in different words, you may be skipped by a search and skimmed past by a person.
        </p>
        <p>Tailoring is not rewriting your history. It is choosing which true parts of your experience to show first and describing them in the language of the job.</p>
      </section>

      <section aria-labelledby="steps-h">
        <h2 id="steps-h">The method, in six steps</h2>
        <ol>
          <li>
            <strong>Read the posting twice.</strong> The first time for the overall picture, the second time with a pen. Underline the required skills and tools, the main responsibilities and the job title.
          </li>
          <li>
            <strong>Sort what you found into three groups.</strong> Skills the posting asks for that you have; skills it asks for that you do not; and things you have that it does not mention. Only the first group goes forward as
            keywords.
          </li>
          <li>
            <strong>Lead with the matches.</strong> Put the skills the job wants first in your skills list, and use the posting&apos;s exact spelling when it is the same skill. If the job says &quot;JavaScript&quot; and you wrote
            &quot;JS&quot;, write &quot;JavaScript&quot;.
          </li>
          <li>
            <strong>Rewrite the bullets that matter.</strong> For your two or three most relevant roles, make each bullet say what you did, how, and what changed. Start with a strong verb and add a real number if you have one.
          </li>
          <li>
            <strong>Write a short summary for this job.</strong> Two or three lines: who you are, your strongest relevant experience, and what you are aiming for. It is the first thing a recruiter reads.
          </li>
          <li>
            <strong>Cut what does not help.</strong> If a bullet does not support this application, shorten it or drop it. A focused one-page resume beats a long one.
          </li>
        </ol>
      </section>

      <section aria-labelledby="example-h">
        <h2 id="example-h">A bullet, before and after</h2>
        <p>
          The job asks for &quot;experience building React applications with TypeScript&quot;. Your original bullet:
        </p>
        <p>
          <em>&quot;Worked on the website frontend and fixed bugs.&quot;</em>
        </p>
        <p>
          A tailored version that stays true, assuming those were the technologies you used and these numbers are real:
        </p>
        <p>
          <em>&quot;Built and maintained React and TypeScript components for the customer website, fixing 40+ production bugs and cutting page load time by 38%.&quot;</em>
        </p>
        <p>
          Notice what changed: the tools are named, the action is clearer, and the results are measurable. Notice what did not: no new employer, no new skill, no number you cannot back up. If you do not have a real number, leave it out
          rather than guessing.
        </p>
      </section>

      <section aria-labelledby="honest-h">
        <h2 id="honest-h">The line you should not cross</h2>
        <p>
          It is tempting to add the skills listed in the posting that you do not have. Do not. Interviewers ask about what is on your resume, background checks confirm employment and qualifications, and a mismatch can end an offer. If
          a required skill is missing, address it directly: show a related skill, a project where you picked something similar up quickly, or a plan to learn it.
        </p>
        <p>
          This is how TomCredora works. When you paste a job description, it lists the skills the job asks for in two groups: the ones already in your profile, which go first on the resume in the job&apos;s wording, and the ones
          that are not, which are shown as buttons you tap only if they are true for you. The AI is told to reword what you wrote, never to invent, and every line it adds that is not in your own words is flagged for you to keep or
          revert.
        </p>
      </section>

      <section aria-labelledby="check-h">
        <h2 id="check-h">Before you send it</h2>
        <ul>
          <li>Could you talk comfortably for a minute about every line on the page?</li>
          <li>Does the resume still read well as plain text? See the <Link href="/guides/ats-friendly-resume">ATS-friendly resume checklist</Link>.</li>
          <li>Are the job title and key skills in the posting visible in the first half of the page?</li>
          <li>Is everything spelled and dated consistently?</li>
        </ul>
      </section>
    </ContentPage>
  );
}

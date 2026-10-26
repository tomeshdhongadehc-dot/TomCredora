import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({ title: "Terms", description: "The plain-language rules for using TomCredora: what you are responsible for, what we promise, and what we do not.", path: "/terms" });

export default function TermsPage() {
  return (
    <LegalPage path="/terms" title="Terms of use" intro="These are the ground rules for using TomCredora. By using it you agree to them. They are written to be read.">
      <section>
        <h2>What this is</h2>
        <p>TomCredora helps you build and tailor resumes. It is a tool: you decide what goes on your resume, and you are the one who sends it to employers.</p>
      </section>

      <section>
        <h2>You are responsible for what your resume says</h2>
        <ul>
          <li>Only put true statements on your resume. The AI is told never to invent facts, and the app flags wording that is not in what you wrote, but it can still be wrong.</li>
          <li>Read every line before you send it. Anything you confirm or keep is yours.</li>
          <li>Do not use the service to create false or misleading claims about qualifications, employment or identity.</li>
        </ul>
      </section>

      <section>
        <h2>No guarantees</h2>
        <ul>
          <li>The ATS score and keyword checks are guides. We do not promise that any employer&apos;s system will read your resume a certain way, or that you will get an interview or a job.</li>
          <li>The AI can make mistakes and the free AI service has daily limits, so it may be unavailable at times.</li>
          <li>The service is provided &quot;as is&quot;. We may change it, pause it or end it.</li>
        </ul>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <ul>
          <li>Do not try to break, overload or probe the service, bypass its limits, or use it to attack others.</li>
          <li>Do not upload unlawful content or other people&apos;s private data without a right to do so.</li>
          <li>Do not resell access to the service or its AI quota.</li>
        </ul>
        <p>We may limit or block use that harms the service or other people.</p>
      </section>

      <section>
        <h2>Your content</h2>
        <p>
          Your resume content belongs to you. You give us permission to store it and to process it (including sending the parts described in the Privacy page to the AI service) only to run the service for you.
        </p>
      </section>

      <section>
        <h2>Your account</h2>
        <p>Keep access to your email secure, since it signs you in. You can stop using the service and delete your saved data at any time, as described in the Privacy page.</p>
      </section>

      <section>
        <h2>Limits of our responsibility</h2>
        <p>
          To the extent the law allows, we are not liable for lost opportunities, lost data or indirect losses from using the service. Keep your own backup: the app offers a downloadable backup of every resume. Nothing here limits
          rights you have by law that cannot be limited.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>We may update these terms. The date at the top shows when they last changed. Continuing to use the service after a change means you accept it.</p>
      </section>
    </LegalPage>
  );
}

import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({ title: "Privacy", description: "What TomCredora stores, what is sent to the AI, what stays in your browser, and how to delete your data at any time.", path: "/privacy" });

export default function PrivacyPage() {
  return (
    <LegalPage path="/privacy" title="Privacy" intro="Plain answers to: what do you keep, what goes to the AI, and how do I get rid of it. If something here is unclear, that is a bug in this page, so please tell us.">
      <section>
        <h2>The short version</h2>
        <ul>
          <li>Without an account, your profile and resumes are saved only in your own browser. Nothing is stored on our servers, apart from the short-lived technical copy described below when you use the AI.</li>
          <li>If you sign in, a copy is stored in your account so it follows you to other devices. You can delete it at any time.</li>
          <li>When you ask for an AI-tailored resume, your work history, skills and the job text are sent to us and to an AI service. Your name, email, phone, location and links never leave your browser while this happens.</li>
          <li>We do not sell your data and we do not show ads. We do not use analytics or advertising cookies.</li>
        </ul>
      </section>

      <section>
        <h2>What is stored, and where</h2>
        <p>
          <strong>In your browser.</strong> Your profile, your resumes, your saved templates and your settings are saved in your browser&apos;s own storage on your device. Clearing your browser&apos;s data removes them. If you
          paste your own AI key, it is kept only for the current browser tab and is gone when you close the tab.
        </p>
        <p>
          <strong>In your account (only if you sign in).</strong> We keep your email address (to sign you in) and one document containing your profile, your resumes and a list of resumes you deleted (so that a deletion on one device
          is not undone by another). It is stored with our database provider, Supabase, and is readable only by your own account.
        </p>
        <p>
          <strong>Sign-in.</strong> Sign-in uses an emailed link or Google. We never see or store a password. Your sign-in session is kept in your browser.
        </p>
      </section>

      <section>
        <h2>What goes to the AI</h2>
        <p>
          When you press the button that tailors your resume, your browser sends your job titles, company names, dates, the points you wrote about each role, your skills, projects, education, certifications and the job description
          you pasted to our server, which passes them to Google&apos;s Gemini service to write the result. Your <strong>name, email, phone number, location and links are not included</strong>: the app sends a placeholder instead, and
          puts your real details back on the result in your browser afterwards.
        </p>
        <p>
          Google handles that text under its own terms. For keys on Google&apos;s free tier, those terms allow Google to use submitted content to improve its products, and people at Google may review it. Do not include anything
          sensitive in the job description or your work history. If you prefer, use your own AI key under an account whose terms suit you. Please check Google&apos;s current terms, which can change.
        </p>
        <p>
          Our server keeps a technical copy of each AI answer (your work-history wording, without your contact details) for up to 24 hours so that pressing a button twice does not cost a second request. It is not used for anything
          else and expires on its own.
        </p>
      </section>

      <section>
        <h2>Other things we process</h2>
        <ul>
          <li>
            <strong>Your network address.</strong> To stop abuse and protect the free AI quota, we count requests per network address for a short time. The counter expires by itself.
          </li>
          <li>
            <strong>Exports.</strong> PDF, Word, LaTeX, HTML and text files are made in your browser and are not uploaded. If you click &quot;Open in Overleaf&quot;, your LaTeX text is sent to Overleaf, which is then governed by
            Overleaf&apos;s terms.
          </li>
          <li>
            <strong>Hosting and logs.</strong> Our hosting provider and database provider process requests to run the service and may keep standard technical logs. We keep our own logs free of your resume content.
          </li>
        </ul>
      </section>

      <section>
        <h2>Your choices</h2>
        <ul>
          <li>
            <strong>See or take your data:</strong> use &quot;Export this resume (.json)&quot; in My resumes for a backup you can read.
          </li>
          <li>
            <strong>Delete the copy in your account:</strong> open Account, then &quot;Delete my saved data&quot;. This removes it from our servers and signs you out; the copy on your device stays.
          </li>
          <li>
            <strong>Remove everything from this device:</strong> Account, then &quot;Sign out and clear this device&quot;, or clear your browser&apos;s site data.
          </li>
          <li>
            <strong>Delete your sign-in record itself:</strong> ask us (see below) and we will remove your account.
          </li>
        </ul>
        <p>Depending on where you live you may have further rights, such as correction or objection. We will honour reasonable requests.</p>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>We do not set advertising or tracking cookies. We use your browser&apos;s storage to save your work and, if you sign in, your session.</p>
      </section>

      <section>
        <h2>Children</h2>
        <p>This service is not meant for children under 16, and we do not knowingly collect their data.</p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>If we change how data is handled, we will update this page and its date. Material changes will be announced in the app.</p>
      </section>
    </LegalPage>
  );
}

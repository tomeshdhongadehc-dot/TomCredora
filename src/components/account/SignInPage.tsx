"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { authMode, getAuth, mayBeSignedIn } from "@/lib/auth/client";
import { DEFAULT_NEXT, NEXT_KEY, safeNext } from "@/lib/auth/next";
import { startSync } from "@/lib/sync/boot";
import { useAccount } from "@/lib/sync/use-account";
import { usePersistedText } from "@/lib/use-persisted-text";
import { SITE_NAME } from "@/lib/site";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_SECONDS = 30;

const BENEFITS = [
  { t: "Never lose your work", d: "Clear your browser or lose your phone and your profile and resumes are still here." },
  { t: "Every device", d: "Start on your laptop, finish on your phone. Edits merge, nothing is overwritten." },
  { t: "No password", d: "We email you a link, or you continue with Google. Nothing to remember or leak." },
  { t: "Yours to delete", d: "One button removes everything we keep. Your name, email and phone are never sent to the AI." },
];

const STEPS = ["Enter your email", "Open the email we send", "Click the link. Done"];
const PILLS = ["Saved on any device", "Never lose your resumes", "Delete anytime"];
const LAST_KEY = "arb.signin.last";

/** A shortcut to the person's inbox, for the common providers. Everything else gets no button (we do not guess). */
export function mailProvider(email: string): { name: string; href: string } | null {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") return { name: "Gmail", href: "https://mail.google.com/" };
  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain)) return { name: "Outlook", href: "https://outlook.live.com/mail/" };
  if (/^yahoo\.|^ymail\.com$/.test(domain)) return { name: "Yahoo Mail", href: "https://mail.yahoo.com/" };
  if (domain === "icloud.com" || domain === "me.com") return { name: "iCloud Mail", href: "https://www.icloud.com/mail" };
  if (domain === "proton.me" || domain === "protonmail.com") return { name: "Proton Mail", href: "https://mail.proton.me/" };
  return null;
}

const btn = "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-base font-medium transition active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50";
const primary = `${btn} bg-accent text-accent-ink shadow-sm hover:brightness-110`;
const secondary = `${btn} border border-line bg-surface hover:bg-surface-2`;

/** A message that came back in the address after a failed or expired emailed link (Supabase puts it in the #hash). */
function linkProblem(): string | null {
  const h = `${location.hash}${location.search}`;
  if (!/error=|error_code=|error_description=/.test(h)) return null;
  return /expired|otp_expired|invalid/i.test(h) ? "That sign-in link has expired or was already used. Request a new one below." : "Signing in did not work. Please try again.";
}

/**
 * The sign-in page. Email link or Google, no password. Built phone-first: one column, 48px controls, 16px text in
 * fields (so iPhones do not zoom), safe-area padding for notches; from 1024px a benefits panel sits beside the form.
 */
export function SignInPage() {
  const router = useRouter();
  const acc = useAccount();
  const uid = useId();
  const mode = authMode();
  const auth = getAuth();

  const [email, setEmail] = usePersistedText("signin-email");
  const [view, setView] = useState<"form" | "sent">("form");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [next, setNext] = useState(DEFAULT_NEXT);
  const [hasNext, setHasNext] = useState(false);
  const [returning, setReturning] = useState(false);
  const [last, setLast] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const emailBox = useRef<HTMLInputElement>(null);

  // Where to go afterwards: the address first (?next=), else what we saved before leaving for the emailed link or Google.
  useEffect(() => {
    const fromUrl = new URLSearchParams(location.search).get("next");
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(NEXT_KEY);
    } catch {
      /* storage blocked: the default is used */
    }
    const chosen = fromUrl ?? saved;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the address and storage
    setNext(safeNext(chosen));
    setHasNext(!!chosen);
    setReturning(mayBeSignedIn());
    try {
      setLast(localStorage.getItem(LAST_KEY) ?? "");
    } catch {
      /* storage blocked: no shortcut */
    }
    const problem = linkProblem();
    if (problem) setError(problem);
  }, []);

  const signedIn = !!acc.email;

  // Once signed in with somewhere to go, go there. (Someone who opens /signin while already signed in just sees their account.)
  useEffect(() => {
    if (!signedIn || !hasNext) return;
    try {
      localStorage.removeItem(NEXT_KEY);
    } catch {
      /* ignore */
    }
    router.replace(next);
  }, [signedIn, hasNext, next, router]);

  // resend countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // While waiting for the emailed link: if it is opened in another tab, this tab notices and carries on by itself.
  useEffect(() => {
    if (view !== "sent" || !auth) return;
    let live = true;
    const check = async () => {
      if (live && (await auth.getSession())) await startSync();
    };
    const off = auth.onChange(check);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      live = false;
      off();
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [view, auth]);

  // keyboard and screen-reader users land on the new heading when the view changes
  useEffect(() => {
    heading.current?.focus();
  }, [view, signedIn]);

  // Pressing a sign-in button means "take me on afterwards", even when the page was opened with no ?next.
  const remember = () => {
    setHasNext(true);
    try {
      localStorage.setItem(NEXT_KEY, next);
    } catch {
      /* ignore */
    }
  };

  async function submit(e?: FormEvent, address?: string) {
    e?.preventDefault();
    if (!auth || busy) return;
    const value = (address ?? email).trim().toLowerCase();
    if (!EMAIL.test(value)) {
      setError(value ? "That does not look like an email address. Check it and try again." : "Enter your email address.");
      emailBox.current?.focus();
      return;
    }
    setError(null);
    setBusy(true);
    remember();
    const r = await auth.signInWithEmail(value);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    try {
      localStorage.setItem(LAST_KEY, value);
    } catch {
      /* ignore */
    }
    if (r.message) {
      setSentTo(value);
      setView("sent");
      setCooldown(RESEND_SECONDS);
    } else {
      await startSync(); // test mode signs in at once: start syncing, then the effect above redirects
    }
  }

  async function google() {
    if (!auth) return;
    setError(null);
    remember();
    const r = await auth.signInWithGoogle();
    if (!r.ok) setError(r.error);
  }

  async function resend() {
    if (!auth || cooldown > 0 || busy) return;
    setBusy(true);
    const r = await auth.signInWithEmail(sentTo);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setError(null);
    setCooldown(RESEND_SECONDS);
  }

  async function leave() {
    const m = await import("@/lib/sync/manager");
    await m.signOut(false);
  }

  const title = signedIn ? "You are signed in" : view === "sent" ? "Check your email" : "Sign in to save your work";
  const waiting = !signedIn && returning && !acc.ready;
  const mail = mailProvider(sentTo);
  const shortcut = !!last && !email.trim();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <main id="main" className="flex flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 lg:col-start-2 lg:row-start-1 lg:px-12">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
          <Link href="/" className="font-display text-xl">
            {SITE_NAME}
          </Link>
          <Link href={hasNext ? next : "/quick"} prefetch={false} className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm text-ink-2 hover:text-ink hover:underline">
            Continue without an account
          </Link>
        </header>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8 sm:py-12">
          <h1 ref={heading} tabIndex={-1} className="font-display text-3xl leading-tight outline-none sm:text-4xl">
            {title}
          </h1>

          {mode === "off" ? (
            <div className="mt-4 space-y-4">
              <p className="text-ink-2">Accounts are not switched on for this site yet. Everything still works: your profile and resumes are saved in this browser.</p>
              <Link href="/quick" className={primary}>
                Make a resume
              </Link>
            </div>
          ) : signedIn ? (
            <div className="mt-4 space-y-5" role="status">
              <p className="text-ink-2">
                Signed in as <strong className="break-all text-ink">{acc.email}</strong>. Your profile and resumes are kept safe and follow you to other devices.
              </p>
              <div className="space-y-3">
                <Link href={next} prefetch={false} className={primary}>
                  {hasNext ? "Continue" : "Go to my profile"}
                </Link>
                <Link href="/quick" prefetch={false} className={secondary}>
                  Make a resume
                </Link>
                <button type="button" onClick={leave} className={`${secondary} !min-h-11 text-sm`}>
                  Sign out
                </button>
              </div>
            </div>
          ) : waiting ? (
            <p role="status" className="mt-4 text-ink-2">
              Signing you in…
            </p>
          ) : view === "sent" ? (
            <div className="mt-4 space-y-5">
              <p role="status" className="text-ink-2">
                We sent a sign-in link to <strong className="break-all text-ink">{sentTo}</strong>. Open it on <strong className="text-ink">this device</strong> to finish signing in.
              </p>
              {mail && (
                <a href={mail.href} target="_blank" rel="noopener noreferrer" className={primary}>
                  Open {mail.name}
                </a>
              )}
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
                <li>It can take a minute. Look in Spam or Promotions too. The email comes from TomCredora.</li>
                <li>When you click the link, this page moves on by itself, even if the link opens in a new tab.</li>
                <li>The link works once and expires after a short while.</li>
                <li>Wrong address? Go back and use a different one.</li>
              </ul>
              {error && (
                <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2.5 text-sm text-bad">
                  {error}
                </p>
              )}
              <div className="space-y-3">
                <button type="button" onClick={resend} disabled={cooldown > 0 || busy} className={secondary}>
                  {cooldown > 0 ? `Send it again in ${cooldown}s` : "Send the link again"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setView("form");
                    setError(null);
                  }}
                  className={`${btn} min-h-11 text-sm text-ink-2 hover:text-ink hover:underline`}
                >
                  Use a different email
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-3 text-ink-2">Keep your profile and resumes safe and use them on any device. Without an account everything stays in this browser only.</p>
              <ol aria-label="How signing in works" className="mt-5 grid grid-cols-3 gap-2 text-center text-xs leading-snug text-ink-2">
                {STEPS.map((s, i) => (
                  <li key={s} className="rounded-xl border border-line bg-surface px-2 py-3">
                    <span aria-hidden className="mx-auto mb-1.5 grid size-6 place-items-center rounded-full bg-accent text-xs font-medium text-accent-ink">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
              <ul aria-label="Why sign in" className="mt-3 flex flex-wrap gap-2 text-xs text-ink-2 lg:hidden">
                {PILLS.map((p) => (
                  <li key={p} className="rounded-full bg-accent-soft px-3 py-1 text-accent">
                    ✓ {p}
                  </li>
                ))}
              </ul>
              {shortcut && (
                <div className="mt-5 rounded-xl border border-line bg-surface p-4">
                  <p className="text-sm text-ink-2">Welcome back</p>
                  <p className="break-all font-medium">{last}</p>
                  <button type="button" onClick={() => submit(undefined, last)} disabled={busy} aria-busy={busy} className={`${primary} mt-3`}>
                    {busy ? "Sending…" : "Send the link to this address"}
                  </button>
                  <p className="mt-3 text-center text-xs text-ink-2">Not you? Type a different address below.</p>
                </div>
              )}
              <form onSubmit={submit} noValidate className="mt-6 space-y-3">
                <label htmlFor={`${uid}-email`} className="block text-sm font-medium">
                  Email address
                </label>
                <input
                  ref={emailBox}
                  id={`${uid}-email`}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="you@example.com"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${uid}-err` : `${uid}-hint`}
                  className="min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink placeholder:text-ink-2/60 hover:border-ink-2/50 focus:border-accent"
                />
                {error ? (
                  <p id={`${uid}-err`} role="alert" className="rounded-lg bg-bad-soft px-3 py-2.5 text-sm text-bad">
                    {error}
                  </p>
                ) : (
                  <p id={`${uid}-hint`} className="text-sm text-ink-2">
                    No password to remember. We email you a one-time link.
                  </p>
                )}
                <button type="submit" disabled={busy} aria-busy={busy} className={primary}>
                  {busy ? "Sending…" : mode === "mock" ? "Sign in" : "Email me a sign-in link"}
                </button>
              </form>

              {auth?.google && (
                <>
                  <div className="my-5 flex items-center gap-3 text-sm text-ink-2" aria-hidden>
                    <span className="h-px flex-1 bg-line" />
                    or
                    <span className="h-px flex-1 bg-line" />
                  </div>
                  <button type="button" onClick={google} className={secondary}>
                    Continue with Google
                  </button>
                </>
              )}
            </>
          )}

          <p className="mt-8 text-xs leading-relaxed text-ink-2">
            By continuing you agree to the{" "}
            <Link href="/terms" prefetch={false} className="underline underline-offset-2 hover:text-ink">
              Terms
            </Link>{" "}
            and have read the{" "}
            <Link href="/privacy" prefetch={false} className="underline underline-offset-2 hover:text-ink">
              Privacy
            </Link>{" "}
            page.
          </p>
        </div>
      </main>

      <aside aria-label="Why sign in" className="border-t border-line bg-surface-2/60 px-5 py-10 sm:px-8 lg:col-start-1 lg:row-start-1 lg:flex lg:flex-col lg:justify-center lg:border-r lg:border-t-0 lg:px-12">
        <div className="mx-auto w-full max-w-md">
          <p className="font-display text-2xl">A resume tool that remembers you</p>
          <ul className="mt-6 space-y-5">
            {BENEFITS.map((b) => (
              <li key={b.t} className="flex gap-3">
                <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs text-accent-ink">
                  ✓
                </span>
                <span>
                  <span className="block font-medium">{b.t}</span>
                  <span className="block text-sm text-ink-2">{b.d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

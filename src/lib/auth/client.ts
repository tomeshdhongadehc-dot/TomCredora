"use client";

/**
 * Browser-side sign-in. Three modes, chosen by environment variables at build time:
 *  - "supabase": real sign-in (email link and Google) when NEXT_PUBLIC_SUPABASE_URL and _ANON_KEY are set;
 *  - "mock":     a fake sign-in for automated tests and local demos (NEXT_PUBLIC_AUTH_MODE=mock; never in production);
 *  - "off":      nothing is configured, so no sign-in UI is shown and the app stays local-only.
 * The Supabase library is only loaded once someone has (or is returning with) a session, so it costs signed-out users nothing.
 */
export type AuthMode = "off" | "mock" | "supabase";

export function authMode(): AuthMode {
  if (process.env.NEXT_PUBLIC_AUTH_MODE === "mock" && process.env.NODE_ENV !== "production") return "mock";
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return "supabase";
  return "off";
}

export interface AuthSession {
  email: string;
  /** sent to our own API as a bearer token */
  token: string;
}
export type SignInResult = { ok: true; message?: string } | { ok: false; error: string };

export interface AuthApi {
  getSession(): Promise<AuthSession | null>;
  /** called when the session appears, changes or goes away */
  onChange(cb: () => void): () => void;
  signInWithEmail(email: string): Promise<SignInResult>;
  signInWithGoogle(): Promise<SignInResult>;
  signOut(): Promise<void>;
  /** can this mode offer Google? */
  google: boolean;
}

/** Cheap check, no network: could this browser already have a session (so the sync code is worth loading)? */
export function mayBeSignedIn(): boolean {
  const mode = authMode();
  try {
    if (mode === "mock") return localStorage.getItem(MOCK_KEY) !== null;
    if (mode === "supabase") return sessionMayExist();
  } catch {
    /* storage blocked: treat as signed out */
  }
  return false;
}

/** Where the emailed link and Google send you back to. A fixed address (no query string), so it matches the allow-list in Supabase exactly. */
const returnUrl = () => `${location.origin}/signin`;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
let cached: AuthApi | null | undefined;

export function getAuth(): AuthApi | null {
  if (cached !== undefined) return cached;
  const mode = authMode();
  cached = mode === "mock" ? mockAuth() : mode === "supabase" ? supabaseAuth() : null;
  return cached;
}

// ---------------------------------------------------------------- mock (tests and demos only)

const MOCK_KEY = "arb.mockauth";

function mockAuth(): AuthApi {
  const listeners = new Set<() => void>();
  const read = (): AuthSession | null => {
    try {
      const raw = JSON.parse(localStorage.getItem(MOCK_KEY) ?? "null");
      return raw && typeof raw.email === "string" && typeof raw.token === "string" ? raw : null;
    } catch {
      return null;
    }
  };
  const emit = () => listeners.forEach((f) => f());
  if (typeof window !== "undefined") window.addEventListener("storage", (e) => e.key === MOCK_KEY && emit());
  return {
    google: false,
    getSession: async () => read(),
    onChange: (cb) => (listeners.add(cb), () => void listeners.delete(cb)),
    async signInWithEmail(email) {
      const e = email.trim().toLowerCase();
      if (!EMAIL.test(e)) return { ok: false, error: "Enter a valid email address." };
      // Test-only (this whole function never runs in production): "+link" addresses behave like a real email-link
      // sign-in that is waiting for the link to be opened, so that state can be tested.
      if (/\+link@/.test(e)) return { ok: true, message: `We sent a sign-in link to ${e}. Open it on this device.` };
      const name = e.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "user";
      localStorage.setItem(MOCK_KEY, JSON.stringify({ email: e, token: `mock.${name}.x` }));
      emit();
      return { ok: true };
    },
    signInWithGoogle: async () => ({ ok: false, error: "Google sign-in is not available in test mode." }),
    async signOut() {
      localStorage.removeItem(MOCK_KEY);
      emit();
    },
  };
}

/** What a failed "send me a link" can tell us about why. */
export interface SendError {
  name?: string;
  status?: number;
  message?: string;
}

/** A message that blames the right thing: the service being unreachable, too many requests, or (only then) the address. */
export function describeSendError(error: SendError): string {
  const text = `${error.name ?? ""} ${error.message ?? ""}`;
  if (error.status === 429 || /rate.?limit|too many|over_email_send_rate_limit/i.test(text)) return "Too many sign-in emails were requested. Wait a few minutes and try again.";
  if (!error.status || error.status >= 500 || /fetch|network|retryable|failed to/i.test(text))
    return "We cannot reach the sign-in service right now. Your work is safe in this browser. Please try again in a few minutes, or continue without an account.";
  return "Could not send the link. Check the address and try again.";
}

// ---------------------------------------------------------------- Supabase

/** Is there a stored session, or are we coming back from an email link / Google? Only then is the library needed. */
function sessionMayExist(): boolean {
  try {
    if (/access_token=|[?&]code=|error_description=/.test(location.hash + location.search)) return true;
    for (let i = 0; i < localStorage.length; i++) if (/^sb-.+-auth-token$/.test(localStorage.key(i) ?? "")) return true;
  } catch {
    /* storage blocked: treat as signed out */
  }
  return false;
}

function supabaseAuth(): AuthApi {
  type Client = import("@supabase/supabase-js").SupabaseClient;
  let client: Promise<Client> | null = null;
  const listeners = new Set<() => void>();
  const load = () =>
    (client ??= import("@supabase/supabase-js").then(({ createClient }) => {
      const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      c.auth.onAuthStateChange(() => listeners.forEach((f) => f()));
      return c;
    }));

  return {
    // Only offered once Google is switched on in Supabase and NEXT_PUBLIC_AUTH_GOOGLE=1 is set; otherwise the button leads to an error page.
    google: process.env.NEXT_PUBLIC_AUTH_GOOGLE === "1",
    async getSession() {
      if (!client && !sessionMayExist()) return null;
      const { data } = await (await load()).auth.getSession();
      const s = data.session;
      return s?.user.email ? { email: s.user.email, token: s.access_token } : null;
    },
    onChange(cb) {
      listeners.add(cb);
      if (sessionMayExist()) void load(); // start listening (and pick up a returning session) only when one may exist
      return () => void listeners.delete(cb);
    },
    async signInWithEmail(email) {
      const e = email.trim().toLowerCase();
      if (!EMAIL.test(e)) return { ok: false, error: "Enter a valid email address." };
      let error: SendError | null = null;
      try {
        ({ error } = await (await load()).auth.signInWithOtp({ email: e, options: { emailRedirectTo: returnUrl() } }));
      } catch (thrown) {
        error = thrown as SendError;
      }
      if (error) return { ok: false, error: describeSendError(error) };
      return { ok: true, message: `We sent a sign-in link to ${e}. Open it on this device.` };
    },
    async signInWithGoogle() {
      const { error } = await (await load()).auth.signInWithOAuth({ provider: "google", options: { redirectTo: returnUrl() } });
      return error ? { ok: false, error: "Could not start Google sign-in." } : { ok: true };
    },
    async signOut() {
      if (!client && !sessionMayExist()) return;
      await (await load()).auth.signOut();
    },
  };
}

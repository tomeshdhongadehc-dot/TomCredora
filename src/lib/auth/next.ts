/**
 * Where to send someone after they sign in. The address comes from the URL (`/signin?next=/profile`), so it is
 * untrusted: only a path on this same site is ever followed. Anything else (another site, a protocol-relative
 * "//evil.com", a backslash trick, control characters, the sign-in page itself) falls back to the default.
 */
export const DEFAULT_NEXT = "/profile";
export const NEXT_KEY = "arb.signin.next";

export function safeNext(raw: string | null | undefined): string {
  if (!raw || raw.length > 200) return DEFAULT_NEXT;
  // one leading slash (not two), no backslashes, no control characters
  if (!/^\/(?!\/)[^\\\u0000-\u001F\u007F]*$/.test(raw)) return DEFAULT_NEXT;
  // coming back to the sign-in or sign-up page would loop
  if (/^\/sign(?:in|up)(?:[/?#]|$)/i.test(raw)) return DEFAULT_NEXT;
  return raw;
}

/** The page the sign-in button was pressed on, as a value for `?next=`. */
export const signInHref = (from: string) => `/signin?next=${encodeURIComponent(safeNext(from))}`;

/** The same for the "create an account" page. */
export const signUpHref = (from: string) => `/signup?next=${encodeURIComponent(safeNext(from))}`;

/**
 * The Content-Security-Policy. Kept here (not inline in next.config.ts) so it can be unit-tested.
 *
 * Strict by design: the page may talk only to itself, plus the ONE Supabase origin when sign-in is configured
 * (the browser calls it to send the email link and refresh the session). Never a wildcard.
 * Next needs inline scripts/styles unless nonces are wired in (planned); 'unsafe-eval' is dev-only (React refresh).
 */
export function supabaseOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    // The URL parser accepts "*" in a host ("https://*.supabase.co"), which would be a wildcard in the policy.
    if (!/^[a-z0-9.-]+$/i.test(u.hostname)) return null;
    return u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname)) ? u.origin : null;
  } catch {
    return null;
  }
}

export function buildCsp({ isDev, supabaseUrl }: { isDev: boolean; supabaseUrl?: string }): string {
  const supabase = supabaseOrigin(supabaseUrl);
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${supabase ? ` ${supabase}` : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://www.overleaf.com",
    "frame-ancestors 'none'",
  ].join("; ");
}

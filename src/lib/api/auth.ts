import { createClient } from "@supabase/supabase-js";
import { MemoryResumeRepo } from "./resume-repo";
import type { AuthContext } from "./resumes-handler";
import { MemorySnapshotRepo } from "./snapshot-repo";
import { SupabaseResumeRepo } from "./supabase-repo";
import { SupabaseSnapshotRepo } from "./supabase-snapshot-repo";

export const supabaseConfigured = () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * TEST-ONLY sign-in: with AUTH_MODE=mock the server accepts `Bearer mock.<name>.x` as that user and keeps their
 * data in memory. It exists so the whole sign-in and sync flow can be tested without a Supabase project.
 * It can never switch on in production: NODE_ENV is checked here, and `next build`/`next start` set it to production.
 */
export const mockAuthEnabled = () => process.env.AUTH_MODE === "mock" && process.env.NODE_ENV !== "production";

const mem = globalThis as unknown as { __mockResumes?: MemoryResumeRepo; __mockSnapshots?: MemorySnapshotRepo };

/**
 * Verifies the bearer token with Supabase Auth (a signature check is not enough:
 * getUser() also rejects revoked sessions) and returns storage bound to that user's token.
 */
export async function authenticate(req: Request): Promise<AuthContext | null> {
  const header = req.headers.get("authorization") ?? "";

  if (mockAuthEnabled()) {
    const name = /^Bearer mock\.([a-z0-9-]{3,40})\.x$/.exec(header)?.[1];
    if (!name) return null;
    mem.__mockResumes ??= new MemoryResumeRepo();
    mem.__mockSnapshots ??= new MemorySnapshotRepo();
    return { userId: `mock-${name}`, repo: mem.__mockResumes, snapshots: mem.__mockSnapshots };
  }

  if (!supabaseConfigured()) return null;
  const token = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/.exec(header)?.[1];
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const { data, error } = await createClient(url, anon, { auth: { persistSession: false } }).auth.getUser(token);
  if (error || !data.user) return null;
  return { userId: data.user.id, repo: new SupabaseResumeRepo(url, anon, token), snapshots: new SupabaseSnapshotRepo(url, anon, token) };
}

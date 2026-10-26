import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NewResume, ResumePatch, ResumeRepo, StoredResume, UpdateResult } from "./resume-repo";

interface Row {
  id: string;
  title: string;
  data: StoredResume["data"];
  template: StoredResume["template"];
  jd_hash: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

const COLS = "id,title,data,template,jd_hash,version,created_at,updated_at";
const toModel = (r: Row): StoredResume => ({
  id: r.id, title: r.title, data: r.data, template: r.template, jdHash: r.jd_hash,
  version: r.version, createdAt: r.created_at, updatedAt: r.updated_at,
});

/**
 * Supabase-backed repo. It is constructed with the *user's* access token, so every query
 * runs under that user's RLS policies; the explicit user_id filters are defence in depth.
 */
export class SupabaseResumeRepo implements ResumeRepo {
  private db: SupabaseClient;
  constructor(url: string, anonKey: string, accessToken: string) {
    this.db = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async list(userId: string, { limit, before }: { limit: number; before?: string }) {
    let q = this.db.from("resumes").select(COLS).eq("user_id", userId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(limit);
    if (before) q = q.lt("updated_at", before);
    const { data, error } = await q;
    if (error) throw new Error("db_error");
    return (data as Row[]).map(toModel);
  }

  async get(userId: string, id: string) {
    const { data, error } = await this.db.from("resumes").select(COLS).eq("id", id).eq("user_id", userId).is("deleted_at", null).maybeSingle();
    if (error) throw new Error("db_error");
    return data ? toModel(data as Row) : null;
  }

  async create(userId: string, r: NewResume) {
    const { data, error } = await this.db
      .from("resumes")
      .insert({ user_id: userId, title: r.title, data: r.data, template: r.template, jd_hash: r.jdHash ?? null })
      .select(COLS)
      .single();
    if (error) throw new Error("db_error");
    return toModel(data as Row);
  }

  async update(userId: string, id: string, expectedVersion: number, patch: ResumePatch): Promise<UpdateResult> {
    const set: Record<string, unknown> = {};
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.data !== undefined) set.data = patch.data;
    if (patch.template !== undefined) set.template = patch.template;
    if (patch.jdHash !== undefined) set.jd_hash = patch.jdHash;
    // Compare-and-swap on version: zero rows updated means stale version or not ours.
    const { data, error } = await this.db.from("resumes").update(set).eq("id", id).eq("user_id", userId).eq("version", expectedVersion).is("deleted_at", null).select(COLS);
    if (error) throw new Error("db_error");
    if (data && data.length === 1) return { ok: true, value: toModel(data[0] as Row) };
    return (await this.get(userId, id)) ? { ok: false, reason: "version_conflict" } : { ok: false, reason: "not_found" };
  }

  async remove(userId: string, id: string) {
    const { data, error } = await this.db.from("resumes").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId).is("deleted_at", null).select("id");
    if (error) throw new Error("db_error");
    return (data?.length ?? 0) === 1;
  }
}

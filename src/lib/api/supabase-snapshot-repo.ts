import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Snapshot } from "@/lib/sync/model";
import type { PutResult, SnapshotRepo, StoredSnapshot } from "./snapshot-repo";

interface Row {
  data: Snapshot;
  version: number;
  updated_at: string;
}
const toModel = (r: Row): StoredSnapshot => ({ snapshot: r.data, version: r.version, updatedAt: r.updated_at });

/**
 * Supabase-backed snapshot store. Built with the user's own access token, so every query runs under their
 * row-level-security policies; the explicit user_id filters are defence in depth.
 */
export class SupabaseSnapshotRepo implements SnapshotRepo {
  private db: SupabaseClient;
  constructor(url: string, anonKey: string, accessToken: string) {
    this.db = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async get(userId: string) {
    const { data, error } = await this.db.from("user_data").select("data,version,updated_at").eq("user_id", userId).maybeSingle();
    if (error) throw new Error("db_error");
    return data ? toModel(data as Row) : null;
  }

  async put(userId: string, snapshot: Snapshot, expectedVersion: number | null): Promise<PutResult> {
    if (expectedVersion === null) {
      const { data, error } = await this.db.from("user_data").insert({ user_id: userId, data: snapshot }).select("data,version,updated_at").single();
      if (error) {
        if (error.code === "23505") return { ok: false, reason: "version_conflict" }; // unique violation: it exists already
        throw new Error("db_error");
      }
      return { ok: true, value: toModel(data as Row) };
    }
    // Compare-and-swap: zero rows updated means someone else wrote first.
    const { data, error } = await this.db.from("user_data").update({ data: snapshot }).eq("user_id", userId).eq("version", expectedVersion).select("data,version,updated_at");
    if (error) throw new Error("db_error");
    return data && data.length === 1 ? { ok: true, value: toModel(data[0] as Row) } : { ok: false, reason: "version_conflict" };
  }

  async remove(userId: string) {
    const { error, count } = await this.db.from("user_data").delete({ count: "exact" }).eq("user_id", userId);
    if (error) throw new Error("db_error");
    return (count ?? 0) > 0;
  }
}

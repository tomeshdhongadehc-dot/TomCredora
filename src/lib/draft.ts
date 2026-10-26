"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cloneDraft, addResume, exampleDraft, exportBundle, loadDraft, loadWorkspace, parseImport, removeResume, renameResume, saveDraft, saveIndex, touchResume, dataKey, type ImportResult, type ResumeMeta, type StorageLike, type WorkspaceIndex } from "./workspace";
import { emptyDraft, hasContent, type Draft } from "./draft-model";
import { loadProfile, profileHasContent, seededKey, seedFromProfile } from "./profile";
import { notifyLocalChange, onSynced, registerFlush } from "./sync/bus";
import { recordRemoval } from "./sync/removed";
import type { ReviewState } from "./review-state";
import type { Resume } from "./schema";
import type { TemplateConfig } from "./templates";

// Existing importers use these names from "@/lib/draft".
export { emptyResume, newId, type Draft } from "./draft-model";

const HISTORY_LIMIT = 60;
/** Edits closer together than this (typing) are undone as one step. */
const COALESCE_MS = 700;

type Snapshot = Pick<Draft, "resume" | "template">;

/** localStorage if it works (private windows and blocked storage can throw), otherwise a throwaway in-memory store. */
export function getStorage(): StorageLike {
  try {
    const s = window.localStorage;
    s.getItem("arb.probe");
    return s;
  } catch {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  }
}

/**
 * The active resume, autosaved (debounced) to this browser, plus management of several resumes and undo/redo.
 * Renders empty on first paint and fills in after mount, so server and client markup match.
 */
export function useDraft() {
  const [draft, setDraftState] = useState<Draft>(emptyDraft);
  const [index, setIndexState] = useState<WorkspaceIndex>({ activeId: "", items: [] });
  const [ready, setReady] = useState(false);
  const [canHistory, setCanHistory] = useState({ undo: false, redo: false });

  const draftRef = useRef(draft);
  const indexRef = useRef(index);
  const storageRef = useRef<StorageLike | null>(null);
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const lastPush = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);
  const syncHistory = useCallback(() => setCanHistory({ undo: past.current.length > 0, redo: future.current.length > 0 }), []);

  const setDraft = useCallback((d: Draft) => {
    draftRef.current = d;
    setDraftState(d);
  }, []);
  const setIndex = useCallback((i: WorkspaceIndex) => {
    indexRef.current = i;
    setIndexState(i);
  }, []);

  // ---- persistence ----
  const flush = useCallback(() => {
    clearTimeout(saveTimer.current);
    const s = storageRef.current;
    const idx = indexRef.current;
    if (!s || !idx.activeId || !dirty.current) return;
    dirty.current = false;
    saveDraft(s, idx.activeId, draftRef.current);
    const touched = touchResume(idx, idx.activeId);
    indexRef.current = touched; // keep timestamps fresh without re-rendering on every keystroke
    saveIndex(s, touched);
    notifyLocalChange();
  }, []);

  const scheduleSave = useCallback(() => {
    dirty.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 400);
  }, [flush]);

  useEffect(() => {
    const s = getStorage();
    storageRef.current = s;
    const loaded = loadWorkspace(s);
    let first = loaded.draft;
    // An empty resume is seeded once from the profile (if there is one). The marker stops it refilling after the user clears it.
    const prof = loadProfile(s);
    const id = loaded.index.activeId;
    if (id && !hasContent(first.resume) && profileHasContent(prof) && s.getItem(seededKey(id)) === null) {
      first = { ...first, resume: seedFromProfile(prof) };
      try {
        s.setItem(seededKey(id), "1");
      } catch {
        /* blocked storage: seeding just happens again next visit */
      }
      saveDraft(s, id, first);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from storage
    setDraft(first);
    setIndex(loaded.index);
    setReady(true);
    // Sync asks us to save pending edits before it reads, and tells us when it changed what is in storage.
    const unregisterFlush = registerFlush(flush);
    const unsubscribeSynced = onSynced(() => {
      if (dirty.current) return; // an edit is waiting to be saved: keep it, it will sync as the newer copy
      const fresh = loadWorkspace(s);
      past.current = [];
      future.current = [];
      lastPush.current = 0;
      setIndex(fresh.index);
      setDraft(fresh.draft);
      syncHistory();
    });
    // A debounced save can be lost if the tab closes right after an edit.
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    // Also save the moment a field loses focus or the page starts closing, so the short autosave delay can never lose typing.
    document.addEventListener("focusout", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      unregisterFlush();
      unsubscribeSynced();
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      document.removeEventListener("focusout", onHide);
      window.removeEventListener("beforeunload", onHide);
      flush();
    };
  }, [flush, setDraft, setIndex, syncHistory]);

  // ---- edits (the source of truth is draftRef, so updates are sequential and pure) ----
  const record = useCallback((prev: Draft) => {
    const now = Date.now();
    if (now - lastPush.current > COALESCE_MS) {
      past.current.push({ resume: prev.resume, template: prev.template });
      if (past.current.length > HISTORY_LIMIT) past.current.shift();
      future.current = [];
      syncHistory();
    }
    lastPush.current = now;
  }, [syncHistory]);

  const edit = useCallback(
    (fn: (d: Draft) => Draft, recordHistory: boolean) => {
      const prev = draftRef.current;
      const next = fn(prev);
      if (next === prev) return;
      if (recordHistory) record(prev);
      setDraft(next);
      scheduleSave();
    },
    [record, setDraft, scheduleSave],
  );

  const setResume = useCallback((fn: (r: Resume) => Resume) => edit((d) => ({ ...d, resume: fn(d.resume) }), true), [edit]);
  const replaceResume = useCallback((resume: Resume) => edit((d) => ({ ...d, resume }), true), [edit]);
  const setTemplate = useCallback((template: TemplateConfig) => edit((d) => ({ ...d, template }), true), [edit]);
  const setJd = useCallback((jd: string) => edit((d) => ({ ...d, jd }), false), [edit]);
  const setReview = useCallback((fn: (r: ReviewState | null) => ReviewState | null) => edit((d) => ({ ...d, review: fn(d.review) }), false), [edit]);
  const reset = useCallback(() => edit(() => emptyDraft(), true), [edit]);

  const undo = useCallback(() => {
    const snap = past.current.pop();
    if (!snap) return;
    const d = draftRef.current;
    future.current.push({ resume: d.resume, template: d.template });
    lastPush.current = 0;
    setDraft({ ...d, ...snap });
    scheduleSave();
    syncHistory();
  }, [setDraft, scheduleSave, syncHistory]);
  const redo = useCallback(() => {
    const snap = future.current.pop();
    if (!snap) return;
    const d = draftRef.current;
    past.current.push({ resume: d.resume, template: d.template });
    lastPush.current = 0;
    setDraft({ ...d, ...snap });
    scheduleSave();
    syncHistory();
  }, [setDraft, scheduleSave, syncHistory]);

  // ---- managing several resumes ----
  const activate = useCallback(
    (nextIndex: WorkspaceIndex, d: Draft) => {
      past.current = [];
      future.current = [];
      lastPush.current = 0;
      setIndex(nextIndex);
      setDraft(d);
      const s = storageRef.current;
      if (s) saveIndex(s, nextIndex);
      syncHistory();
    },
    [setDraft, setIndex, syncHistory],
  );

  const switchTo = useCallback(
    (id: string) => {
      const idx = indexRef.current;
      if (id === idx.activeId || !idx.items.some((i) => i.id === id) || !storageRef.current) return;
      dirty.current = true;
      flush();
      activate({ ...indexRef.current, activeId: id }, loadDraft(storageRef.current, id) ?? emptyDraft());
    },
    [activate, flush],
  );

  const create = useCallback(
    (name: string, kind: "blank" | "example" | "profile" = "blank"): boolean => {
      const s = storageRef.current;
      if (!s) return false;
      dirty.current = true;
      flush();
      const added = addResume(indexRef.current, name);
      if (!added) return false;
      const prof = kind === "profile" ? loadProfile(s) : null;
      if (kind === "profile" && !profileHasContent(prof)) return false;
      const d = kind === "example" ? exampleDraft() : prof ? { ...emptyDraft(), resume: seedFromProfile(prof) } : emptyDraft();
      saveDraft(s, added.id, d);
      try {
        s.setItem(seededKey(added.id), "1"); // a deliberately created resume is never auto-seeded later
      } catch {
        /* ignore */
      }
      activate(added.index, d);
      notifyLocalChange();
      return true;
    },
    [activate, flush],
  );

  const profileAvailable = useCallback(() => (storageRef.current ? profileHasContent(loadProfile(storageRef.current)) : false), []);

  const duplicate = useCallback(
    (id: string): boolean => {
      const s = storageRef.current;
      if (!s) return false;
      dirty.current = true;
      flush();
      const idx = indexRef.current;
      const source = id === idx.activeId ? draftRef.current : loadDraft(s, id);
      const meta = idx.items.find((i) => i.id === id);
      if (!source || !meta) return false;
      const added = addResume(idx, `${meta.name} copy`);
      if (!added) return false;
      const copy = cloneDraft(source);
      saveDraft(s, added.id, copy);
      activate(added.index, copy);
      notifyLocalChange();
      return true;
    },
    [activate, flush],
  );

  const rename = useCallback(
    (id: string, name: string) => {
      const next = renameResume(indexRef.current, id, name);
      setIndex(next);
      if (storageRef.current) saveIndex(storageRef.current, next);
      notifyLocalChange();
    },
    [setIndex],
  );

  const remove = useCallback(
    (id: string): boolean => {
      const s = storageRef.current;
      const next = removeResume(indexRef.current, id);
      if (!s || !next) return false;
      s.removeItem(dataKey(id));
      recordRemoval(s, id); // so another device does not bring it back
      if (next.activeId !== indexRef.current.activeId) activate(next, loadDraft(s, next.activeId) ?? emptyDraft());
      else {
        setIndex(next);
        saveIndex(s, next);
      }
      notifyLocalChange();
      return true;
    },
    [activate, setIndex],
  );

  const importText = useCallback(
    (text: string, fileName?: string): ImportResult => {
      const result = parseImport(text, fileName?.replace(/\.json$/i, "") || "Imported resume");
      const s = storageRef.current;
      if (!result.ok || !s) return result.ok ? { ok: false, error: "Storage is unavailable in this browser." } : result;
      dirty.current = true;
      flush();
      const added = addResume(indexRef.current, result.name);
      if (!added) return { ok: false, error: "You have reached the limit of saved resumes. Delete one to import another." };
      saveDraft(s, added.id, result.draft);
      activate(added.index, result.draft);
      notifyLocalChange();
      return result;
    },
    [activate, flush],
  );

  const exportText = useCallback((): string => {
    const idx = indexRef.current;
    return exportBundle(idx.items.find((i) => i.id === idx.activeId)?.name ?? "Resume", draftRef.current);
  }, []);

  const resumes: ResumeMeta[] = index.items;
  const activeName = index.items.find((i) => i.id === index.activeId)?.name ?? "";

  return {
    draft,
    ready,
    setResume,
    setJd,
    replaceResume,
    setTemplate,
    setReview,
    reset,
    history: { undo, redo, canUndo: canHistory.undo, canRedo: canHistory.redo },
    workspace: { resumes, activeId: index.activeId, activeName, switchTo, create, profileAvailable, duplicate, rename, remove, importText, exportText },
  };
}

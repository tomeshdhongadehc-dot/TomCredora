"use client";

import { useCallback, useEffect, useState } from "react";
import { templateConfigSchema, type TemplateConfig } from "./templates";

export interface CustomTemplate {
  id: string;
  name: string;
  config: TemplateConfig;
}

const KEY = "arb.templates.v1";
export const MAX_CUSTOM_TEMPLATES = 12;
export const isCustomId = (id: string) => /^custom-[a-z0-9]{4,12}$/.test(id);
export const newCustomId = () => `custom-${Math.random().toString(36).slice(2, 10)}`;

const CONTROL = /[\u0000-\u001F\u007F]/g;
export const cleanName = (s: string) => s.replace(CONTROL, "").replace(/\s+/g, " ").trim().slice(0, 40);

/** Stored templates are untrusted (older versions, manual edits): keep only entries that fully validate. */
export function parseCustomTemplates(raw: unknown): CustomTemplate[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CustomTemplate[] = [];
  for (const item of raw) {
    if (out.length >= MAX_CUSTOM_TEMPLATES || !item || typeof item !== "object") continue;
    const { id, name, config } = item as Record<string, unknown>;
    const cfg = templateConfigSchema.safeParse(config);
    if (typeof id !== "string" || !isCustomId(id) || seen.has(id) || typeof name !== "string" || !cfg.success) continue;
    const n = cleanName(name);
    if (!n) continue;
    seen.add(id);
    out.push({ id, name: n, config: { ...cfg.data, id } });
  }
  return out;
}

function load(): CustomTemplate[] {
  try {
    return parseCustomTemplates(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
  } catch {
    return [];
  }
}

/** The user's saved templates, persisted in this browser only. */
export function useCustomTemplates() {
  const [list, setList] = useState<CustomTemplate[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from storage
    setList(load());
    setReady(true);
  }, []);

  const commit = useCallback((next: CustomTemplate[]) => {
    setList(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage full or blocked: templates still work for this session */
    }
  }, []);

  const add = useCallback(
    (name: string, config: TemplateConfig): CustomTemplate | null => {
      const n = cleanName(name);
      if (!n || list.length >= MAX_CUSTOM_TEMPLATES) return null;
      const id = newCustomId();
      const t = { id, name: n, config: { ...config, id } };
      commit([...list, t]);
      return t;
    },
    [list, commit],
  );
  const update = useCallback((id: string, patch: Partial<Pick<CustomTemplate, "name" | "config">>) => commit(list.map((t) => (t.id === id ? { ...t, ...(patch.name !== undefined ? { name: cleanName(patch.name) || t.name } : {}), ...(patch.config ? { config: { ...patch.config, id } } : {}) } : t))), [list, commit]);
  const remove = useCallback((id: string) => commit(list.filter((t) => t.id !== id)), [list, commit]);

  return { list, ready, add, update, remove, full: list.length >= MAX_CUSTOM_TEMPLATES };
}

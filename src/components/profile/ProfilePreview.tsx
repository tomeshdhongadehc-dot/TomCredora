"use client";

import { useEffect, useState } from "react";
import type { Resume } from "@/lib/schema";
import { PRESETS, presetById } from "@/lib/templates";
import { ResumePaper } from "../ResumePaper";

const KEY = "arb.profile.template";

/**
 * Your profile drawn as a resume, in the template you pick. It is loaded only when the preview is opened, so the
 * profile page itself stays light. The template chosen here is remembered in this browser; it is only a preview.
 */
export default function ProfilePreview({ resume }: { resume: Resume }) {
  const [id, setId] = useState("classic");
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of storage after mount
      if (v && PRESETS.some((p) => p.id === v)) setId(v);
    } catch {
      /* storage blocked: the default template is used */
    }
  }, []);
  const pick = (v: string) => {
    setId(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* not remembered */
    }
  };
  const preset = presetById(id);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="profile-preview-template" className="text-sm font-medium">Template</label>
        <select
          id="profile-preview-template"
          value={preset.id}
          onChange={(e) => pick(e.target.value)}
          className="min-h-10 min-w-0 max-w-full flex-1 rounded-lg border border-line bg-surface px-3 text-sm sm:flex-none sm:w-64"
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <p className="text-xs text-ink-2">This is how your details look in this template. Nothing is sent anywhere. To change the wording, edit the sections above.</p>
      <div className="mx-auto max-w-xl overflow-hidden rounded-lg border border-line bg-white">
        <ResumePaper resume={resume} config={preset.config} showGuide={false} />
      </div>
    </div>
  );
}

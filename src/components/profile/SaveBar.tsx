"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { authMode } from "@/lib/auth/client";
import { signInHref } from "@/lib/auth/next";
import { useAccount } from "@/lib/sync/use-account";

/**
 * Always-visible save status at the bottom of the profile page. Changes are saved on their own as you type; this says
 * so plainly, says WHERE (this browser, or your account), and has a "Save now" button for people who want to press one.
 */
export function SaveBar({ saved, hasContent, saveNow }: { saved: boolean; hasContent: boolean; saveNow: () => void }) {
  const acc = useAccount();
  const pathname = usePathname();
  const signedIn = !!acc.email;
  const accountsOn = authMode() !== "off";

  let text: string;
  let tone = "text-ink-2";
  if (!hasContent) text = "Nothing to save yet. Your changes are saved automatically as you type.";
  else if (!saved) text = "Saving…";
  else if (signedIn && acc.phase === "synced") text = `Saved to your account (${acc.email})`;
  else if (signedIn && acc.phase === "syncing") text = "Saved. Updating your account…";
  else if (signedIn && (acc.phase === "offline" || acc.phase === "error")) {
    text = "Saved in this browser. Could not reach your account yet; it will try again.";
    tone = "text-warn";
  } else if (signedIn) text = "Saved in this browser. Your account updates in a moment.";
  else text = "Saved in this browser on this device.";

  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p role="status" aria-live="polite" data-testid="save-status" className={`min-w-0 flex-1 text-sm ${tone}`}>
          <span aria-hidden className="mr-1.5">{saved && hasContent ? "✓" : ""}</span>
          {text}
          {!signedIn && accountsOn && hasContent && (
            <>
              {" "}
              <Link href={signInHref(pathname)} prefetch={false} className="font-medium text-accent underline underline-offset-2">
                Sign in to keep it on every device
              </Link>
            </>
          )}
        </p>
        <button
          type="button"
          onClick={saveNow}
          className="inline-flex min-h-10 shrink-0 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink hover:brightness-110"
        >
          Save now
        </button>
      </div>
    </div>
  );
}

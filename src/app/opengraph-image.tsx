import { ImageResponse } from "next/og";
import { HOME_TITLE, SITE_NAME } from "@/lib/site";

export const alt = `${SITE_NAME}: ${HOME_TITLE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The card shown when a link to the site is shared (social networks, chat apps). Drawn from text only, so it is always crisp. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#f7f4ee", color: "#1b1b18" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 40, color: "#1f6f5c", fontWeight: 700 }}>
          <div style={{ width: 20, height: 20, borderRadius: 10, background: "#1f6f5c" }} />
          {SITE_NAME}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 76, lineHeight: 1.05, fontWeight: 700, letterSpacing: -2 }}>The right resume for every job, in minutes.</div>
          <div style={{ fontSize: 34, color: "#55554f", lineHeight: 1.3 }}>Free, ATS-friendly resumes tailored to the job description. Honest AI that never makes things up.</div>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 28, color: "#1f6f5c" }}>
          {["23 ATS-safe templates", "PDF, Word, LaTeX, HTML", "No sign-up needed"].map((t) => (
            <div key={t} style={{ display: "flex", padding: "10px 22px", borderRadius: 999, background: "#dcefe8" }}>
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}

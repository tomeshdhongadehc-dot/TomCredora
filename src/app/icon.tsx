import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** The app icon (browser tabs, installed app): a document with a tick, in the brand green. */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1f6f5c" }}>
        <div style={{ width: 300, height: 380, borderRadius: 28, background: "#f7f4ee", display: "flex", flexDirection: "column", padding: 44, gap: 22 }}>
          <div style={{ height: 26, width: 150, borderRadius: 13, background: "#1f6f5c" }} />
          <div style={{ height: 14, width: "100%", borderRadius: 7, background: "#c9d8d2" }} />
          <div style={{ height: 14, width: "86%", borderRadius: 7, background: "#c9d8d2" }} />
          <div style={{ height: 14, width: "92%", borderRadius: 7, background: "#c9d8d2" }} />
          <div style={{ display: "flex", marginTop: "auto", alignSelf: "flex-end", marginRight: 18, marginBottom: 10, width: 30, height: 60, borderRight: "14px solid #1f6f5c", borderBottom: "14px solid #1f6f5c", transform: "rotate(45deg)" }} />
        </div>
      </div>
    ),
    size,
  );
}

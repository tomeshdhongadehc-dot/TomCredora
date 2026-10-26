import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The icon used when the site is added to a phone's home screen. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1f6f5c" }}>
        <div style={{ width: 104, height: 134, borderRadius: 12, background: "#f7f4ee", display: "flex", flexDirection: "column", padding: 16, gap: 8 }}>
          <div style={{ height: 10, width: 52, borderRadius: 5, background: "#1f6f5c" }} />
          <div style={{ height: 5, width: "100%", borderRadius: 3, background: "#c9d8d2" }} />
          <div style={{ height: 5, width: "86%", borderRadius: 3, background: "#c9d8d2" }} />
          <div style={{ display: "flex", marginTop: "auto", alignSelf: "flex-end", marginRight: 6, marginBottom: 4, width: 11, height: 22, borderRight: "6px solid #1f6f5c", borderBottom: "6px solid #1f6f5c", transform: "rotate(45deg)" }} />
        </div>
      </div>
    ),
    size,
  );
}

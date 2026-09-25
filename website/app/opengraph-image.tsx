import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Kyrelo — free, open-source X scheduler and tweet deleter";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function dataUrl(file: string) {
  const buf = await readFile(path.join(process.cwd(), "public", file));
  return `data:image/png;base64,${buf.toString("base64")}`;
}

export default async function Image() {
  const [icon, screenshot] = await Promise.all([dataUrl("icon.png"), dataUrl("screenshot.png")]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#0b0d12",
          backgroundImage:
            "radial-gradient(ellipse 70% 60% at 10% 0%, rgba(124,92,255,0.35), transparent 70%), radial-gradient(ellipse 60% 60% at 90% 10%, rgba(16,185,129,0.18), transparent 70%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: 620,
            padding: "0 0 0 72px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <img src={icon} width={60} height={60} style={{ borderRadius: 14 }} />
            <span style={{ fontSize: 38, fontWeight: 700, color: "#f4f4f5" }}>Kyrelo</span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 36,
              fontSize: 54,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: -1.5,
              color: "#fafafa",
            }}
          >
            <span>Schedule &amp; delete</span>
            <span>your X posts</span>
            <span style={{ color: "#7c5cff" }}>on your computer.</span>
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 26, color: "#a1a1aa" }}>
            Free Buffer &amp; TweetDelete alternative
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 36 }}>
            {["Free", "Open source", "macOS & Windows"].map((t) => (
              <div
                key={t}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 18px",
                  borderRadius: 999,
                  border: "1px solid #2a3142",
                  background: "#11141b",
                  fontSize: 20,
                  color: "#d4d4d8",
                }}
              >
                <div style={{ width: 9, height: 9, borderRadius: 9, background: "#10b981" }} />
                {t}
              </div>
            ))}
          </div>
        </div>

        <img
          src={screenshot}
          width={860}
          height={557}
          style={{
            position: "absolute",
            left: 660,
            top: 70,
            borderRadius: 18,
            boxShadow: "0 30px 80px rgba(124,92,255,0.35)",
          }}
        />
      </div>
    ),
    size,
  );
}

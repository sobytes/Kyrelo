import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import tokens from "../design-tokens.json";

export const alt = "Kyrelo — free, open-source Buffer and Postiz alternative for 17 platforms, with AI comment replies";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function dataUrl(file: string) {
  const buf = await readFile(path.join(process.cwd(), "public", file));
  return `data:image/png;base64,${buf.toString("base64")}`;
}

// Colours from the design tokens (design-tokens.json). ImageResponse can't
// use Tailwind classes, so they're read here.
const c = tokens.color;

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
          backgroundColor: c.canvas,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: 600,
            padding: "0 0 0 72px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <img src={icon} width={48} height={48} style={{ borderRadius: 8 }} />
            <span style={{ fontSize: 32, fontWeight: 700, color: c.fg }}>Kyrelo</span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 40,
              fontSize: 52,
              fontWeight: 700,
              lineHeight: 1.12,
              letterSpacing: -1.5,
              color: c.fg,
            }}
          >
            <span>Run your socials</span>
            <span>from your own computer.</span>
          </div>
          <div style={{ display: "flex", marginTop: 24, fontSize: 24, color: c.muted }}>
            17 platforms · AI comment replies
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 36 }}>
            {["Free", "Open source", "macOS & Windows"].map((t) => (
              <div
                key={t}
                style={{
                  display: "flex",
                  padding: "8px 14px",
                  borderRadius: 4,
                  border: `1px solid ${c.line}`,
                  background: c.surface,
                  fontSize: 19,
                  color: c.fg,
                }}
              >
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
            borderRadius: 12,
            border: `1px solid ${c.line}`,
          }}
        />
      </div>
    ),
    size,
  );
}

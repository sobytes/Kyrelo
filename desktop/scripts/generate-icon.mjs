// Generates build/icon.icns + build/icon.png from an inline SVG.
// Uses Playwright to rasterize and macOS's iconutil to assemble the iconset.

import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(__dirname, "..", "build");

const SVG = `
<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#171a23"/>
      <stop offset="100%" stop-color="#0b0d12"/>
    </linearGradient>
    <linearGradient id="x" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#a78bfa"/>
      <stop offset="55%" stop-color="#7c5cff"/>
      <stop offset="100%" stop-color="#10b981"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#7c5cff" stop-opacity="0.45"/>
      <stop offset="60%" stop-color="#7c5cff" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1024" height="1024" rx="224" fill="url(#bg)"/>

  <!-- Soft halo behind the mark -->
  <circle cx="512" cy="512" r="380" fill="url(#glow)"/>

  <!-- Radar rings -->
  <circle cx="512" cy="512" r="400" fill="none" stroke="#222836" stroke-width="3"/>
  <circle cx="512" cy="512" r="300" fill="none" stroke="#222836" stroke-width="3"/>
  <circle cx="512" cy="512" r="200" fill="none" stroke="#222836" stroke-width="3"/>

  <!-- Pulse dot top-right indicating "live watching" -->
  <circle cx="780" cy="244" r="34" fill="#10b981"/>
  <circle cx="780" cy="244" r="58" fill="none" stroke="#10b981" stroke-opacity="0.35" stroke-width="6"/>

  <!-- X mark -->
  <g transform="translate(512 512)" stroke="url(#x)" stroke-width="92" stroke-linecap="round" fill="none">
    <line x1="-180" y1="-180" x2="180" y2="180"/>
    <line x1="180" y1="-180" x2="-180" y2="180"/>
  </g>
</svg>
`;

const html = `<!DOCTYPE html><html><head><style>html,body{margin:0;padding:0;background:transparent}</style></head><body>${SVG}</body></html>`;

async function main() {
  await fs.mkdir(buildDir, { recursive: true });

  console.log("Rendering icon PNG via Playwright…");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  await page.setContent(html);
  const pngPath = path.join(buildDir, "icon.png");
  await page.locator("svg").screenshot({ path: pngPath, omitBackground: true });
  await browser.close();
  console.log(`  ${pngPath}`);

  const isetDir = path.join(buildDir, "icon.iconset");
  await fs.rm(isetDir, { recursive: true, force: true });
  await fs.mkdir(isetDir);

  const sizes = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"],
  ];

  console.log("Resizing for iconset…");
  for (const [size, name] of sizes) {
    execSync(`sips -z ${size} ${size} "${pngPath}" --out "${path.join(isetDir, name)}"`, {
      stdio: "pipe",
    });
  }

  console.log("Building .icns…");
  const icnsPath = path.join(buildDir, "icon.icns");
  execSync(`iconutil -c icns "${isetDir}" -o "${icnsPath}"`, { stdio: "inherit" });
  await fs.rm(isetDir, { recursive: true, force: true });

  console.log(`\nIcon written:\n  ${pngPath}\n  ${icnsPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

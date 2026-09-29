// Generates build/icon.icns + build/icon.png from an inline SVG.
// Uses Playwright to rasterize and macOS's iconutil to assemble the iconset.

import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(__dirname, "..", "build");

// Flat, from the design tokens (contracts/design-tokens.json): a geometric K
// in canvas on primary. `rounded` is Apple's macOS icon shape, which the
// platform requires; the square one is for iOS, which masks icons itself.
const tokens = JSON.parse(await fs.readFile(path.join(__dirname, "..", "..", "contracts", "design-tokens.json"), "utf8"));
const iconSvg = (rounded) => `
<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" rx="${rounded ? 224 : 0}" fill="${tokens.color.primary}"/>
  <!-- K as one outline (no seams where parts meet), horizontal cuts. -->
  <polygon fill="${tokens.color.canvas}" points="330,290 430,290 430,470 610,290 740,290 548,482 750,734 620,734 476,554 430,600 430,734 330,734"/>
</svg>
`;

const page = (svg) =>
  `<!DOCTYPE html><html><head><style>html,body{margin:0;padding:0;background:transparent}</style></head><body>${svg}</body></html>`;

async function main() {
  await fs.mkdir(buildDir, { recursive: true });

  console.log("Rendering icon PNG via Playwright…");
  const browser = await chromium.launch({ channel: "chrome" });
  const tab = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  const pngPath = path.join(buildDir, "icon.png");
  const squarePath = path.join(buildDir, "icon-square.png");
  for (const [file, rounded] of [[pngPath, true], [squarePath, false]]) {
    await tab.setContent(page(iconSvg(rounded)));
    await tab.locator("svg").screenshot({ path: file, omitBackground: true });
    console.log(`  ${file}`);
  }
  await browser.close();

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

  console.log(`\nIcon written:\n  ${pngPath}\n  ${squarePath} (iOS)\n  ${icnsPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Writes the iPhone app's service icons (vector template images in its asset
// catalog) from contracts/service-icons.json, the shapes the desktop draws.
// Run after changing an icon: npm run service-icons. A contract test fails if
// the iPhone's copies are out of date.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
export const ASSETS_DIR = path.join(root, "mobile", "ios", "Kyrelo", "Resources", "Assets.xcassets");

/** The asset catalog files for one service: a template image, so it takes the text colour. */
export function iosIconFiles(id, markup, viewBox) {
  // Xcode's SVG reader doesn't know currentColor; template images only use the shape.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="24" height="24">${markup.replaceAll("currentColor", "#000000")}</svg>\n`;
  const contents = {
    images: [{ filename: `${id}.svg`, idiom: "universal" }],
    info: { author: "xcode", version: 1 },
    properties: { "preserves-vector-representation": true, "template-rendering-intent": "template" },
  };
  return {
    dir: path.join(ASSETS_DIR, `Service-${id}.imageset`),
    files: { [`${id}.svg`]: svg, "Contents.json": JSON.stringify(contents, null, 2) + "\n" },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { viewBox, icons } = JSON.parse(await fs.readFile(path.join(root, "contracts", "service-icons.json"), "utf8"));
  for (const [id, markup] of Object.entries(icons)) {
    const { dir, files } = iosIconFiles(id, markup, viewBox);
    await fs.mkdir(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(dir, name), content);
    console.log(`wrote ${path.relative(root, dir)}`);
  }
}

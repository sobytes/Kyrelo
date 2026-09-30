import { Locator, Page } from "playwright";
import { humanType, jitter, openBrowser } from "./session";

// Posting to Instagram through instagram.com, in the account's own Chrome
// profile (the connect flow signed it in). Instagram's web "Create" flow:
// pick the photo, Next past crop and filters, write the caption, Share. The
// share request's response carries the new post's shortcode for its link.

export async function postToInstagramBrowser(
  accountId: string,
  caption: string,
  imagePath: string,
  options: { headless?: boolean; onBrowserReady?: () => Promise<unknown> } = {},
): Promise<{ url: string }> {
  const browser = await openBrowser("instagram", {
    purpose: "post",
    headless: options.headless ?? false,
    accountId,
  });
  await options.onBrowserReady?.().catch((err) => console.warn("[instagram-post] onBrowserReady failed:", err));
  const { page } = browser;

  try {
    console.log(`[instagram-post] starting post for accountId=${accountId}`);
    await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded" });
    await jitter(2500, 4000);
    assertSignedIn(page);
    await dismissPrompts(page);

    await openCreateDialog(page);
    const dialog = page.locator('div[role="dialog"]').last();

    console.log("[instagram-post] attaching photo");
    const fileInput = page.locator('div[role="dialog"] input[type="file"], input[type="file"][accept*="image"]').first();
    await fileInput.waitFor({ state: "attached", timeout: 15_000 }).catch(() => {
      throw new Error("Couldn't find Instagram's photo picker. Instagram may have changed its site.");
    });
    await fileInput.setInputFiles(imagePath);
    await jitter(2000, 3500);

    await keepOriginalCrop(page);
    // Crop → filters → caption.
    await clickButton(dialog, "Next");
    await jitter(1200, 2200);
    await clickButton(dialog, "Next");
    await jitter(1200, 2200);

    console.log("[instagram-post] writing caption");
    const captionBox = page
      .locator('div[role="dialog"] div[contenteditable="true"][role="textbox"], div[aria-label^="Write a caption"]')
      .first();
    await captionBox.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {
      throw new Error("Couldn't find Instagram's caption box. Instagram may have changed its site.");
    });
    await captionBox.click();
    await jitter(400, 900);
    await humanType(page, caption);
    await jitter(800, 1500);

    // The share request answers with the new post, including its shortcode.
    const shared = page
      .waitForResponse((r) => /\/media\/configure/.test(r.url()) && r.request().method() === "POST", { timeout: 90_000 })
      .catch(() => null);
    await clickButton(dialog, "Share");
    console.log("[instagram-post] clicked Share, waiting for Instagram");

    const response = await shared;
    if (!response) throw new Error("Instagram didn't confirm the post within 90 seconds. Check the account before retrying.");
    const body = (await response.json().catch(() => null)) as
      | { status?: string; message?: string; media?: { code?: string } }
      | null;
    if (!response.ok() || body?.status === "fail") {
      throw new Error(`Instagram refused the post: ${body?.message ?? `HTTP ${response.status()}`}`);
    }
    await jitter(2000, 3000);
    const code = body?.media?.code;
    return { url: code ? `https://www.instagram.com/p/${code}/` : `https://www.instagram.com/${accountId}/` };
  } finally {
    await browser.close();
  }
}

/** Throws if Instagram sent the page to its login screen (the saved session expired). */
function assertSignedIn(page: Page) {
  if (page.url().includes("/accounts/login")) {
    throw new Error("Instagram session expired. Reconnect it under Instagram → Accounts.");
  }
}

/** "Turn on notifications?" and similar: answer Not now so they don't cover the page. */
async function dismissPrompts(page: Page) {
  for (let i = 0; i < 2; i++) {
    const notNow = page.getByRole("button", { name: /^not now$/i }).first();
    if (!(await notNow.isVisible({ timeout: 1500 }).catch(() => false))) return;
    await notNow.click().catch(() => {});
    await jitter(600, 1200);
  }
}

/** The sidebar's Create (New post), then Post if Instagram asks which kind. */
async function openCreateDialog(page: Page) {
  const create = page.locator('svg[aria-label="New post"]').first();
  await create.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {
    throw new Error("Couldn't find Instagram's Create button. Instagram may have changed its site.");
  });
  await create.click();
  await jitter(800, 1500);
  const post = page.locator('svg[aria-label="Post"]').first();
  if (await post.isVisible({ timeout: 2000 }).catch(() => false)) {
    await post.click();
    await jitter(800, 1500);
  }
}

/** Instagram crops to a square by default; ask for the photo's own shape. */
async function keepOriginalCrop(page: Page) {
  try {
    const crop = page.locator('svg[aria-label="Select crop"]').first();
    if (!(await crop.isVisible({ timeout: 3000 }))) return;
    await crop.click();
    await jitter(400, 800);
    await page.getByText("Original", { exact: true }).first().click({ timeout: 3000 });
    await jitter(400, 800);
  } catch {
    // Keep Instagram's default crop rather than fail the post.
    console.warn("[instagram-post] couldn't choose the original crop");
  }
}

/** Instagram's dialog buttons are often divs with role="button". */
async function clickButton(dialog: Locator, name: string) {
  const button = dialog.getByRole("button", { name, exact: true }).first();
  await button.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {
    throw new Error(`Couldn't find Instagram's ${name} button. Instagram may have changed its site.`);
  });
  await button.click();
}

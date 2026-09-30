import { Locator, Page } from "playwright";
import { humanType, jitter, openBrowser } from "./session";

// Posting to Facebook through facebook.com, in the account's own Chrome
// profile. The connect flow saved the session as whichever profile was active:
// usually a Page the user switched into (Facebook's i_user cookie), or their
// own profile. Open the composer, add the photo, write, Post.

export async function postToFacebookBrowser(
  accountId: string,
  text: string,
  options: { headless?: boolean; imagePath?: string; onBrowserReady?: () => Promise<unknown> } = {},
): Promise<{ url: string }> {
  const browser = await openBrowser("facebook", {
    purpose: "post",
    headless: options.headless ?? false,
    accountId,
  });
  await options.onBrowserReady?.().catch((err) => console.warn("[facebook-post] onBrowserReady failed:", err));
  const { page } = browser;

  try {
    console.log(`[facebook-post] starting post for accountId=${accountId}`);
    await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });
    await jitter(2500, 4000);
    if (/\/login|checkpoint/.test(page.url())) {
      throw new Error("Facebook session expired. Reconnect it under Facebook → Accounts.");
    }

    await openComposer(page);
    const dialog = page.locator('div[role="dialog"]').filter({ has: page.locator('div[contenteditable="true"]') }).last();

    if (options.imagePath) {
      console.log("[facebook-post] attaching photo");
      await dialog.getByRole("button", { name: /photo\/video/i }).first().click({ timeout: 8_000 }).catch(() => {});
      const fileInput = dialog.locator('input[type="file"][accept*="image"]').first();
      await fileInput.waitFor({ state: "attached", timeout: 10_000 }).catch(() => {
        throw new Error("Couldn't find Facebook's photo picker. Facebook may have changed its site.");
      });
      await fileInput.setInputFiles(options.imagePath);
      await jitter(2500, 4000);
    }

    console.log("[facebook-post] writing post");
    const box = dialog.locator('div[contenteditable="true"][role="textbox"]').first();
    await box.click();
    await jitter(400, 900);
    await humanType(page, text);
    await jitter(800, 1500);

    // The create request's reply includes the new post's link.
    const created = page
      .waitForResponse((r) => r.url().includes("/api/graphql") && /ComposerStoryCreateMutation/.test(r.request().postData() ?? ""), {
        timeout: 90_000,
      })
      .catch(() => null);
    // Newer composers ask for audience or options on a second step first.
    const next = dialog.getByRole("button", { name: "Next", exact: true }).first();
    if (await next.isVisible({ timeout: 1500 }).catch(() => false)) {
      await next.click();
      await jitter(800, 1500);
    }
    await clickButton(page, "Post");
    console.log("[facebook-post] clicked Post, waiting for Facebook");

    const response = await created;
    if (!response) throw new Error("Facebook didn't confirm the post within 90 seconds. Check the account before retrying.");
    const body = await response.text().catch(() => "");
    const error = body.match(/"(?:description|summary)":"([^"]+)"/)?.[1];
    if (/"errors":\[/.test(body) && error) throw new Error(`Facebook refused the post: ${error}`);
    await jitter(2000, 3000);
    const url = body.match(/"url":"(https:\\\/\\\/www\.facebook\.com\\\/[^"]+)"/)?.[1]?.replaceAll("\\/", "/");
    return { url: url ?? `https://www.facebook.com/${accountId}` };
  } finally {
    await browser.close();
  }
}

/** "What's on your mind?" on a profile, "Create post" on a Page. */
async function openComposer(page: Page) {
  const opener = page.getByRole("button", { name: /what's on your mind|create post/i }).first();
  await opener.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {
    throw new Error("Couldn't find Facebook's post box. Facebook may have changed its site.");
  });
  await opener.click();
  await page.locator('div[role="dialog"] div[contenteditable="true"][role="textbox"]').first().waitFor({ state: "visible", timeout: 15_000 });
  await jitter(800, 1500);
}

async function clickButton(page: Page, name: string) {
  const button: Locator = page.locator('div[role="dialog"]').getByRole("button", { name, exact: true }).last();
  await button.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {
    throw new Error(`Couldn't find Facebook's ${name} button. Facebook may have changed its site.`);
  });
  await button.click();
}

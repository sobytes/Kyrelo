import { Locator, Page } from "playwright";
import { humanType, jitter, openBrowser } from "./session";

// Posts to LinkedIn through the account's own Chrome profile, the same way a
// person would: feed → "Start a post" → type → (image) → Post. LinkedIn's
// official API needs an approved developer app, which a local open-source app
// can't ship, and it detects automation aggressively, so everything here is
// paced like a human.

export interface PostResult {
  url: string;
}

function assertLinkedInSignedIn(page: Page) {
  if (/\/(login|authwall|checkpoint|uas\/login)/.test(page.url())) {
    throw new Error("LinkedIn session expired. Reconnect under Connected accounts.");
  }
}

/** The first of `candidates` that becomes visible, or null. */
async function firstVisible(candidates: Locator[], timeoutMs: number): Promise<Locator | null> {
  for (const loc of candidates) {
    try {
      await loc.first().waitFor({ state: "visible", timeout: timeoutMs });
      return loc.first();
    } catch {
      // try the next selector
    }
  }
  return null;
}

// The share call LinkedIn's web app makes when you press Post. Its exact path
// has changed over time, so match the stable parts.
const SHARE_REQUEST = /\/voyager\/api\/.*(contentcreation|normShares|shares)/i;

export async function postLinkedInBrowser(
  accountId: string,
  text: string,
  options: {
    headless?: boolean;
    imagePath?: string;
    /** Called once the browser is open, i.e. after any wait for another job. */
    onBrowserReady?: () => Promise<unknown>;
  } = {},
): Promise<PostResult> {
  const browser = await openBrowser("linkedin", {
    purpose: "post",
    headless: options.headless ?? false,
    accountId,
  });
  const { page } = browser;
  await options.onBrowserReady?.().catch((err) => console.warn("[linkedin-post] onBrowserReady failed:", err));

  try {
    console.log(`[linkedin-post] starting post for ${accountId}: ${text.slice(0, 60).replace(/\n/g, " ")}…`);
    await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded" });
    await jitter(2500, 4500);
    assertLinkedInSignedIn(page);

    const startPost = await firstVisible(
      [
        page.getByRole("button", { name: /start a post/i }),
        page.locator(".share-box-feed-entry__trigger"),
      ],
      10_000,
    );
    if (!startPost) throw new Error('Couldn\'t find LinkedIn\'s "Start a post" button');
    await startPost.click();
    await jitter(1200, 2200);

    const editor = await firstVisible(
      [
        page.locator('div.ql-editor[contenteditable="true"]'),
        page.locator('[role="textbox"][contenteditable="true"]'),
      ],
      10_000,
    );
    if (!editor) throw new Error("Couldn't find LinkedIn's post editor");
    await editor.click();
    await jitter(400, 900);
    await humanType(page, text);
    await jitter(800, 1500);

    if (options.imagePath) {
      console.log(`[linkedin-post] attaching image: ${options.imagePath}`);
      const addMedia = await firstVisible(
        [
          page.getByRole("button", { name: /add (a )?(media|photo)/i }),
          page.locator('button[aria-label*="photo" i], button[aria-label*="media" i]'),
        ],
        6_000,
      );
      if (!addMedia) throw new Error("Couldn't find LinkedIn's add-photo button");
      const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 10_000 }), addMedia.click()]);
      await chooser.setFiles(options.imagePath);
      await jitter(2000, 3500);
      // The image editor opens on top of the post; "Next" returns to it.
      const next = await firstVisible([page.getByRole("button", { name: /^(next|done)$/i })], 20_000);
      if (!next) throw new Error("LinkedIn didn't accept the image");
      await next.click();
      await jitter(1000, 2000);
    }

    // Only a successful share request means the post exists.
    const shareResponse = page
      .waitForResponse((r) => r.request().method() === "POST" && SHARE_REQUEST.test(r.url()), { timeout: 30_000 })
      .catch(() => null);

    const postButton = await firstVisible(
      [
        page.getByRole("button", { name: "Post", exact: true }),
        page.locator("button.share-actions__primary-action"),
      ],
      6_000,
    );
    if (!postButton) throw new Error("Couldn't find LinkedIn's Post button");
    await postButton.click();
    console.log("[linkedin-post] clicked Post");

    const res = await shareResponse;
    if (!res) throw new Error("LinkedIn didn't confirm the post within 30s — it may not have gone out.");
    if (res.status() >= 400) throw new Error(`LinkedIn rejected the post (HTTP ${res.status()})`);

    const body = await res.text().catch(() => "");
    const urn = body.match(/urn:li:(?:activity|share|ugcPost):\d+/)?.[0];
    await jitter(1500, 2500);
    const url = urn ? `https://www.linkedin.com/feed/update/${urn}/` : "https://www.linkedin.com/feed/";
    console.log(`[linkedin-post] success → ${url}`);
    return { url };
  } finally {
    await browser.close();
  }
}

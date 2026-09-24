import { Page } from "playwright";
import { humanType, jitter, openBrowser, warmup } from "./session";

function assertLoggedIn(page: Page) {
  const url = page.url();
  if (url.includes("/login") || url.includes("/i/flow/login")) {
    throw new Error("X session expired. Reconnect under Connected accounts.");
  }
}

// X's @mention / #hashtag typeahead floats over the composer's action bar and
// can intercept the submit click. Escape clears it — but the /compose/post
// composer is a modal, and an Escape with no typeahead open closes the whole
// modal (popping X's "Save post?" draft dialog). So only send Escape when the
// dropdown is genuinely visible.
async function dismissTypeahead(page: Page): Promise<void> {
  try {
    const dropdown = page
      .locator('[data-testid="typeaheadResult"], [data-testid="TypeaheadUser"]')
      .first();
    if (await dropdown.isVisible()) {
      await page.keyboard.press("Escape");
      console.log("[twitter-post] dismissed @/# typeahead popup");
    }
  } catch {
    // no typeahead present — skip Escape so the compose modal stays open
  }
}

export interface PostResult {
  url?: string;
}

const COMPOSER_SELECTORS = [
  'div[data-testid="tweetTextarea_0"]',
  'div[data-testid^="tweetTextarea"][role="textbox"]',
  'div[role="textbox"][aria-label*="Post text"]',
  'div[role="textbox"][aria-label*="Tweet text"]',
  'div[contenteditable="true"][role="textbox"]',
];

const SUBMIT_SELECTORS = [
  'button[data-testid="tweetButton"]',
  'button[data-testid="tweetButtonInline"]',
];

export async function postTweetBrowser(
  accountId: string,
  text: string,
  options: { headless?: boolean; imagePath?: string } = {},
): Promise<PostResult> {
  // Default visible so the user can watch the post happen live; flip via the
  // Settings toggle for fully background operation.
  const browser = await openBrowser("twitter", {
    headless: options.headless ?? false,
    accountId,
  });
  const { page } = browser;

  // X submits via /i/api/graphql/.../CreateTweet; the response includes the
  // new tweet's rest_id. Capture it so we can store the real permalink
  // instead of wherever the page navigates to after submit.
  let capturedStatusId: string | null = null;
  page.on("response", async (response) => {
    try {
      const url = response.url();
      if (!url.includes("/i/api/graphql/")) return;
      if (!/createtweet|createnotetweet/i.test(url)) return;
      const json = (await response.json().catch(() => null)) as
        | { data?: { create_tweet?: { tweet_results?: { result?: { rest_id?: string } } }; notetweet_create?: { tweet_results?: { result?: { rest_id?: string } } } } }
        | null;
      const restId =
        json?.data?.create_tweet?.tweet_results?.result?.rest_id ??
        json?.data?.notetweet_create?.tweet_results?.result?.rest_id;
      if (typeof restId === "string" && /^\d+$/.test(restId)) {
        capturedStatusId = restId;
      }
    } catch {
      // ignore
    }
  });

  try {
    console.log(`[twitter-post] starting post for accountId=${accountId} text=${text.slice(0, 60).replace(/\n/g, " ")}…`);
    try {
      await warmup(page, "https://x.com/home");
      console.log(`[twitter-post] warmup done, url=${page.url()}`);
    } catch (err) {
      console.warn("[twitter-post] warmup skipped:", err);
    }
    assertLoggedIn(page);

    await page.goto("https://x.com/compose/post", { waitUntil: "domcontentloaded" });
    console.log(`[twitter-post] on compose page, url=${page.url()}`);
    await jitter(1500, 3000);
    assertLoggedIn(page);

    let composer = null as ReturnType<Page["locator"]> | null;
    for (const sel of COMPOSER_SELECTORS) {
      const loc = page.locator(sel).first();
      try {
        await loc.waitFor({ state: "visible", timeout: 6_000 });
        composer = loc;
        break;
      } catch {
        // try next
      }
    }
    if (!composer) throw new Error("Couldn't find tweet composer");
    console.log("[twitter-post] composer found, typing text");

    await composer.click();
    await jitter(300, 800);

    if (options.imagePath) {
      console.log(`[twitter-post] attaching image: ${options.imagePath}`);
      const fileInput = page.locator('input[data-testid="fileInput"]').first();
      try {
        await fileInput.waitFor({ state: "attached", timeout: 5_000 });
        await fileInput.setInputFiles(options.imagePath);
        // Wait for the attached-image preview to render.
        await page
          .locator('[data-testid="attachments"]')
          .first()
          .waitFor({ state: "visible", timeout: 20_000 });
        console.log("[twitter-post] image upload preview ready");
        await jitter(700, 1400);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Couldn't attach image: ${msg}`);
      }
    }

    await humanType(page, text);
    await jitter(800, 1500);

    // X auto-suggests as you type (#hashtags, @mentions). The suggestion popup
    // floats over the action bar and steals clicks + intercepts Enter/Cmd+Enter,
    // so dismiss it before submitting — but only if it's actually open (a stray
    // Escape would close the compose modal instead).
    await dismissTypeahead(page);
    await jitter(200, 500);
    console.log("[twitter-post] text typed, submitting");

    // Wait for the CreateTweet response — that's the definitive "post sent"
    // signal. If we click submit but the click doesn't take, this race times
    // out and we know to throw.
    const createTweetResponse = page
      .waitForResponse(
        (r) => /createtweet|createnotetweet/i.test(r.url()) && r.status() < 400,
        { timeout: 20_000 },
      )
      .catch(() => null);

    let clicked = false;

    // Prefer the accessible Post button — Playwright matches the visible
    // button by its rendered name, so the autocomplete popup can't steal it.
    const named = page.getByRole("button", { name: "Post", exact: true }).first();
    try {
      await named.waitFor({ state: "visible", timeout: 4_000 });
      if (await named.isEnabled()) {
        await named.click({ timeout: 4_000 });
        clicked = true;
        console.log("[twitter-post] clicked Post button (by role)");
      }
    } catch {
      // fall through to testid-based selectors
    }

    if (!clicked) {
      for (const sel of SUBMIT_SELECTORS) {
        const btn = page.locator(sel).first();
        try {
          await btn.waitFor({ state: "visible", timeout: 3_000 });
          if (await btn.isEnabled()) {
            await btn.click({ timeout: 4_000 });
            clicked = true;
            console.log(`[twitter-post] clicked Post button (${sel})`);
            break;
          }
        } catch {
          // try next
        }
      }
    }

    if (!clicked) {
      const modifier = process.platform === "darwin" ? "Meta" : "Control";
      await page.keyboard.press(`${modifier}+Enter`);
      console.log("[twitter-post] fell back to keyboard shortcut");
    }

    const resp = await createTweetResponse;
    if (!resp) {
      throw new Error(
        "Submit didn't produce a CreateTweet response within 20s — the click probably didn't go through (autocomplete overlay? captcha?).",
      );
    }
    console.log(`[twitter-post] CreateTweet response: status=${resp.status()}`);

    await jitter(1500, 2500);

    if (capturedStatusId) {
      const url = `https://x.com/${accountId}/status/${capturedStatusId}`;
      console.log(`[twitter-post] success, captured statusId=${capturedStatusId} → ${url}`);
      return { url };
    }
    console.log(`[twitter-post] success but no statusId captured, falling back to page.url()=${page.url()}`);
    return { url: page.url() };
  } finally {
    await browser.close();
  }
}

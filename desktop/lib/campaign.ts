import { researchCampaign, writeCampaignDrafts, WrittenDraft } from "./campaign-ai";
import { spreadTimes } from "./campaign-timing";
import { fetchOgImage, generateAiImage, screenshotPage } from "./media";
import { createScheduledPost } from "./scheduler";
import { getApiKeys, getCampaign, getGrokSettings, listMediaItems, upsertCampaign } from "./storage";
import { MAX_TWEET_LENGTH, tweetLength } from "./tweet";
import { Campaign, CampaignDraft, MediaItem } from "./types";

// Auto Campaign pipeline: research → write → media → (review) → schedule.
// Runs in the background inside the Next server; the UI polls the stored
// campaign record for progress.

/** Drops trailing words (never URLs) until the post fits. */
function fitTweet(text: string): string {
  if (tweetLength(text) <= MAX_TWEET_LENGTH) return text;
  const words = text.split(/(\s+)/);
  for (let i = words.length - 1; i >= 0 && tweetLength(words.join("") + "…") > MAX_TWEET_LENGTH; i--) {
    if (!/^https?:\/\//.test(words[i])) words.splice(i, 1);
  }
  return words.join("").trimEnd() + "…";
}

// Campaign ids with a pipeline running in this process. Stored on globalThis so
// Next's dev-mode module reloads don't forget in-flight jobs.
const running: Set<string> = ((globalThis as { __kyreloCampaigns?: Set<string> }).__kyreloCampaigns ??=
  new Set());

export async function hasOpenAiKey(): Promise<boolean> {
  return Boolean(process.env.OPENAI_API_KEY || (await getApiKeys()).openai);
}

export interface StartCampaignInput {
  accountId: string;
  brief: string;
  url: string;
  competitors: string;
  count: number;
  windowMinutes: number;
  useAiImages: boolean;
  autoSchedule: boolean;
}

export async function startCampaign(input: StartCampaignInput): Promise<Campaign> {
  const settings = await getGrokSettings();
  const campaign: Campaign = {
    id: crypto.randomUUID(),
    ...input,
    useAiImages: input.useAiImages && (await hasOpenAiKey()),
    provider: settings.aiProvider,
    status: "researching",
    progress: "Reading your site and researching the market…",
    drafts: [],
    postIds: [],
    createdAt: new Date().toISOString(),
  };
  await upsertCampaign(campaign);
  running.add(campaign.id);
  void runCampaign(campaign).finally(() => running.delete(campaign.id));
  return campaign;
}

/** Loads a campaign, marking it failed if its pipeline died with the app. */
export async function loadCampaign(id: string): Promise<Campaign | null> {
  const c = await getCampaign(id);
  if (!c) return null;
  const inFlight = c.status === "researching" || c.status === "writing" || c.status === "media";
  if (inFlight && !running.has(c.id)) {
    c.status = "failed";
    c.error = "The app closed while this campaign was being prepared. Start it again.";
    await upsertCampaign(c);
  }
  return c;
}

async function runCampaign(c: Campaign): Promise<void> {
  const save = (patch: Partial<Campaign>) => upsertCampaign(Object.assign(c, patch));
  try {
    const research = await researchCampaign(c);
    await save({
      status: "writing",
      progress: `Research done (${research.sources.length} sources). Writing ${c.count} posts…`,
      research: research.notes,
    });

    const library = await listMediaItems();
    const written = await writeCampaignDrafts({
      ...c,
      research,
      library,
      allowAiImages: c.useAiImages,
    });

    await save({ status: "media", progress: "Preparing images and links…" });
    const times = spreadTimes(written.length, c.windowMinutes);
    // One og:image download per campaign, shared by every post that uses it.
    let og: Promise<string> | undefined;
    const getOgImage = () => (og ??= fetchOgImage(c.url));
    const drafts: CampaignDraft[] = [];
    for (const [i, w] of written.entries()) {
      await save({ progress: `Preparing media for post ${i + 1} of ${written.length}…` });
      drafts.push(await resolveDraft(w, c, library, getOgImage, times[i].toISOString()));
    }

    await save({ drafts, status: "review", progress: "Ready for review." });
    if (c.autoSchedule) await scheduleCampaign(c.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[campaign] ${c.id} failed: ${msg}`);
    await save({ status: "failed", error: msg });
  }
}

async function resolveDraft(
  w: WrittenDraft,
  c: Campaign,
  library: MediaItem[],
  getOgImage: () => Promise<string>,
  scheduledFor: string,
): Promise<CampaignDraft> {
  const draft: CampaignDraft = {
    id: crypto.randomUUID(),
    angle: w.angle,
    text: w.text.trim(),
    media: { kind: w.media.kind },
    sources: w.sources ?? [],
    scheduledFor,
  };
  try {
    switch (w.media.kind) {
      case "library": {
        const item = library.find((m) => m.id === w.media.libraryId);
        if (!item) throw new Error("picked an image that isn't in the library");
        draft.media.imagePath = item.filename;
        draft.media.note = item.description;
        break;
      }
      case "og": {
        if (!c.url) throw new Error("no product URL");
        draft.media.imagePath = await getOgImage();
        draft.media.note = "Your site's social preview image";
        break;
      }
      case "screenshot": {
        const target = w.media.screenshotUrl || c.url;
        draft.media.imagePath = await screenshotPage(target);
        draft.media.note = `Screenshot of ${target}`;
        break;
      }
      case "ai": {
        if (!c.useAiImages) throw new Error("AI images are off");
        draft.media.imagePath = await generateAiImage(w.media.imagePrompt || w.text);
        draft.media.note = `AI image: ${w.media.imagePrompt}`;
        break;
      }
      case "youtube": {
        const link = w.media.youtubeUrl;
        if (!/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(link)) throw new Error("no valid YouTube link");
        if (!draft.text.includes(link)) draft.text = `${draft.text}\n\n${link}`;
        draft.media.note = "YouTube link (X shows it as a video card)";
        break;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[campaign] media ${w.media.kind} skipped: ${msg}`);
    draft.media = { kind: "none", note: `Wanted ${w.media.kind} media but skipped it: ${msg}` };
  }
  draft.text = fitTweet(draft.text);
  return draft;
}

export interface DraftEdit {
  id: string;
  text: string;
  scheduledFor: string;
  removeImage?: boolean;
}

/**
 * Turns reviewed drafts into pending scheduled posts. `edits` (from the review
 * screen) can change text and time, drop an image, or omit a draft entirely;
 * images always come from the stored drafts, never from the client.
 */
export async function scheduleCampaign(id: string, edits?: DraftEdit[]): Promise<Campaign> {
  const c = await getCampaign(id);
  if (!c) throw new Error("campaign not found");
  if (c.status === "scheduled") throw new Error("campaign is already scheduled");
  if (c.status !== "review") throw new Error("campaign isn't ready to schedule yet");

  const drafts: CampaignDraft[] = [];
  for (const d of c.drafts) {
    if (!edits) {
      drafts.push(d);
      continue;
    }
    const e = edits.find((x) => x.id === d.id);
    if (!e) continue;
    const when = new Date(e.scheduledFor);
    if (Number.isNaN(when.getTime())) throw new Error("invalid time on a post");
    if (tweetLength(e.text) > MAX_TWEET_LENGTH) throw new Error("a post is over 280 characters");
    drafts.push({
      ...d,
      text: e.text,
      scheduledFor: when.toISOString(),
      media: e.removeImage ? { kind: "none" } : d.media,
    });
  }

  const toPost = drafts.filter((d) => d.text.trim());
  if (toPost.length === 0) throw new Error("no posts left to schedule");

  // Times were planned when the drafts were written. If review took long enough
  // that the first one has passed, slide the whole plan forward, keeping its
  // uneven spacing.
  const earliest = Math.min(...toPost.map((d) => new Date(d.scheduledFor).getTime()));
  const shift = Date.now() + 60_000 - earliest;
  if (shift > 0) {
    for (const d of toPost) d.scheduledFor = new Date(new Date(d.scheduledFor).getTime() + shift).toISOString();
  }

  const postIds: string[] = [];
  for (const d of toPost) {
    const post = await createScheduledPost({
      platform: "twitter",
      accountId: c.accountId,
      text: d.text.trim(),
      imagePath: d.media.imagePath,
      scheduledFor: d.scheduledFor,
      campaignId: c.id,
    });
    postIds.push(post.id);
  }
  c.drafts = toPost;
  c.postIds = postIds;
  c.status = "scheduled";
  c.progress = `Scheduled ${postIds.length} posts.`;
  await upsertCampaign(c);
  return c;
}

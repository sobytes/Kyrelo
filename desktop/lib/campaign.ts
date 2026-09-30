import { aiErrorMessage, hasApiKey } from "./ai";
import { researchCampaign, writeCampaignDrafts, WrittenDraft } from "./campaign-ai";
import { spreadTimes } from "./campaign-timing";
import { fetchOgImage, generateAiImage, screenshotPage } from "./media";
import { cancelScheduledPost, createScheduledPost } from "./scheduler";
import { getCampaign, getGrokSettings, listMediaItems, upsertCampaign } from "./storage";
import { promises as fs } from "node:fs";
import path from "node:path";
import { campaignLimit, fitForCampaign, fitsCampaign, PLATFORMS, postImageError } from "./platforms";
import { Campaign, CampaignDraft, CampaignTarget, MediaItem } from "./types";
import { uploadsDir } from "./uploads";

// Auto Campaign pipeline: research → write → media → (review) → schedule.
// Runs in the background inside the Next server; the UI polls the stored
// campaign record for progress.

// Campaign ids with a pipeline running in this process. Stored on globalThis so
// Next's dev-mode module reloads don't forget in-flight jobs.
const running: Set<string> = ((globalThis as { __kyreloCampaigns?: Set<string> }).__kyreloCampaigns ??=
  new Set());

export interface StartCampaignInput {
  /** The accounts every post goes to, on any platforms (at least one). */
  targets: CampaignTarget[];
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
    accountId: input.targets[0].accountId,
    maxLength: Math.min(...input.targets.map((t) => campaignLimit(t.platform))),
    useAiImages: input.useAiImages && (await hasApiKey("openai")),
    provider: settings.aiProvider,
    status: "researching",
    progress: "Reading your site and researching the market…",
    drafts: [],
    postIds: [],
    createdAt: new Date().toISOString(),
  };
  await upsertCampaign(campaign);
  running.add(campaign.id);
  void runCampaign(campaign)
    .catch((err) => console.error(`[campaign] ${campaign.id} crashed:`, err))
    .finally(() => running.delete(campaign.id));
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
    const msg = aiErrorMessage(err);
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
    // Rendered as links in the review screen; only allow web URLs.
    sources: (w.sources ?? []).filter((u) => /^https?:\/\//i.test(u)),
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
        if (!c.url) throw new Error("no product URL");
        const target = w.media.screenshotUrl || c.url;
        draft.media.imagePath = await screenshotPage(target, c.url);
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
  draft.text = fitForCampaign(draft.text, platformsOf(c));
  return draft;
}

/** Drops a campaign the user doesn't want, so the modal stops offering it. */
export async function discardCampaign(id: string): Promise<void> {
  const c = await getCampaign(id);
  if (!c) throw new Error("campaign not found");
  if (c.status !== "review" && c.status !== "failed") {
    throw new Error("only a campaign waiting for review can be discarded");
  }
  await upsertCampaign({ ...c, status: "discarded" });
}

export interface DraftEdit {
  id: string;
  text: string;
  scheduledFor: string;
  removeImage?: boolean;
}

// Campaign ids being scheduled right now. Claimed synchronously, before any
// await, so two schedule calls (auto-schedule plus a click on the review
// screen) can't both create the posts.
const scheduling = new Set<string>();

/**
 * Turns reviewed drafts into pending scheduled posts. `edits` (from the review
 * screen) can change text and time, drop an image, or omit a draft entirely;
 * images always come from the stored drafts, never from the client.
 */
export async function scheduleCampaign(id: string, edits?: DraftEdit[]): Promise<Campaign> {
  if (scheduling.has(id)) throw new Error("campaign is already being scheduled");
  scheduling.add(id);
  try {
    return await scheduleCampaignOnce(id, edits);
  } finally {
    scheduling.delete(id);
  }
}

async function scheduleCampaignOnce(id: string, edits?: DraftEdit[]): Promise<Campaign> {
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
    if (!fitsCampaign(e.text, platformsOf(c))) throw new Error("a post is too long for one of the platforms");
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

  // Each post goes to every target, at the same time. An image goes where the
  // platform can take it (Threads can't; Bluesky only up to 1 MB); the rest
  // get the text alone. Instagram needs an image, so it gets only the posts
  // that have one it can take.
  const postIds: string[] = [];
  try {
    for (const d of toPost) {
      const imageBytes = d.media.imagePath ? await fileSize(path.join(uploadsDir(), d.media.imagePath)) : 0;
      for (const target of c.targets) {
        const fits =
          imageBytes > 0 &&
          imageBytes <= PLATFORMS[target.platform].maxImageBytes &&
          !postImageError(target.platform, d.media.imagePath);
        if (!fits && PLATFORMS[target.platform].requiresImage) continue;
        const post = await createScheduledPost({
          platform: target.platform,
          accountId: target.accountId,
          text: d.text.trim(),
          imagePath: fits ? d.media.imagePath : undefined,
          scheduledFor: d.scheduledFor,
          campaignId: c.id,
        });
        postIds.push(post.id);
      }
    }
  } catch (err) {
    // All or nothing: a half-scheduled campaign would be duplicated on retry.
    for (const postId of postIds) await cancelScheduledPost(postId).catch(() => {});
    throw err;
  }
  c.drafts = toPost;
  c.postIds = postIds;
  c.status = "scheduled";
  c.progress =
    c.targets.length > 1
      ? `Scheduled ${toPost.length} posts to ${c.targets.length} accounts.`
      : `Scheduled ${postIds.length} posts.`;
  await upsertCampaign(c);
  return c;
}

function platformsOf(c: Campaign) {
  return [...new Set(c.targets.map((t) => t.platform))];
}

async function fileSize(file: string): Promise<number> {
  return (await fs.stat(file).catch(() => null))?.size ?? 0;
}


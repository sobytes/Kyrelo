import { NextRequest, NextResponse } from "next/server";
import { hasApiKey } from "@/lib/ai";
import { startCampaign } from "@/lib/campaign";
import { PLATFORMS } from "@/lib/platforms";
import { getGrokSettings, listAccounts, listCampaigns, listMediaBuckets, saveBrandProfile } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_POSTS = 20;
const MAX_WINDOW_MINUTES = 14 * 24 * 60;

export async function GET() {
  const [campaigns, settings, anthropic, openai] = await Promise.all([
    listCampaigns(),
    getGrokSettings(),
    hasApiKey("anthropic"),
    hasApiKey("openai"),
  ]);
  const aiReady = settings.aiProvider === "openai" ? openai : anthropic;
  return NextResponse.json({
    campaigns: campaigns.slice(-10).reverse(),
    provider: settings.aiProvider,
    aiReady,
    openaiKey: openai,
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    /** Where the posts go: accounts on any platforms. */
    targets?: { platform?: unknown; accountId?: unknown }[];
    /** Older phone apps: one X account. */
    accountId?: string;
    brief?: string;
    url?: string;
    competitors?: string;
    count?: number;
    windowMinutes?: number;
    useAiImages?: boolean;
    /** Use only this Media bucket's items (default: the whole library). */
    mediaBucketId?: string;
    autoSchedule?: boolean;
  };
  const brief = body.brief?.trim() ?? "";
  const url = body.url?.trim() ?? "";
  const competitors = body.competitors?.trim() ?? "";
  const count = Math.floor(Number(body.count));
  const windowMinutes = Math.floor(Number(body.windowMinutes));

  const wanted = Array.isArray(body.targets)
    ? body.targets
    : body.accountId
      ? [{ platform: "twitter", accountId: body.accountId }]
      : [];
  // Only connected accounts, each once. Campaigns write text and images, so
  // not to platforms that only take videos.
  const connected = (await listAccounts()).filter((a) => !PLATFORMS[a.platform].requiresVideo);
  const targets = connected
    .filter((a) => wanted.some((t) => t.platform === a.platform && t.accountId === a.id))
    .map((a) => ({ platform: a.platform, accountId: a.id }));
  if (targets.length === 0) return NextResponse.json({ error: "pick at least one connected account" }, { status: 400 });
  if (!brief) return NextResponse.json({ error: "describe what you're promoting" }, { status: 400 });
  if (url && !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "link must start with http:// or https://" }, { status: 400 });
  }
  if (!(count >= 1 && count <= MAX_POSTS)) {
    return NextResponse.json({ error: `number of posts must be 1–${MAX_POSTS}` }, { status: 400 });
  }
  if (!(windowMinutes >= 10 && windowMinutes <= MAX_WINDOW_MINUTES)) {
    return NextResponse.json({ error: "duration must be between 10 minutes and 14 days" }, { status: 400 });
  }

  const mediaBucketId = typeof body.mediaBucketId === "string" && body.mediaBucketId ? body.mediaBucketId : undefined;
  if (mediaBucketId && !(await listMediaBuckets()).some((b) => b.id === mediaBucketId)) {
    return NextResponse.json({ error: "that media bucket doesn't exist any more" }, { status: 400 });
  }

  await saveBrandProfile({ brief, url, competitors });
  const campaign = await startCampaign({
    targets,
    brief,
    url,
    competitors,
    count,
    windowMinutes,
    useAiImages: Boolean(body.useAiImages),
    mediaBucketId,
    autoSchedule: Boolean(body.autoSchedule),
  });
  return NextResponse.json({ campaign });
}

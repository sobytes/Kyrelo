import { NextRequest, NextResponse } from "next/server";
import { hasOpenAiKey, startCampaign } from "@/lib/campaign";
import { getApiKeys, getGrokSettings, listCampaigns, saveBrandProfile } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_POSTS = 20;
const MAX_WINDOW_MINUTES = 14 * 24 * 60;

export async function GET() {
  const [campaigns, settings, keys, openai] = await Promise.all([
    listCampaigns(),
    getGrokSettings(),
    getApiKeys(),
    hasOpenAiKey(),
  ]);
  const aiReady =
    settings.aiProvider === "openai"
      ? openai
      : Boolean(process.env.ANTHROPIC_API_KEY || keys.anthropic);
  return NextResponse.json({
    campaigns: campaigns.slice(-10).reverse(),
    provider: settings.aiProvider,
    aiReady,
    openaiKey: openai,
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    accountId?: string;
    brief?: string;
    url?: string;
    competitors?: string;
    count?: number;
    windowMinutes?: number;
    useAiImages?: boolean;
    autoSchedule?: boolean;
  };
  const brief = body.brief?.trim() ?? "";
  const url = body.url?.trim() ?? "";
  const competitors = body.competitors?.trim() ?? "";
  const count = Math.floor(Number(body.count));
  const windowMinutes = Math.floor(Number(body.windowMinutes));

  if (!body.accountId) return NextResponse.json({ error: "pick an account" }, { status: 400 });
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

  await saveBrandProfile({ brief, url, competitors });
  const campaign = await startCampaign({
    accountId: body.accountId,
    brief,
    url,
    competitors,
    count,
    windowMinutes,
    useAiImages: Boolean(body.useAiImages),
    autoSchedule: Boolean(body.autoSchedule),
  });
  return NextResponse.json({ campaign });
}

import { NextRequest, NextResponse } from "next/server";
import { addFeedRule, DEFAULT_TEMPLATE, removeFeedRule, runFeedsCheck } from "@/lib/feeds";
import { isPlatformId } from "@/lib/platforms";
import { getFeedRules } from "@/lib/storage";
import { CampaignTarget } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  // `seen` is bookkeeping, not for the page.
  const feeds = (await getFeedRules()).map(({ seen, ...rule }) => ({ ...rule, seenCount: seen.length }));
  return NextResponse.json({ feeds, defaultTemplate: DEFAULT_TEMPLATE });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: "add" | "remove" | "check";
    id?: string;
    url?: string;
    template?: string;
    useAi?: boolean;
    targets?: { platform?: unknown; accountId?: unknown }[];
  };
  try {
    if (body.action === "check") return NextResponse.json(await runFeedsCheck());
    if (body.action === "remove") {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      await removeFeedRule(body.id);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "add") {
      const targets = (Array.isArray(body.targets) ? body.targets : []).filter(
        (t): t is CampaignTarget => isPlatformId(t.platform) && typeof t.accountId === "string",
      );
      const rule = await addFeedRule({
        url: String(body.url ?? ""),
        targets,
        template: typeof body.template === "string" ? body.template.slice(0, 1000) : DEFAULT_TEMPLATE,
        useAi: body.useAi === true,
      });
      return NextResponse.json({ ok: true, feed: { ...rule, seen: undefined } });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

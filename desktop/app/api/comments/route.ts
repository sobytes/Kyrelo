import { NextRequest, NextResponse } from "next/server";
import { COMMENT_PLATFORMS, dismissComment, draftForComment, runCommentsCheck, sendCommentReply } from "@/lib/comments";
import { getCommentsState, listAccounts } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const accounts = (await listAccounts()).filter((a) => COMMENT_PLATFORMS.includes(a.platform));
  return NextResponse.json({ state: await getCommentsState(), accounts, platforms: COMMENT_PLATFORMS });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: "check" | "draft" | "send" | "dismiss";
    id?: string;
    text?: string;
    dismissed?: boolean;
  };
  if (body.action === "check") {
    // The user asked, so check even with background checks off.
    return NextResponse.json(await runCommentsCheck({ force: true }));
  }
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (body.action === "draft") {
    // The user asked for replies, so draft whatever the score.
    const r = await draftForComment(body.id, 0);
    return NextResponse.json(r, { status: r.error ? 500 : 200 });
  }
  if (body.action === "send") {
    const r = await sendCommentReply(body.id, body.text ?? "");
    return NextResponse.json(r, { status: r.error ? 400 : 200 });
  }
  if (body.action === "dismiss") {
    await dismissComment(body.id, body.dismissed !== false);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

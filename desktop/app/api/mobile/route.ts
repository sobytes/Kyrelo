import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import {
  BRIDGE_PORT,
  bridgeAddresses,
  pairingLink,
  resetMobilePairing,
  setMobileBridgeEnabled,
} from "@/lib/mobile-bridge";
import { getMobileBridgeConfig } from "@/lib/storage";

export const dynamic = "force-dynamic";

// Phone access settings for this computer's Settings page. Deliberately not
// reachable through the bridge (see ALLOWED in lib/mobile-bridge.ts): a phone
// can't change its own access.
export async function GET() {
  const config = await getMobileBridgeConfig();
  const link = config.enabled && config.token ? pairingLink(config.token) : null;
  return NextResponse.json({
    enabled: config.enabled,
    port: BRIDGE_PORT,
    addresses: bridgeAddresses(),
    link,
    qrSvg: link ? await QRCode.toString(link, { type: "svg", margin: 1 }) : null,
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  try {
    if (body.action === "enable") await setMobileBridgeEnabled(true);
    else if (body.action === "disable") await setMobileBridgeEnabled(false);
    else if (body.action === "reset") await resetMobilePairing();
    else return NextResponse.json({ error: "unknown action" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint = /EADDRINUSE/.test(message) ? ` Port ${BRIDGE_PORT} is in use by another app.` : "";
    return NextResponse.json({ error: `Couldn't start phone access.${hint}` }, { status: 500 });
  }
}

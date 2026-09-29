"use client";
import { useEffect, useState } from "react";

interface PhoneStatus {
  enabled: boolean;
  port: number;
  addresses: { address: string; kind: "tailscale" | "lan" }[];
  link: string | null;
  qrSvg: string | null;
}

/** Settings section for pairing the Kyrelo phone app (lib/mobile-bridge.ts). */
export function PhoneAccess() {
  const [status, setStatus] = useState<PhoneStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    setStatus(await fetch("/api/mobile").then((r) => r.json()));
  }

  useEffect(() => {
    load();
  }, []);

  async function act(action: "enable" | "disable" | "reset") {
    if (action === "reset" && !confirm("Reset pairing? Any paired phone will need to scan the new code.")) return;
    setBusy(true);
    try {
      const r = await fetch("/api/mobile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }).then((r) => r.json());
      if (r.error) alert(r.error);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;
  const hasTailscale = status.addresses.some((a) => a.kind === "tailscale");

  return (
    <section className="section space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="label !mb-0">Phone app</div>
        <label className="flex items-center gap-2 text-xs text-fg">
          <input
            type="checkbox"
            checked={status.enabled}
            disabled={busy}
            onChange={(e) => act(e.target.checked ? "enable" : "disable")}
          />
          {status.enabled ? "On" : "Off"}
        </label>
      </div>
      <p className="text-[11px] leading-relaxed text-muted">
        See the Monitor feed and Autopilot drafts on your phone, and reply from the X app. This computer
        keeps doing the watching and drafting, so Kyrelo must be running here.
      </p>

      {status.enabled && status.qrSvg && (
        <div className="flex flex-wrap items-start gap-4">
          {/* Our own SVG, generated server-side from our own pairing link. */}
          <div
            className="h-44 w-44 shrink-0 rounded-md bg-surface p-2"
            dangerouslySetInnerHTML={{ __html: status.qrSvg }}
          />
          <div className="min-w-0 flex-1 space-y-2 text-[11px] text-muted">
            <p>In the Kyrelo phone app, scan this code, or copy the pairing link to your phone.</p>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(status.link!);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="btn-ghost text-xs"
            >
              {copied ? "Copied!" : "Copy pairing link"}
            </button>
            <div>
              Reachable at:{" "}
              {status.addresses.map((a) => `${a.address}${a.kind === "tailscale" ? " (Tailscale)" : ""}`).join(", ") ||
                "no network found"}{" "}
              · port {status.port}
            </div>
            <button onClick={() => act("reset")} disabled={busy} className="text-muted underline hover:text-fg">
              Reset pairing
            </button>
          </div>
        </div>
      )}

      <p className="text-[10px] leading-relaxed text-muted">
        {hasTailscale
          ? "Tailscale is connected: your phone can reach this computer from anywhere, encrypted."
          : "Works when your phone is on the same Wi-Fi. Install Tailscale on both devices to use it anywhere."}{" "}
        On shared or public Wi-Fi, use Tailscale: on a plain network the connection isn&apos;t encrypted. Your Mac
        may ask to allow incoming connections the first time.
      </p>
    </section>
  );
}

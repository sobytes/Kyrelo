"use client";
import { useState } from "react";
import { PLATFORM_IDS, PLATFORMS } from "@/lib/platforms";
import { Account, PlatformId } from "@/lib/types";
import { PlatformBadge } from "./PlatformBadge";
import { openExternal, useAccounts } from "./useAccounts";

export function ConnectedPanel() {
  const accounts = useAccounts();
  const { status } = accounts;

  if (!status) {
    return <div className="card text-sm text-zinc-500">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      {PLATFORM_IDS.map((platform) => (
        <PlatformSection
          key={platform}
          platform={platform}
          accounts={status.accounts.filter((a) => a.platform === platform)}
          connect={accounts}
        />
      ))}

      <div className="card text-xs leading-relaxed text-zinc-500">
        <strong className="text-zinc-300">How this works.</strong> X and LinkedIn accounts each get
        their own Chrome profile on this computer; you sign in once and Kyrelo posts through that
        session. Bluesky uses an app password, stored only on this computer. Nothing is sent
        anywhere except the platform itself. The Monitor, Deleter and auto campaigns work with X
        accounts.
      </div>
    </div>
  );
}

function PlatformSection({
  platform,
  accounts,
  connect,
}: {
  platform: PlatformId;
  accounts: Account[];
  connect: ReturnType<typeof useAccounts>;
}) {
  const spec = PLATFORMS[platform];
  return (
    <section className="space-y-2">
      <div className="label flex items-center gap-2">
        <PlatformBadge platform={platform} /> {spec.label}
      </div>
      {accounts.map((a) => (
        <AccountRow key={a.id} account={a} onDisconnect={() => connect.disconnect(a)} />
      ))}
      {spec.connect === "browser" ? (
        <BrowserConnectCard platform={platform} connect={connect} />
      ) : (
        <BlueskyConnectCard connect={connect} />
      )}
    </section>
  );
}

function BrowserConnectCard({
  platform,
  connect,
}: {
  platform: PlatformId;
  connect: ReturnType<typeof useAccounts>;
}) {
  const spec = PLATFORMS[platform];
  const busyHere = connect.phase !== "idle" && connect.phasePlatform === platform;
  const busyElsewhere = connect.phase !== "idle" && connect.phasePlatform !== platform;
  const phase = busyHere ? connect.phase : "idle";
  const host = new URL(spec.loginUrl).host;

  return (
    <div className="card space-y-3">
      <div>
        <div className="text-sm font-semibold text-zinc-100">Add a {spec.label} account</div>
        <div className="mt-0.5 text-xs text-zinc-500">
          {phase === "starting"
            ? "Opening Chrome…"
            : phase === "connecting"
              ? `Log in to ${spec.label} in the Chrome window that opened. Any sign-in method works, including Google or Apple.`
              : phase === "saving"
                ? "Saving session…"
                : `Connect opens Chrome to ${host}. Sign in once and the session is saved to its own profile.`}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {phase === "idle" && (
          <button onClick={() => connect.start(platform)} disabled={busyElsewhere} className="btn-primary text-sm">
            Connect with {spec.label}
          </button>
        )}
        {phase === "connecting" && (
          <>
            <button onClick={connect.done} className="btn-primary text-sm">
              I&apos;m logged in
            </button>
            <button onClick={connect.cancel} className="btn-ghost text-sm">
              Cancel
            </button>
          </>
        )}
        {(phase === "starting" || phase === "saving") && (
          <button disabled className="btn-ghost text-sm">
            {phase === "starting" ? "Starting…" : "Saving…"}
          </button>
        )}
      </div>

      {busyHere && (
        <p className="text-[10px] text-zinc-500">
          Connecting in progress — the Monitor and scheduled posts pause until it finishes.
        </p>
      )}
      {platform === "linkedin" && (
        <p className="text-[10px] leading-relaxed text-zinc-500">
          LinkedIn is strict about automation. Kyrelo posts at a human pace, but keep LinkedIn posts
          to a few a day.
        </p>
      )}
    </div>
  );
}

function BlueskyConnectCard({ connect }: { connect: ReturnType<typeof useAccounts> }) {
  const [handle, setHandle] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const err = await connect.connectBluesky(handle, appPassword);
      if (err) {
        setError(err);
      } else {
        setHandle("");
        setAppPassword("");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <div>
        <div className="text-sm font-semibold text-zinc-100">Add a Bluesky account</div>
        <div className="mt-0.5 text-xs text-zinc-500">
          Use an <strong>app password</strong>, not your main password. Create one in Bluesky under{" "}
          <button
            type="button"
            onClick={() => openExternal(PLATFORMS.bluesky.loginUrl)}
            className="text-accent underline hover:text-zinc-200"
          >
            Settings → Privacy and security → App passwords
          </button>
          .
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className="input text-sm"
          placeholder="yourname.bsky.social"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          autoComplete="off"
        />
        <input
          className="input text-sm"
          type="password"
          placeholder="xxxx-xxxx-xxxx-xxxx"
          value={appPassword}
          onChange={(e) => setAppPassword(e.target.value)}
          autoComplete="off"
        />
      </div>
      {error && <div className="text-xs text-rose-400">{error}</div>}
      <button type="submit" disabled={saving || !handle.trim() || !appPassword.trim()} className="btn-primary text-sm">
        {saving ? "Checking…" : "Connect Bluesky"}
      </button>
    </form>
  );
}

function AccountRow({ account, onDisconnect }: { account: Account; onDisconnect: () => void }) {
  return (
    <div className="card flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <PlatformBadge platform={account.platform} size="lg" />
        <div>
          <div className="text-sm font-semibold text-zinc-100">@{account.handle}</div>
          <div className="text-[11px] text-zinc-500">Added {new Date(account.addedAt).toLocaleDateString()}</div>
        </div>
      </div>
      <button onClick={onDisconnect} className="btn-danger text-xs">
        Disconnect
      </button>
    </div>
  );
}

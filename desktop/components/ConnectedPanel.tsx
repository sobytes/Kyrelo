"use client";
import { useState } from "react";
import { PLATFORMS } from "@/lib/platforms";
import { Account, PlatformId } from "@/lib/types";
import { PlatformBadge } from "./PlatformBadge";
import { openExternal, useAccounts } from "./useAccounts";

/** One service's Accounts section: its connected accounts and how to add one. */
export function AccountsPanel({ platform }: { platform: PlatformId }) {
  const connect = useAccounts();
  const { status } = connect;
  const spec = PLATFORMS[platform];

  if (!status) {
    return <div className="py-6 text-sm text-muted">Loading…</div>;
  }
  const accounts = status.accounts.filter((a) => a.platform === platform);
  const title = accounts.length > 0 ? `Add another ${spec.label} account` : `Connect ${spec.label}`;

  return (
    <div className="space-y-6">
      {accounts.length > 0 && (
        <section className="space-y-2">
          <div className="label">Connected</div>
          {accounts.map((a) => (
            <AccountRow key={a.id} account={a} onDisconnect={() => connect.disconnect(a)} />
          ))}
        </section>
      )}

      {spec.connect === "browser" ? (
        <BrowserConnectCard title={title} platform={platform} connect={connect} />
      ) : spec.connect === "oauth" ? (
        <MastodonConnectCard title={title} connect={connect} />
      ) : (
        <CredentialsConnectCard title={title} platform={platform} connect={connect} />
      )}

      <p className="text-xs text-muted">
        No {spec.label} account yet? <ExtLink href={spec.signupUrl}>Sign up for {spec.label}</ExtLink>, then connect it
        here.
      </p>

      <div className="section text-xs leading-relaxed text-muted">
        <strong className="text-fg">How this works.</strong> {HOW_IT_WORKS[platform]} Nothing is sent anywhere except{" "}
        {spec.label} itself. Kyrelo isn&apos;t affiliated with {spec.label}: using it is at your own risk, and it&apos;s up
        to you to stay within their terms.
      </div>
    </div>
  );
}

const HOW_IT_WORKS: Record<PlatformId, string> = {
  twitter:
    "Each X account gets its own Chrome profile on this computer; you sign in once and Kyrelo posts through that session. The Monitor reads timelines through your first X account.",
  bluesky: "Bluesky uses an app password, stored only on this computer, and Bluesky's own API.",
  mastodon: "Your server gives Kyrelo its own sign-in, stored only on this computer. Remove it any time here or in your Mastodon settings.",
  threads:
    "Kyrelo posts with Meta's official Threads API, using your token, stored only on this computer and renewed as you post. Threads posts are text only.",
  instagram:
    "Each Instagram account gets its own Chrome profile on this computer; you sign in once and Kyrelo posts through instagram.com, the way you would. Every Instagram post needs a photo (JPEG or PNG). Instagram doesn't officially support posting this way, so it can break when they change their site.",
  facebook:
    "Each Facebook account gets its own Chrome profile on this computer; you sign in once and Kyrelo posts through facebook.com as whichever profile you were using: to post as a Page, switch to it (your picture at the top right → the Page) before clicking I'm logged in. Connect again to add another Page. Facebook doesn't officially support posting this way, so it can break when they change their site.",
  telegram:
    "Kyrelo posts to your channel through your own Telegram bot, with Telegram's official Bot API. The bot token is stored only on this computer.",
  tiktok:
    "Kyrelo sends each video to your TikTok inbox with TikTok's Content Posting API, through your own TikTok developer app. TikTok notifies you; add the caption (it's in the post in Kyrelo) and post it from the app. Posting straight to your profile needs TikTok to audit your app.",
  youtube:
    "Kyrelo uploads with the YouTube Data API through your own Google Cloud project, so Google's limits are yours: about six uploads a day. Google keeps uploads from projects it hasn't audited private; request its free audit (YouTube API Services → Audit and quota extension form) to post publicly. Comments work either way.",
  linkedin:
    "Kyrelo posts with LinkedIn's official API, using a token from your own LinkedIn app, stored only on this computer. LinkedIn tokens last 60 days; then make a new one and connect again.",
  discord:
    "Kyrelo posts to the channel through its webhook, Discord's official way for apps to post. The webhook link is stored only on this computer; anyone with it can post there, so keep it private.",
};

function BrowserConnectCard({
  title,
  platform,
  connect,
}: {
  title: string;
  platform: PlatformId;
  connect: ReturnType<typeof useAccounts>;
}) {
  const spec = PLATFORMS[platform];
  const busyHere = connect.phase !== "idle" && connect.phasePlatform === platform;
  const busyElsewhere = connect.phase !== "idle" && connect.phasePlatform !== platform;
  const phase = busyHere ? connect.phase : "idle";
  const host = new URL(spec.loginUrl).host;

  return (
    <div className="section space-y-3">
      <div>
        <div className="text-sm font-semibold text-fg">{title}</div>
        <div className="mt-0.5 text-xs text-muted">
          {phase === "starting"
            ? "Opening Chrome…"
            : phase === "connecting"
              ? `Log in to ${spec.label} in the Chrome window that opened. Any sign-in method works, including Google or Apple.${
                  platform === "facebook"
                    ? " To post as a Page, switch to it (your picture at the top right → the Page) before clicking I'm logged in."
                    : ""
                }`
              : phase === "saving"
                ? "Saving session…"
                : platform === "facebook"
                  ? `Connect opens Chrome to ${host}. Sign in, switch to the Page you want Kyrelo to post as (your picture at the top right → the Page), then click I'm logged in.`
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
        <p className="text-[11px] text-muted">
          Connecting in progress. The Monitor and scheduled posts pause until it finishes.
        </p>
      )}
    </div>
  );
}

/** Mastodon: type the server, approve Kyrelo in the browser. No tokens to copy. */
function MastodonConnectCard({ title, connect }: { title: string; connect: ReturnType<typeof useAccounts> }) {
  const [server, setServer] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const err = await connect.startMastodon(server);
    if (err) setError(err);
    else setWaiting(true);
  }

  return (
    <form onSubmit={submit} className="section space-y-3">
      <div>
        <div className="text-sm font-semibold text-fg">{title}</div>
        <div className="mt-0.5 text-xs text-muted">
          Enter the server you signed up on. Your browser opens it to approve Kyrelo, and that&apos;s it.
        </div>
      </div>
      <div className="flex max-w-md gap-2">
        <input
          className="input text-sm"
          placeholder="mastodon.social"
          value={server}
          onChange={(e) => setServer(e.target.value)}
          autoComplete="off"
        />
        <button type="submit" disabled={!server.trim()} className="btn-primary shrink-0 text-sm">
          Connect
        </button>
      </div>
      {waiting && (
        <p className="text-xs text-muted">
          Click <strong className="text-fg">Authorize</strong> in the browser tab that opened. Your account appears here
          when you do.
        </p>
      )}
      {error && <div className="text-xs text-error">{error}</div>}
    </form>
  );
}

/**
 * Platforms where the user pastes credentials: the fields come from
 * PLATFORMS[..].credentials. For their own developer app ("app"), those are
 * its client id and secret, and the browser then opens to approve it.
 */
function CredentialsConnectCard({
  title,
  platform,
  connect,
}: {
  title: string;
  platform: PlatformId;
  connect: ReturnType<typeof useAccounts>;
}) {
  const spec = PLATFORMS[platform];
  const fields = spec.credentials ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const complete = fields.every((f) => values[f.key]?.trim());
  const viaApp = spec.connect === "app";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const err = viaApp ? await connect.startApp(platform, values) : await connect.connectWithCredentials(platform, values);
      if (err) setError(err);
      else if (viaApp) setWaiting(true);
      else setValues({});
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="section space-y-3">
      <div>
        <div className="text-sm font-semibold text-fg">{title}</div>
        <div className="mt-1 text-xs leading-relaxed text-muted">{GUIDES[platform]}</div>
      </div>
      <div className={`grid gap-2 ${fields.length > 1 ? "sm:grid-cols-2" : "max-w-md"}`}>
        {fields.map((f) => (
          <input
            key={f.key}
            className="input text-sm"
            type={f.secret ? "password" : "text"}
            placeholder={f.placeholder}
            aria-label={f.label}
            value={values[f.key] ?? ""}
            onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            autoComplete="off"
          />
        ))}
      </div>
      {error && <div className="text-xs text-error">{error}</div>}
      {waiting && (
        <p className="text-xs text-muted">
          Approve Kyrelo in the browser tab that opened. Your account appears here when you do.
        </p>
      )}
      <button type="submit" disabled={saving || !complete} className="btn-primary text-sm">
        {saving ? "Checking…" : `Connect ${spec.label}`}
      </button>
    </form>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={() => openExternal(href)} className="text-primary underline hover:text-primary-hover">
      {children}
    </button>
  );
}

// Where to get the credentials, step by step.
const GUIDES: Partial<Record<PlatformId, React.ReactNode>> = {
  bluesky: (
    <>
      Use an <strong className="text-fg">app password</strong>, not your main password. Create one in Bluesky under{" "}
      <ExtLink href={PLATFORMS.bluesky.loginUrl}>Settings → Privacy and security → App passwords</ExtLink>.
    </>
  ),
  telegram: (
    <ol className="list-decimal space-y-1 pl-5">
      <li>
        In Telegram, message <ExtLink href={PLATFORMS.telegram.loginUrl}>@BotFather</ExtLink>, send <em>/newbot</em> and
        copy the token it gives you.
      </li>
      <li>
        Open your channel → <em>Administrators</em> → <em>Add admin</em>, pick your bot and let it post messages.
      </li>
      <li>Paste the token and your channel&apos;s @name below (or its numeric id, for a private channel).</li>
    </ol>
  ),
  tiktok: (
    <ol className="list-decimal space-y-1 pl-5">
      <li>
        On <ExtLink href={PLATFORMS.tiktok.loginUrl}>TikTok for Developers</ExtLink>, create an app with the{" "}
        <em>Desktop</em> platform.
      </li>
      <li>
        Add <em>Login Kit</em> with the redirect URI <code className="font-mono">http://127.0.0.1:*/api/accounts/oauth/callback</code>,
        and <em>Content Posting API</em> (Upload, scope <em>video.upload</em>).
      </li>
      <li>Add your TikTok account as a target user in the app&apos;s sandbox, then paste its client key and secret below.</li>
    </ol>
  ),
  youtube: (
    <ol className="list-decimal space-y-1 pl-5">
      <li>
        In <ExtLink href="https://console.cloud.google.com/projectcreate">Google Cloud</ExtLink>, create a project and
        enable the <ExtLink href="https://console.cloud.google.com/apis/library/youtube.googleapis.com">YouTube Data API v3</ExtLink>.
      </li>
      <li>
        Under <em>OAuth consent screen</em>, choose <em>External</em>, add yourself as a test user, then set the publishing
        status to <em>In production</em> (otherwise Google signs Kyrelo out after a week).
      </li>
      <li>
        Under <ExtLink href={PLATFORMS.youtube.loginUrl}>Credentials</ExtLink>, create an <em>OAuth client ID</em> of type{" "}
        <em>Desktop app</em> and paste its ID and secret below. Google then asks you to approve it; it may warn that the
        app isn&apos;t verified, which is expected for your own app.
      </li>
    </ol>
  ),
  linkedin: (
    <ol className="list-decimal space-y-1 pl-5">
      <li>
        <ExtLink href="https://www.linkedin.com/developers/apps/new">Create a LinkedIn app</ExtLink> (it asks for a
        company Page; any Page you manage works).
      </li>
      <li>
        Under <em>Products</em>, add <em>Share on LinkedIn</em> and <em>Sign In with LinkedIn using OpenID Connect</em>.
      </li>
      <li>
        Open the <ExtLink href={PLATFORMS.linkedin.loginUrl}>token generator</ExtLink>, pick your app and the{" "}
        <em>openid</em>, <em>profile</em> and <em>w_member_social</em> scopes, and paste the token below. It lasts 60 days.
      </li>
    </ol>
  ),
  discord: (
    <>
      In Discord, open the channel&apos;s settings → <em>Integrations</em> → <em>Webhooks</em> → <em>New Webhook</em>,
      name it (posts show that name), then <em>Copy Webhook URL</em> and paste it below.{" "}
      <ExtLink href={PLATFORMS.discord.loginUrl}>Discord&apos;s guide</ExtLink>
    </>
  ),
  threads: (
    <>
      Meta only lets apps post to Threads with a token from a Meta developer app. It takes about five minutes, once;
      Kyrelo keeps the token renewed after that.
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>
          <ExtLink href="https://developers.facebook.com/apps/creation/">Create a Meta app</ExtLink> and choose{" "}
          <em>Access the Threads API</em>.
        </li>
        <li>
          In the app, open <em>Use cases → Threads API → Settings</em>, add your Threads username as a tester, then accept
          the invite in Threads (<em>Settings → Account → Website permissions → Invites</em>).
        </li>
        <li>
          Back in <em>Use cases → Threads API</em>, use the <em>User token generator</em> with the{" "}
          <em>threads_content_publish</em> permission, and paste the token below. To answer comments from Kyrelo, add{" "}
          <em>threads_read_replies</em> and <em>threads_manage_replies</em> too.
        </li>
      </ol>
    </>
  ),
};

function AccountRow({ account, onDisconnect }: { account: Account; onDisconnect: () => void }) {
  return (
    <div className="card flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <PlatformBadge platform={account.platform} size="lg" />
        <div>
          <div className="text-sm font-semibold text-fg">@{account.handle}</div>
          <div className="font-mono text-[11px] text-muted">Added {new Date(account.addedAt).toLocaleDateString()}</div>
        </div>
      </div>
      <button onClick={onDisconnect} className="btn-danger text-xs">
        Disconnect
      </button>
    </div>
  );
}

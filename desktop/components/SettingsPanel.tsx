"use client";
import { useEffect, useState } from "react";
import { GrokSettings } from "@/lib/types";
import { PhoneAccess } from "./PhoneAccess";

interface KeyStatus {
  anthropic: boolean;
  openai: boolean;
  anthropicFromEnv: boolean;
  openaiFromEnv: boolean;
}

export function SettingsPanel() {
  const [settings, setSettings] = useState<GrokSettings | null>(null);
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [savingKeys, setSavingKeys] = useState(false);

  async function loadSettings() {
    const s = await fetch("/api/grok-settings").then((r) => r.json());
    setSettings(s.settings);
  }

  async function loadKeys() {
    const r = await fetch("/api/settings/keys").then((r) => r.json());
    setStatus(r);
  }

  useEffect(() => {
    loadSettings();
    loadKeys();
  }, []);

  async function save(next: GrokSettings) {
    setSettings(next);
    const r = await fetch("/api/grok-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).then((r) => r.json());
    if (r.error) {
      alert(r.error);
      loadSettings();
    }
  }

  async function saveKeys() {
    setSavingKeys(true);
    try {
      const r = await fetch("/api/settings/keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anthropic: anthropicKey || undefined,
          openai: openaiKey || undefined,
        }),
      }).then((r) => r.json());
      // Keep what the user pasted if saving failed, so they can retry.
      if (r.error) {
        alert(r.error);
        return;
      }
      setAnthropicKey("");
      setOpenaiKey("");
      await loadKeys();
    } finally {
      setSavingKeys(false);
    }
  }

  async function resetState() {
    if (!confirm("Clear all seen tweets?")) return;
    const r = await fetch("/api/grok-state", { method: "DELETE" }).then((r) => r.json());
    if (r.error) alert(r.error);
  }

  if (!settings) {
    return <div className="py-6 text-sm text-muted">Loading…</div>;
  }

  const activeKeySet = status
    ? settings.aiProvider === "claude"
      ? status.anthropic
      : status.openai
    : false;

  return (
    <div className="space-y-4">
      <section className="section space-y-3">
        <div className="flex items-center justify-between">
          <div className="label !mb-0">AI provider</div>
          {!activeKeySet && (
            <span className="rounded-sm bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
              API key required
            </span>
          )}
        </div>
        <select
          className="rounded-md border border-line bg-canvas px-2 py-1.5 text-sm"
          value={settings.aiProvider}
          onChange={(e) =>
            save({ ...settings, aiProvider: e.target.value as GrokSettings["aiProvider"] })
          }
        >
          <option value="claude">Claude</option>
          <option value="openai">OpenAI</option>
        </select>
      </section>

      <section className="section space-y-4">
        <div>
          <div className="label">API keys</div>
          <p className="text-[11px] leading-relaxed text-muted">
            Kyrelo uses your own AI key, so you only pay the provider for what you use, usually a few
            cents per reply and well under $1 per auto campaign. You need at least one key: Claude or
            OpenAI, matching the provider picked above. Add an OpenAI key too if you want AI-generated
            images in auto campaigns.
          </p>
        </div>
        <KeyRow
          label="Anthropic (Claude)"
          set={status?.anthropic ?? false}
          fromEnv={status?.anthropicFromEnv ?? false}
          value={anthropicKey}
          onChange={setAnthropicKey}
          placeholder="sk-ant-..."
          help={
            <>
              <p>Powers replies, rewrites and auto campaign research and writing (with live web search).</p>
              <ol className="list-decimal space-y-1 pl-4">
                <li>
                  Sign up or log in at the{" "}
                  <ExtLink href="https://platform.claude.com/">Claude Console</ExtLink>.
                </li>
                <li>
                  Add credit under{" "}
                  <ExtLink href="https://platform.claude.com/settings/billing">Billing</ExtLink>. The API is
                  prepaid and separate from a Claude.ai subscription, and $5 goes a long way.
                </li>
                <li>
                  Open <ExtLink href="https://platform.claude.com/settings/keys">API keys</ExtLink>, click{" "}
                  <b>Create key</b> and give it a name like &quot;Kyrelo&quot;.
                </li>
                <li>
                  Copy the key (it starts with <code>sk-ant-</code>). It&apos;s only shown once, so paste it
                  here straight away and click <b>Save keys</b>.
                </li>
              </ol>
            </>
          }
        />
        <KeyRow
          label="OpenAI"
          set={status?.openai ?? false}
          fromEnv={status?.openaiFromEnv ?? false}
          value={openaiKey}
          onChange={setOpenaiKey}
          placeholder="sk-..."
          help={
            <>
              <p>An alternative to Claude for all AI features, and needed for AI-generated images.</p>
              <ol className="list-decimal space-y-1 pl-4">
                <li>
                  Sign up or log in at the{" "}
                  <ExtLink href="https://platform.openai.com/">OpenAI Platform</ExtLink>.
                </li>
                <li>
                  Add credit under{" "}
                  <ExtLink href="https://platform.openai.com/settings/organization/billing/overview">
                    Billing
                  </ExtLink>
                  . This is separate from a ChatGPT Plus subscription.
                </li>
                <li>
                  Open <ExtLink href="https://platform.openai.com/api-keys">API keys</ExtLink> and click{" "}
                  <b>Create new secret key</b>.
                </li>
                <li>
                  Copy the key (it starts with <code>sk-</code>). It&apos;s only shown once, so paste it here
                  straight away and click <b>Save keys</b>.
                </li>
                <li>
                  For AI images, OpenAI may ask you to{" "}
                  <ExtLink href="https://platform.openai.com/settings/organization/general">
                    verify your organization
                  </ExtLink>{" "}
                  first. Image generation fails until that&apos;s done.
                </li>
              </ol>
            </>
          }
        />
        {(anthropicKey || openaiKey) && (
          <button
            onClick={saveKeys}
            disabled={savingKeys}
            className="btn-primary w-full text-xs"
          >
            {savingKeys ? "Saving…" : "Save keys"}
          </button>
        )}
        <p className="text-[10px] leading-relaxed text-muted">
          Keys are stored locally, and each key is only ever sent to its own provider.
        </p>
      </section>

      <section className="section space-y-3">
        <div className="label">Reply tone</div>
        <textarea
          className="textarea h-28 resize-none"
          placeholder="e.g. sharp devil's advocate, dryly sarcastic, earnest insider…"
          value={settings.styleHint}
          onChange={(e) => save({ ...settings, styleHint: e.target.value })}
        />
        <p className="text-[10px] leading-relaxed text-muted">
          Fed to the AI when you click Generate reply. Be specific — &ldquo;contrarian on AI
          hype&rdquo; works better than &ldquo;edgy&rdquo;.
        </p>
      </section>

      <section className="section space-y-3">
        <div className="label">Notifications & scraping</div>
        <label className="flex items-center justify-between gap-2 text-sm text-fg">
          Include replies
          <input
            type="checkbox"
            checked={settings.includeReplies}
            onChange={(e) => save({ ...settings, includeReplies: e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between gap-2 text-sm text-fg">
          Desktop notifications
          <input
            type="checkbox"
            checked={settings.notifyDesktop}
            onChange={(e) => save({ ...settings, notifyDesktop: e.target.checked })}
          />
        </label>
      </section>

      <section className="section space-y-3">
        <div className="label">Posting</div>
        <label className="flex items-center justify-between gap-3 text-sm text-fg">
          <div>
            <div>Run scheduled posts headless</div>
            <div className="mt-0.5 text-[11px] text-muted">
              When off, a Chrome window pops up so you can watch each post being typed and
              submitted (useful for testing). Turn on once you trust it.
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.headlessPosting ?? false}
            onChange={(e) =>
              save({ ...settings, headlessPosting: e.target.checked })
            }
          />
        </label>
      </section>

      <PhoneAccess />

      <section className="section space-y-2">
        <div className="label">Danger zone</div>
        <button onClick={resetState} className="btn-danger w-full text-xs">
          Reset seen tweets
        </button>
        <p className="text-[10px] leading-relaxed text-muted">
          Wipes the seen-tweet history so the next scrape starts fresh.
        </p>
      </section>

      <section className="section space-y-2 text-[11px] leading-relaxed text-muted">
        <div className="label">About Kyrelo</div>
        <p>
          Kyrelo is an independent, open-source experiment, provided as is under the MIT license. It
          isn&apos;t affiliated with, endorsed by or sponsored by any platform it works with (X Corp.,
          Bluesky, Meta, Google, TikTok, LinkedIn and the others), Buffer, Postiz, TweetDelete, Anthropic or
          OpenAI; their names are used only to say what Kyrelo works with or compares to.
        </p>
        <p>
          Kyrelo bundles FFmpeg (ffmpeg.org) to fit videos to each platform. FFmpeg is free software under the GPL; its
          licence and where to get its source are in the app&apos;s Resources/ffmpeg folder.
        </p>
        <p>
          You&apos;re responsible for how you use it, including following each platform&apos;s terms and
          automation rules. X in particular may limit or suspend accounts it thinks are automated.
        </p>
      </section>
    </div>
  );
}

function KeyRow({
  label,
  set,
  fromEnv,
  value,
  onChange,
  placeholder,
  help,
}: {
  label: string;
  set: boolean;
  fromEnv: boolean;
  value: string;
  onChange: (s: string) => void;
  placeholder: string;
  help: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-fg">{label}</span>
        {set ? (
          <span className="text-[10px] text-success">
            ✓ {fromEnv ? "from env" : "saved"}
          </span>
        ) : (
          <span className="text-[10px] text-muted">not set</span>
        )}
      </div>
      {!fromEnv && (
        <input
          type="password"
          className="input text-sm"
          placeholder={set ? "(replace) " + placeholder : placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <details open={!set} className="group text-[11px] leading-relaxed text-muted">
        <summary className="cursor-pointer select-none text-muted hover:text-fg">
          How do I get this key?
        </summary>
        <div className="mt-2 space-y-2 rounded-md border border-line bg-canvas p-3">{help}</div>
      </details>
    </div>
  );
}

// target=_blank links are routed to the system browser by Electron's
// window-open handler (electron/main.cjs).
function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline hover:text-fg">
      {children}
    </a>
  );
}

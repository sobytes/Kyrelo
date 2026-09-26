"use client";
import { useEffect, useState } from "react";
import { GrokSettings } from "@/lib/types";

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
    await fetch("/api/grok-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
  }

  async function saveKeys() {
    setSavingKeys(true);
    try {
      await fetch("/api/settings/keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anthropic: anthropicKey || undefined,
          openai: openaiKey || undefined,
        }),
      });
      setAnthropicKey("");
      setOpenaiKey("");
      await loadKeys();
    } finally {
      setSavingKeys(false);
    }
  }

  async function resetState() {
    if (!confirm("Clear all seen tweets?")) return;
    await fetch("/api/grok-state", { method: "DELETE" });
  }

  if (!settings) {
    return <div className="card text-sm text-zinc-500">Loading…</div>;
  }

  const activeKeySet = status
    ? settings.aiProvider === "claude"
      ? status.anthropic
      : status.openai
    : false;

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <div className="label !mb-0">AI provider</div>
          {!activeKeySet && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
              API key required
            </span>
          )}
        </div>
        <select
          className="rounded-md border border-line bg-ink px-2 py-1.5 text-sm"
          value={settings.aiProvider}
          onChange={(e) =>
            save({ ...settings, aiProvider: e.target.value as GrokSettings["aiProvider"] })
          }
        >
          <option value="claude">Claude</option>
          <option value="openai">OpenAI</option>
        </select>
      </section>

      <section className="card space-y-4">
        <div>
          <div className="label">API keys</div>
          <p className="text-[11px] leading-relaxed text-zinc-500">
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
        <p className="text-[10px] leading-relaxed text-zinc-500">
          Keys are stored locally and only ever sent to the provider you pick above.
        </p>
      </section>

      <section className="card space-y-3">
        <div className="label">Reply tone</div>
        <textarea
          className="textarea h-28 resize-none"
          placeholder="e.g. sharp devil's advocate, dryly sarcastic, earnest insider…"
          value={settings.styleHint}
          onChange={(e) => save({ ...settings, styleHint: e.target.value })}
        />
        <p className="text-[10px] leading-relaxed text-zinc-500">
          Fed to the AI when you click Generate reply. Be specific — &ldquo;contrarian on AI
          hype&rdquo; works better than &ldquo;edgy&rdquo;.
        </p>
      </section>

      <section className="card space-y-3">
        <div className="label">Notifications & scraping</div>
        <label className="flex items-center justify-between gap-2 text-sm text-zinc-300">
          Include replies
          <input
            type="checkbox"
            checked={settings.includeReplies}
            onChange={(e) => save({ ...settings, includeReplies: e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between gap-2 text-sm text-zinc-300">
          Desktop notifications
          <input
            type="checkbox"
            checked={settings.notifyDesktop}
            onChange={(e) => save({ ...settings, notifyDesktop: e.target.checked })}
          />
        </label>
      </section>

      <section className="card space-y-3">
        <div className="label">Posting</div>
        <label className="flex items-center justify-between gap-3 text-sm text-zinc-300">
          <div>
            <div>Run scheduled posts headless</div>
            <div className="mt-0.5 text-[11px] text-zinc-500">
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

      <section className="card space-y-2">
        <div className="label">Danger zone</div>
        <button onClick={resetState} className="btn-danger w-full text-xs">
          Reset seen tweets
        </button>
        <p className="text-[10px] leading-relaxed text-zinc-500">
          Wipes the seen-tweet history so the next scrape starts fresh.
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
        <span className="text-zinc-200">{label}</span>
        {set ? (
          <span className="text-[10px] text-emerald-400">
            ✓ {fromEnv ? "from env" : "saved"}
          </span>
        ) : (
          <span className="text-[10px] text-zinc-500">not set</span>
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
      <details open={!set} className="group text-[11px] leading-relaxed text-zinc-400">
        <summary className="cursor-pointer select-none text-zinc-500 hover:text-zinc-300">
          How do I get this key?
        </summary>
        <div className="mt-2 space-y-2 rounded-md border border-line bg-ink p-3">{help}</div>
      </details>
    </div>
  );
}

// target=_blank links are routed to the system browser by Electron's
// window-open handler (electron/main.cjs).
function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent underline hover:text-zinc-200">
      {children}
    </a>
  );
}

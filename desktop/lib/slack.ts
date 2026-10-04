// Slack through an incoming webhook (api.slack.com/apps → Create app →
// Incoming Webhooks → Add New Webhook to Workspace, then pick the channel).
// No bot token needed. Text only: webhooks can't upload files. The URL is a
// secret: anyone with it can post to the channel.

const TIMEOUT_MS = 30_000;
const WEBHOOK_RE = /^https:\/\/hooks\.slack\.com\/services\/(T\w+)\/(B\w+)\/\w+$/;

/** The webhook's id (its B… part), or null if this isn't a Slack webhook URL. */
export function slackWebhookId(url: string): string | null {
  return url.trim().match(WEBHOOK_RE)?.[2] ?? null;
}

export async function postToSlack(webhookUrl: string, text: string): Promise<{ url: string }> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // Slack answers "ok", or a reason such as "channel_not_found" or "invalid_token".
  const body = await res.text();
  if (!res.ok) throw new Error(`Slack: ${body || `HTTP ${res.status}`}`);
  // Webhooks don't say where the message landed.
  return { url: "https://app.slack.com/client" };
}

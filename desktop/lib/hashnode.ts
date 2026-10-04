import { splitTitle } from "./title";

// Hashnode through its GraphQL API with a personal access token (Settings →
// Developer) and the blog's address (e.g. yourname.hashnode.dev). The post's
// first line is the article's title and the rest its Markdown body.

const API = "https://gql.hashnode.com";
const TIMEOUT_MS = 30_000;

async function gql<T>(token: string, query: string, variables: object): Promise<T> {
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; errors?: { message: string }[] };
  if (!res.ok || json.errors?.length || !json.data) throw new Error(`Hashnode: ${json.errors?.[0]?.message ?? `HTTP ${res.status}`}`);
  return json.data;
}

/** "https://blog.example.com/" → "blog.example.com". */
export function normalizeHost(input: string): string {
  return input.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
}

/** The blog the token can publish to: its id and title. */
export async function verifyHashnode(token: string, host: string): Promise<{ id: string; title: string }> {
  const { me, publication } = await gql<{ me: { username: string }; publication: { id: string; title: string } | null }>(
    token,
    "query ($host: String!) { me { username } publication(host: $host) { id title } }",
    { host: normalizeHost(host) },
  );
  if (!publication) throw new Error(`Hashnode: there's no blog at ${normalizeHost(host)}.`);
  if (!me) throw new Error("Hashnode: that token was refused.");
  return publication;
}

export async function postToHashnode(token: string, publicationId: string, text: string): Promise<{ url: string }> {
  const { title, body } = splitTitle(text, 250);
  const { publishPost } = await gql<{ publishPost: { post: { url: string } } }>(
    token,
    "mutation ($input: PublishPostInput!) { publishPost(input: $input) { post { url } } }",
    { input: { title, contentMarkdown: body || title, publicationId } },
  );
  return { url: publishPost.post.url };
}

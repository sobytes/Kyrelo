import { describe, expect, it } from "vitest";
import { fillTemplate, parseFeed } from "./feeds";

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Kyrelo blog</title>
<item><title><![CDATA[Comments &amp; replies]]></title><link>https://kyrelo.com/blog/comments?a=1&amp;b=2</link>
<guid isPermaLink="false">post-2</guid><description>&lt;p&gt;Answer every comment.&lt;/p&gt;</description><pubDate>Sun, 04 Oct 2026 09:00:00 GMT</pubDate></item>
<item><title>Video posts</title><link>https://kyrelo.com/blog/video</link><description>Now with video</description></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom blog</title>
<entry><title type="html">Hello &#8211; world</title><link rel="alternate" href="https://example.com/hello"/><id>tag:example.com,2026:1</id>
<updated>2026-10-04T09:00:00Z</updated><summary>First post</summary></entry></feed>`;

describe("parseFeed", () => {
  it("reads RSS: CDATA, entities, guids, and the link when there's no guid", () => {
    const feed = parseFeed(RSS);
    expect(feed.title).toBe("Kyrelo blog");
    expect(feed.items).toEqual([
      {
        id: "post-2",
        title: "Comments & replies",
        link: "https://kyrelo.com/blog/comments?a=1&b=2",
        summary: "Answer every comment.",
        published: "Sun, 04 Oct 2026 09:00:00 GMT",
      },
      { id: "https://kyrelo.com/blog/video", title: "Video posts", link: "https://kyrelo.com/blog/video", summary: "Now with video", published: undefined },
    ]);
  });

  it("reads Atom", () => {
    const feed = parseFeed(ATOM);
    expect(feed.title).toBe("Atom blog");
    expect(feed.items[0]).toMatchObject({ id: "tag:example.com,2026:1", title: "Hello – world", link: "https://example.com/hello", summary: "First post" });
  });

  it("finds nothing in a page that isn't a feed", () => {
    expect(parseFeed("<html><body>hi</body></html>").items).toEqual([]);
  });
});

describe("fillTemplate", () => {
  it("fills in the article's details", () => {
    const item = { id: "1", title: "Hello", link: "https://x.y", summary: "Short" };
    expect(fillTemplate("New: {title}\n{summary}\n\n{link}", item)).toBe("New: Hello\nShort\n\nhttps://x.y");
  });
});

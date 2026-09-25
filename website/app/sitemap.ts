import type { MetadataRoute } from "next";

const url = "https://kyrelo.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url, changeFrequency: "weekly", priority: 1 },
    { url: `${url}/tweetdelete-alternative`, changeFrequency: "monthly", priority: 0.8 },
  ];
}

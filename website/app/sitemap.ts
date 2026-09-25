import type { MetadataRoute } from "next";
import { SITE_URL } from "./site";

const url = SITE_URL;
const lastModified = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${url}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${url}/tweetdelete-alternative`, lastModified, changeFrequency: "monthly", priority: 0.8 },
  ];
}

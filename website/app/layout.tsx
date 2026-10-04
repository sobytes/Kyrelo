import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "./site";

const url = SITE_URL;
const title = "Kyrelo — Free, Open-Source Buffer & Postiz Alternative with AI Comment Replies";
const description =
  "Schedule posts, images and videos to 17 platforms including X, LinkedIn, Instagram, YouTube, TikTok and Bluesky, answer comments with AI drafts you approve, plan AI campaigns, bulk delete tweets and unfollow inactive accounts. Free and open source for Mac and Windows, running on your own computer.";

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL(url),
  alternates: { canonical: "/" },
  keywords: [
    "Buffer alternative",
    "Postiz alternative",
    "AI comment replies",
    "social media comment inbox",
    "LinkedIn scheduler",
    "YouTube scheduler",
    "TikTok scheduler",
    "Instagram scheduler",
    "open source social media scheduler",
    "X scheduler",
    "schedule tweets",
    "Bluesky scheduler",
    "Mastodon scheduler",
    "Threads scheduler",
    "AI tweet generator",
    "unfollow inactive accounts",
    "delete all tweets",
    "tweet deleter",
    "bulk delete tweets",
    "delete reposts",
    "undo retweets",
    "free tweet deleter",
  ],
  openGraph: {
    title,
    description,
    url,
    siteName: "Kyrelo",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
};

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

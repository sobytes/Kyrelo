import type { Metadata } from "next";
import "./globals.css";
import { SITE_URL } from "./site";

const url = SITE_URL;
const title = "Kyrelo — Free Buffer Alternative & Tweet Deleter for X";
const description =
  "Free, open-source X scheduler and tweet deleter for Mac and Windows. Schedule posts, bulk delete old tweets and reposts, all from your own computer.";

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL(url),
  alternates: { canonical: "/" },
  keywords: [
    "Buffer alternative",
    "X scheduler",
    "schedule tweets",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

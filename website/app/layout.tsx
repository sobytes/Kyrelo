import type { Metadata } from "next";
import "./globals.css";

const url = "https://kyrelo.com";
const title = "Kyrelo — Local Buffer alternative for X";
const description =
  "Schedule X posts, watch handles, reply with AI, and bulk delete your old tweets and reposts for free — all from your own computer. An open-source, local-first alternative to Buffer for macOS and Windows.";

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL(url),
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
    images: [{ url: "/screenshot.png", width: 1200, height: 720 }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/screenshot.png"],
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

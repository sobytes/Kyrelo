import type { Metadata } from "next";
import "./globals.css";

const url = "https://kyrelo.com";
const title = "Kyrelo — Local Buffer alternative for X";
const description =
  "Schedule X posts, watch handles, and reply with AI from your own computer. An open-source, local-first alternative to Buffer for macOS and Windows — no SaaS account, no outages.";

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL(url),
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

import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

// Downloaded at build time and bundled, so the app needs no network for them.
const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Kyrelo",
  description: "Schedule, monitor and clean up your X and Bluesky accounts from your own computer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <div className="window-drag fixed inset-x-0 top-0 z-50 h-7" />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

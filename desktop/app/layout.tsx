import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Kyrelo",
  description: "Watch X handles and reply with @grok from a local desktop app.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="window-drag fixed inset-x-0 top-0 z-50 h-7" />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { pageLocale } from "./_lib/server";

export const metadata: Metadata = {
  title: { default: "Amanta – Keamanan & Mutu Pangan", template: "%s · Amanta" },
  description: "Platform operasi keamanan dan mutu pangan berbasis AI untuk industri pangan Indonesia.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#157f50" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await pageLocale();
  return (
    <html lang={locale}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

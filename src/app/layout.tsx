import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { pageLocale } from "./_lib/server";

// Self-hosted at build time by next/font (CSP allows fonts from 'self' only). Both OFL-1.1.
const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Amanta – Keamanan & Mutu Pangan", template: "%s · Amanta" },
  description: "Platform operasi keamanan dan mutu pangan berbasis AI untuk industri pangan Indonesia.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#157f50" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await pageLocale();
  return (
    <html lang={locale} className={`${sans.variable} ${mono.variable}`} data-scroll-behavior="smooth">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";

const inter = Inter({
  weight: ["300", "400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

// Editorial serif accent. Self-hosted by next/font (no external request —
// safe under the Worker CSP). Exposed as --font-serif and used ONLY on the
// public /readiness page's display headings; every other surface is
// untouched (it just makes the variable available).
const newsreader = Newsreader({
  weight: ["400", "500"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "MyNclex-RN — Launching 2026 | QAcademy",
  description:
    "MyNclex-RN — NCLEX-RN exam prep for internationally-trained nurses. A QAcademy product, launching 2026.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className={`${inter.className} ${newsreader.variable} min-h-full flex flex-col`}>{children}</body>
    </html>
  );
}

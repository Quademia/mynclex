import type { Metadata } from "next";
import { Inter, Newsreader, IBM_Plex_Mono } from "next/font/google";
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

// Technical mono accent. Self-hosted by next/font (no external request —
// safe under the Worker CSP). Exposed as --font-mono and used ONLY on the
// public /bank-access page's eyebrows, stat figures and code-like labels;
// every other surface is untouched (it just makes the variable available).
const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-mono",
});

// ⚠ The two highest-visibility strings in the product: this title is the
// browser tab and the Google result. "Quademia", not "QAcademy" — the
// company renamed and the old name must not reach a reader (settled
// 2026-08-19, swept 2026-08-22; see lib/email/templates/wrapper.ts,
// which has said Quademia since the decision was made).
export const metadata: Metadata = {
  title: "MyNclex-RN — Launching 2026 | Quademia",
  description:
    "MyNclex-RN — NCLEX-RN exam prep for internationally-trained nurses. A Quademia product, launching 2026.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className={`${inter.className} ${newsreader.variable} ${ibmPlexMono.variable} min-h-full flex flex-col`}>{children}</body>
    </html>
  );
}

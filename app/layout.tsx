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
  // ⚠⚠ WITHOUT metadataBase, og:image RESOLVES AGAINST localhost:3000 IN
  // PRODUCTION. Next needs an absolute URL for social images and, with
  // nothing set, falls back to http://localhost:3000 unless VERCEL_URL
  // exists — and on Cloudflare it never does. The tag would ship
  // pointing at a host the crawler cannot reach, so a shared link would
  // show no picture while every local check looked perfect. Added with
  // the OG card, 2026-08-22.
  //
  // ⓘ Same shape as every other origin in this repo (lib/tutors,
  // lib/enrolments): NEXT_PUBLIC_SITE_URL is not set in wrangler.jsonc,
  // .env.local or either workflow, so the fallback is what actually
  // runs. It is kept anyway so setting the variable would work.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://nclex.quademia.com"),
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

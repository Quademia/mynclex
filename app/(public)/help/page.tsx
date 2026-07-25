// mynclex/app/(public)/help/page.tsx
//
// The public Help hub at /help — top-level, audience-neutral, no auth gate
// (bank-consumption-cat.html §3.2: help is reference material, reachable
// logged-out and by every audience alike).
//
// The hub carries two kinds of entry: short inline help for small topics,
// and teasers linking to full articles for topics that need depth. Today it
// holds one real topic — CAT, which genuinely needs its own page
// (/help/cat) — with a short blurb + "Read more". Built to grow: more cards
// slot in with no redesign, so we ship what actually exists rather than
// padding with placeholder topics.

import Link from 'next/link';

export const metadata = {
  title: 'Help — MyNclex',
  description: 'Guides and explanations for using MyNclex — including how computer-adaptive testing (CAT) works.',
};

export default function HelpIndexPage() {
  return (
    <main className="help-wrap">
      <div className="help-head">
        <div className="help-eyebrow">Help</div>
        <h1>Help &amp; guides</h1>
        <p className="help-lead">
          Short answers to how MyNclex works. Some topics are explained right
          here; the bigger ones get their own guide.
        </p>
      </div>

      <div className="help-topics">
        <article className="help-topic">
          <h2>How computer-adaptive testing (CAT) works</h2>
          <p>
            Our CAT mode mirrors the real NCLEX: it adapts to your ability,
            asks somewhere between 85 and 150 questions, and stops as soon as
            it is confident about your result — so no two sittings are the same
            length. If that feels unfamiliar (or the questions feel hard),
            the full guide explains why that is normal and how to read your
            result.
          </p>
          <Link href="/help/cat" className="help-readmore">
            Read more <span aria-hidden="true">→</span>
          </Link>
        </article>
      </div>
    </main>
  );
}

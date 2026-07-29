// mynclex/app/(public)/help/readiness-packs/page.tsx
//
// "How Readiness Packs work" — the second /help/[slug] article. Content
// grounded in readiness-packs.md (the canonical plan): a fixed 100-question
// timed assessment, one shot, a 21-day activation window covering both the
// sitting and the review, and a readiness band (Building → Approaching →
// Ready → Excelling). Plain English for a nervous nurse; same honesty
// framing as /help/cat (we measure against our own bar, not a real-NCLEX
// prediction).
//
// Public + audience-neutral, no auth gate (cat.html §3.2 established the
// /help/[slug] shape for all help articles).

import Link from 'next/link';

export const metadata = {
  title: 'How Readiness Packs work — MyNclex Help',
  description: 'Plain-English guide to Readiness Packs: what they are, the 21-day window, why you get one attempt, what your readiness band means, and how to review.',
};

export default function ReadinessPacksHelpPage() {
  return (
    <main className="help-wrap">
      <Link href="/help" className="help-back">
        <span aria-hidden="true">←</span> All guides
      </Link>

      <div className="help-head">
        <div className="help-eyebrow">Guide</div>
        <h1>How Readiness Packs work</h1>
        <p className="help-lead">
          A Readiness Pack is an exam-style checkpoint: a fixed set of
          questions you sit in one go to see where you stand. Here is what to
          expect before you start one — and why it works the way it does.
        </p>
      </div>

      <div className="help-article">
        <h2>What a Readiness Pack is</h2>
        <p>
          Each pack is a <strong>fixed set of 100 questions</strong>, sat under
          a time limit (about 3 hours 20 minutes), that measures your readiness
          and gives you a <strong>readiness band</strong>. Unlike the practice
          bank — where you learn question by question — a pack is a
          <em> measurement</em>: it is not adaptive, and every student sits the
          same 100 questions so the result means the same thing for everyone.
        </p>
        <p className="help-muted">
          Packs are part of your bank family, not a separate product. Your pack
          result also feeds the Readiness Signal on your dashboard.
        </p>

        <h2>Your 21-day window</h2>
        <p>
          A pack sits in your account <strong>dormant until you start it</strong> —
          it never expires while unopened, so there is no rush. When you press
          <strong> &ldquo;Start my 21 days&rdquo;</strong>, a 21-day window opens.
          That window is your time to <strong>sit the pack and review it</strong>.
        </p>
        <p>
          Starting the window is the commitment: if the 21 days pass and you
          never sit the pack, that attempt is used up — there is no reset or
          refund. So start your window when you are actually ready to use it.
        </p>
        <p className="help-muted">
          Once you have begun a sitting, you are always allowed to finish it —
          the sitting runs on its own timer even if it crosses the end of the
          window. Starting very late just leaves you less time to review.
        </p>

        <h2>Why you get one attempt</h2>
        <p>
          Each pack can be sat <strong>once</strong> — no retakes or resets. If
          you could re-sit the same 100 questions, the score would stop being an
          honest signal of where you stand. Treat it like the real thing:
          <strong> sit it in one session</strong>, and note that leaving early
          submits the answers you have given rather than throwing them away. By
          default a pack runs exam-style — in order, no going back.
        </p>

        <h2>What your band means</h2>
        <p>
          Your result is a band — <strong>Building</strong>,
          <strong> Approaching</strong>, <strong>Ready</strong> or
          <strong> Excelling</strong> — showing how close you are to our
          readiness bar, with <strong>Ready</strong> as the target.
        </p>
        <p>
          As with everything on MyNclex, we are honest about what that means:
          the band measures you against <strong>our</strong> standard, built from
          your answers. It is <strong>not</strong> a prediction of whether you
          will pass the real NCLEX — no practice product can promise that. It is
          a consistent, honest read on how ready you are right now.
        </p>

        <h2>Reviewing — and keeping your result</h2>
        <p>
          Inside your 21-day window you can <strong>review every question</strong> —
          your answer, the correct answer, and the rationale — so the pack
          teaches, not just scores. After day 21 that question-by-question
          review closes (the pack questions are reserved for future students),
          so review while the window is open.
        </p>
        <p>
          Your <strong>result never disappears</strong>: your score, your band,
          and your category breakdown stay in your history forever and keep
          feeding your Readiness Signal. Use that breakdown to see which
          client-needs areas to drill next in practice.
        </p>

        <div className="help-cta">
          <Link href="/help" className="help-readmore">
            <span aria-hidden="true">←</span> All guides
          </Link>
        </div>
      </div>
    </main>
  );
}

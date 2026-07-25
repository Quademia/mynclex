// mynclex/app/(public)/help/cat/page.tsx
//
// "How CAT works" — the public CAT explainer at /help/cat (the first
// /help/[slug] article). Content is the five sections settled in
// bank-consumption-cat.html §3.2, in plain English for a nervous nurse.
// Section 4 carries the one-time calibration-honesty disclosure (§3.1) —
// the single place we admit our day-one difficulty is a reasoned label, not
// yet a measurement, so it never has to nag on every CAT result.
//
// Public + audience-neutral: reads the same for a subscriber, a prospective
// buyer, or a tutor. No auth gate (§3.2).

import Link from 'next/link';

export const metadata = {
  title: 'How CAT works — MyNclex Help',
  description: 'Plain-English guide to computer-adaptive testing (CAT): what it does, why questions feel hard, what the verdict means, how calibration works, and how to use it well.',
};

export default function CatHelpPage() {
  return (
    <main className="help-wrap">
      <Link href="/help" className="help-back">
        <span aria-hidden="true">←</span> All guides
      </Link>

      <div className="help-head">
        <div className="help-eyebrow">Guide</div>
        <h1>How computer-adaptive testing (CAT) works</h1>
        <p className="help-lead">
          MyNclex&rsquo;s CAT mode is built to feel like the real NCLEX. If
          you&rsquo;ve never sat an adaptive test, a few things about it can be
          surprising — here is what is happening, and why none of it means what
          you might fear.
        </p>
      </div>

      <div className="help-article">
        <h2>What CAT does</h2>
        <p>
          A computer-adaptive test <strong>adjusts to you as you go</strong>.
          Answer well and the questions get harder; miss some and they ease
          back. It keeps going — anywhere from <strong>85 to 150 questions</strong> —
          and stops the moment it has enough evidence to be confident about
          your result. That is why one sitting might be 90 questions and another
          130: the length is a sign the test reached a decision, not a sign of
          how well you did.
        </p>
        <p className="help-muted">
          CAT is an exam-style measure of where you stand, not a study drill.
          For learning question by question, use the practice modes instead.
        </p>

        <h2>Why the questions feel hard</h2>
        <p>
          The engine deliberately serves questions right at the edge of your
          ability. That means <strong>getting roughly half of them wrong is
          normal and expected</strong>{' '}— it is how the test zeroes in on your
          level, not a sign that you are failing. A CAT that felt easy would
          actually be a worse measurement. Don&rsquo;t judge your sitting by how
          hard it felt.
        </p>

        <h2>What the verdict means</h2>
        <p>
          At the end you get one of two results — <strong>Above standard</strong> or{' '}
          <strong>Below standard</strong>{' '}— along with how confident we are in it
          (a readiness probability). &ldquo;Above standard&rdquo; means you cleared
          <em> our</em> readiness bar.
        </p>
        <p>
          We are careful about one thing here: that probability is the chance
          you are above <strong>our</strong> standard, measured from your answers.
          It is <strong>not</strong> a prediction of whether you will pass the real
          NCLEX — no practice product can honestly promise that. It is an honest
          readout of your performance against a consistent bar.
        </p>

        <h2>How calibration works</h2>
        <p>
          For the test to adapt, every question needs a difficulty. Today those
          difficulties start from <strong>expert curator judgement</strong> — our
          best-reasoned estimate of how hard each question is. As real students
          answer them, we recalibrate those difficulties against actual
          performance, so the engine gets sharper over time.
        </p>
        <p className="help-note">
          To be straight with you: on day one our &ldquo;Hard&rdquo; is a reasoned
          label, not yet a measurement. That is why we tell you once, here,
          rather than caveating every result. Your verdict is still an honest
          reflection of how you answered — the calibration only sharpens as the
          question bank is used more.
        </p>

        <h2>How to use CAT well</h2>
        <p>
          Treat it like the real thing: sit it in <strong>one go</strong>, with no
          pausing and no going back to change earlier answers — that is how the
          real exam runs, and it is what makes the measurement meaningful.
        </p>
        <p>
          The value comes <em>after</em>. Review the rationales on every question
          to see why each answer was right or wrong, and use the category
          breakdown on your result to spot the client-needs areas to drill next
          in practice.
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

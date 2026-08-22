// mynclex/app/(public)/for-tutors/page.tsx
//
// The public "For tutors" page — tutor-onboarding sub-slice 2a-i.
// Replaces the inert <span className="link-soon"> that has sat in the
// public nav since the landing page shipped.
// Plan: docs/product-plan/tutor-onboarding.md §5, §11 → Slice 2.
//
// ⭐ DELIBERATELY PLAIN, AND DELIBERATELY PRESENTATIONAL. Sam is sending
// this page to Claude Design (2026-08-22); what is here is copy, headings
// and a button so the doorway works in the meantime. So it holds NO
// application logic whatsoever — the form is a route away — and the CD
// design should be able to replace this file wholesale without touching
// anything that decides who may apply or what happens when they do.
//
// ⚠ It is also the page that must NOT oversell. Tutor plans and quotas
// are unmodelled (§12) and admission is not plan assignment, so there is
// nothing here about tiers, revenue share or limits: every one of those
// would be a promise the software cannot currently keep.

import Link from 'next/link';
import { TUTOR_APPLICATION_PATH } from '@/lib/tutors/types';

export const dynamic = 'force-dynamic';

/** What a tutor actually gets. Every line maps to something that exists. */
const OFFER: { title: string; body: string }[] = [
  {
    title: 'A question bank you did not have to write',
    body: 'Thousands of NCLEX-RN items with rationales, including next-generation formats. Build practice sets and mock exams from it without authoring a single question yourself.',
  },
  {
    title: 'Your programme, your curriculum',
    body: 'Set out a week-by-week schedule with pre- and post-tutorial tasks, reading, quizzes and live sessions. Students see exactly what is due and when.',
  },
  {
    title: 'Cohorts and live classes',
    body: 'Run more than one intake at a time. Sessions carry a link and a recording, and students are reminded before each class without you chasing anyone.',
  },
  {
    title: 'You see who is struggling',
    body: 'Per-student and per-cohort progress, attempt by attempt, so a quiet student who is falling behind is visible before the exam is.',
  },
  {
    title: 'Payments handled',
    body: 'Students pay in cedis or by international card. Instalment plans, reminders and receipts are the platform’s job, not yours.',
  },
];

/** The honest version of "how do I start", with no invented timescales. */
const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: '1',
    title: 'Tell us about yourself',
    body: 'A short application: who you are, where you work, and how you would teach. It takes a few minutes.',
  },
  {
    n: '2',
    title: 'We review it',
    body: 'Tutors are vetted before they can list a programme. We email you either way — and if the answer is no, we tell you why and you can update and resubmit.',
  },
  {
    n: '3',
    title: 'Build your first programme',
    body: 'Once you are approved, your tutor workspace opens and you can start building. There is no charge to get started.',
  },
];

export default function ForTutorsPage() {
  return (
    <main className="ft-page">
      <section className="ft-hero">
        <h1 className="ft-hero-title">Teach NCLEX-RN on MyNclex</h1>
        <p className="ft-hero-sub">
          Bring your students. We will bring the question bank, the
          curriculum tools, the progress tracking and the payments — so the
          part you are good at is the part you spend your time on.
        </p>
        <Link href={TUTOR_APPLICATION_PATH} className="ft-cta">
          Apply to become a tutor
        </Link>
        {/* ⓘ Says what it is, not how fast it is. There is no SLA in the
            product and inventing one here is a commitment nothing can
            honour. */}
        <p className="ft-hero-note">
          Free to apply. Free to start. Tutors are reviewed before they can
          list a programme.
        </p>
      </section>

      <section className="ft-section">
        <h2 className="ft-section-title">What you get</h2>
        <div className="ft-offer">
          {OFFER.map((o) => (
            <div key={o.title} className="ft-offer-card">
              <h3 className="ft-offer-title">{o.title}</h3>
              <p className="ft-offer-body">{o.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="ft-section">
        <h2 className="ft-section-title">How it works</h2>
        <ol className="ft-steps">
          {STEPS.map((s) => (
            <li key={s.n} className="ft-step">
              <span className="ft-step-n" aria-hidden="true">
                {s.n}
              </span>
              <div>
                <h3 className="ft-step-title">{s.title}</h3>
                <p className="ft-step-body">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="ft-closing">
        <h2 className="ft-closing-title">Ready when you are</h2>
        <p className="ft-closing-sub">
          If you already have an account with us, you will be asked to sign
          in first — your application belongs to that account.
        </p>
        <Link href={TUTOR_APPLICATION_PATH} className="ft-cta">
          Apply to become a tutor
        </Link>
      </section>
    </main>
  );
}

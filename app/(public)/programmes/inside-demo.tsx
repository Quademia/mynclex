'use client';

// mynclex/app/(public)/programmes/inside-demo.tsx
//
// "Inside a programme" — an interactive SAMPLE of the real student
// experience: a Curriculum view (unit rail + activity cascade) and a
// Quizzes view, toggled by tabs. Auto-rotates every 7s until the visitor
// interacts. Illustrative data only — it mirrors the real student surfaces'
// shapes but is not wired to any account. Styling is page-scoped `.prc-*`.

import { useEffect, useState } from 'react';

type Tab = 'curriculum' | 'quizzes';

const RAIL = [
  { label: 'Week 01', title: 'Foundations & test plan', status: 'done', pct: 100 },
  { label: 'Week 02', title: 'Safe & effective care', status: 'done', pct: 100 },
  { label: 'Week 03', title: 'Pharmacology foundations', status: 'up-next', pct: 40 },
  { label: 'Week 04', title: 'Med-surg deep dive', status: 'open', pct: 0 },
  { label: 'Week 05', title: 'Maternal & newborn', status: 'locked', pct: 0 },
] as const;

const ACTS = [
  { icon: '📖', title: 'Pharmacokinetics: what the body does to the drug', meta: 'Reading · ~25 min', pill: 'Done', tone: 'done', action: 'Read again' },
  { icon: '📅', title: 'Live class: high-alert medications', meta: 'Live session · Tue 7pm GMT', pill: 'Attended', tone: 'done', action: 'View recap' },
  { icon: '🧠', title: 'Weekly quiz: pharm foundations', meta: 'Practice quiz · 25 questions · 30m', pill: 'In progress', tone: 'progress', action: 'Resume' },
  { icon: '📚', title: 'Shelf: drug-class one-pagers', meta: 'Shelf · 3 of 8 notes done', pill: 'Up next', tone: 'upnext', action: 'Continue' },
  { icon: '📄', title: 'Dosage-calculation worksheet', meta: 'PDF · Due Aug 14', pill: 'Not started', tone: 'idle', action: 'Open' },
  { icon: '🔒', title: 'Case studies: polypharmacy in older adults', meta: 'Reading · Opens Aug 12', pill: '', tone: 'locked', action: 'Opens Aug 12' },
] as const;

const QUIZZES = [
  { title: 'Pharm foundations — weekly quiz', kind: 'PRACTICE', meta: 'Tutored practice · 25 questions · 30m · Attempt 2 of 3 · Pass: 80%', hint: 'Linked to Week 3 · Pharmacology foundations', pill: 'In progress', tone: 'progress', action: 'Resume' },
  { title: 'Safe & effective care checkpoint', kind: 'MOCK', meta: 'Exam mode · 50 questions · 1h 15m · 1 of 1 used', hint: 'Linked to Week 2 · Safe & effective care', pill: 'Done', tone: 'done', action: 'Review' },
  { title: 'Fundamentals warm-up', kind: 'PRACTICE', meta: 'Tutored practice · 15 questions · Unlimited attempts', hint: 'Linked to Week 1 · Foundations & test plan', pill: 'Done', tone: 'done', action: 'Take again' },
  { title: 'Mid-programme mock', kind: 'MOCK', meta: 'Exam mode · 85 questions · 2h 30m · Attempt 1 of 2', hint: 'Standalone · set by your tutor', pill: 'Not started', tone: 'idle', action: 'Start' },
] as const;

export function InsideDemo() {
  const [tab, setTab] = useState<Tab>('curriculum');
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => setTab((t) => (t === 'curriculum' ? 'quizzes' : 'curriculum')), 7000);
    return () => clearInterval(id);
  }, [auto]);

  const pick = (t: Tab) => { setTab(t); setAuto(false); };
  const isCur = tab === 'curriculum';

  return (
    <section id="inside" className="prc-inside">
      <span className="prc-inside-glow" />
      <div className="prc-inside-inner">
        <div className="prc-inside-head prc-reveal">
          <div className="prc-eyebrow plain on-teal">Inside a programme</div>
          <h2>Every programme runs on <em className="prc-serif">MyNclex</em></h2>
          <p>
            Whichever tutor you choose, the machinery underneath is the same: a week-by-week curriculum
            that tracks what&apos;s done and what&apos;s next, and tutor-set quizzes built from real NGN
            questions. This is the actual student view — try the tabs.
          </p>
        </div>

        <div className="prc-inside-tabs prc-reveal">
          <button type="button" className={`prc-itab${isCur ? ' on' : ''}`} onClick={() => pick('curriculum')}>Curriculum</button>
          <button type="button" className={`prc-itab${!isCur ? ' on' : ''}`} onClick={() => pick('quizzes')}>Quizzes</button>
        </div>

        <div className="prc-frame prc-reveal">
          <div className="prc-frame-bar">
            <span className="prc-frame-logo">M</span>
            <span className="prc-frame-titles">
              <span className="prc-frame-title">NCLEX-RN 8-Week Intensive</span>
              <span className="prc-frame-sub">Cohort: August intake</span>
            </span>
            <span className="prc-frame-spacer" />
            <span className={`prc-crumb${isCur ? ' on' : ''}`}>Curriculum</span>
            <span className={`prc-crumb${!isCur ? ' on' : ''}`}>Quizzes</span>
          </div>

          {isCur ? <CurriculumView /> : <QuizzesView />}
        </div>
      </div>
    </section>
  );
}

function CurriculumView() {
  return (
    <div className="prc-cur">
      <div className="prc-rail">
        {RAIL.map((u) => {
          const active = u.status === 'up-next';
          const badge = u.status === 'done' ? '✓' : u.status === 'locked' ? '🔒' : `${u.pct}%`;
          return (
            <div key={u.label} className={`prc-runit${active ? ' active' : ''}${u.status === 'locked' ? ' locked' : ''}`}>
              <span className="prc-runit-main">
                <span className="prc-runit-label">{u.label}</span>
                <span className="prc-runit-title">{u.title}</span>
              </span>
              <span className={`prc-runit-badge${u.status === 'done' ? ' done' : ''}`}>{badge}</span>
            </div>
          );
        })}
      </div>
      <div className="prc-detail">
        <div className="prc-detail-eyebrow">Week 03</div>
        <div className="prc-detail-title">Pharmacology foundations</div>
        <div className="prc-progress">
          <span className="prc-progress-bar"><span className="prc-progress-fill" style={{ width: '40%' }} /></span>
          <span className="prc-progress-pct">40% complete</span>
        </div>
        <div className="prc-acts">
          {ACTS.map((a) => {
            const locked = a.tone === 'locked';
            const solid = a.tone === 'upnext' || a.tone === 'progress';
            return (
              <div key={a.title} className={`prc-act${locked ? ' locked' : ''}${a.tone === 'upnext' ? ' upnext' : ''}`}>
                <span className="prc-act-icon">{a.icon}</span>
                <span className="prc-act-main">
                  <span className="prc-act-top">
                    <span className="prc-act-title">{a.title}</span>
                    {a.pill && <span className={`prc-pill ${a.tone}`}>{a.pill}</span>}
                  </span>
                  <span className="prc-act-meta">{a.meta}</span>
                </span>
                <span className={`prc-act-action${locked ? ' muted' : solid ? ' solid' : ''}`}>{a.action}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function QuizzesView() {
  return (
    <div className="prc-qz">
      <div className="prc-qz-title">Quizzes</div>
      <div className="prc-qz-sub">Every quiz your tutor attached — with your attempts and progress.</div>
      <div className="prc-qz-list">
        {QUIZZES.map((q) => {
          const solid = q.tone === 'progress' || q.tone === 'idle';
          return (
            <div key={q.title} className="prc-qrow">
              <span className="prc-qrow-main">
                <span className="prc-qrow-top">
                  <span className="prc-qrow-title">{q.title}</span>
                  <span className={`prc-kind ${q.kind === 'MOCK' ? 'mock' : 'practice'}`}>{q.kind === 'MOCK' ? 'Mock' : 'Practice'}</span>
                </span>
                <span className="prc-qrow-meta">{q.meta}</span>
                <span className="prc-qrow-hint">{q.hint}</span>
              </span>
              <span className="prc-qrow-actions">
                <span className={`prc-pill ${q.tone}`}>{q.pill}</span>
                <span className={`prc-act-action${solid ? ' solid' : ''}`}>{q.action}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="prc-qz-note">Quizzes run in the same runner as our readiness packs — every NGN question type, with rationales in review.</div>
    </div>
  );
}

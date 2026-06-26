// mynclex/lib/library/student/practice-index-view.tsx
//
// "My practice" index (Slice 1) — a practice-first list of the library's
// notes that carry embedded questions, with the student's first-try
// standing. A focused, mobile-first surface reached from the library; it
// reflects, and points back into the note to practise (practice has one
// home — the note).
//
// Presentational + server-rendered: every action is a <Link>. Rows open
// the note (Slice 2 inserts a reflection page in between). The headline
// %/counts and per-note scores come from getStudentPracticeIndex* — all
// derived, no writes.

import Link from 'next/link';
import type { StudentPracticeIndex, PracticeNoteRow } from './practice-queries';

interface PracticeIndexViewProps {
  index: StudentPracticeIndex;
  /** Library route base, e.g. `/student/programme/<id>/library`. */
  basePath: string;
}

/** Tone band for a first-try percentage (mirrors the reading-lens bands). */
function scoreTone(pct: number): 'strong' | 'holding' | 'wobbly' | 'reteach' {
  if (pct >= 78) return 'strong';
  if (pct >= 60) return 'holding';
  if (pct >= 45) return 'wobbly';
  return 'reteach';
}

export function PracticeIndexView({ index, basePath }: PracticeIndexViewProps) {
  const { notesPractised, questionsAnswered, firstTryPct, notes, hasAnyBlocks } =
    index;

  return (
    <div className="mpr-wrap">
      <Link href={basePath} className="mpr-back">
        ← Library
      </Link>

      <header className="mpr-head">
        <h1>My practice</h1>
        <p>Practice from inside your notes. These don&apos;t affect your bank stats.</p>
      </header>

      {!hasAnyBlocks ? (
        <div className="mpr-empty">
          <div className="mpr-empty-glyph" aria-hidden="true">
            ✎
          </div>
          <p className="mpr-empty-title">No practice yet</p>
          <p className="mpr-empty-sub">
            None of your notes have practice questions in them yet. When your
            tutor adds some, they&apos;ll show up here.
          </p>
        </div>
      ) : (
        <>
          <div className="mpr-stats">
            <div className="mpr-stat">
              <div className="mpr-stat-val">{notesPractised}</div>
              <div className="mpr-stat-lbl">Notes practised</div>
            </div>
            <div className="mpr-stat">
              <div className="mpr-stat-val">{questionsAnswered}</div>
              <div className="mpr-stat-lbl">Questions answered</div>
            </div>
            <div className="mpr-stat">
              <div
                className={`mpr-stat-val${
                  firstTryPct === null ? '' : ` is-${scoreTone(firstTryPct)}`
                }`}
              >
                {firstTryPct === null ? '—' : `${firstTryPct}%`}
              </div>
              <div className="mpr-stat-lbl">First-try</div>
            </div>
          </div>

          <div className="mpr-section-label">Notes with practice</div>
          <div className="mpr-list">
            {notes.map((n) => (
              <PracticeNoteCard key={n.noteId} note={n} basePath={basePath} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PracticeNoteCard({
  note,
  basePath,
}: {
  note: PracticeNoteRow;
  basePath: string;
}) {
  // A row opens the per-note reflection (verdict + your breakdown + the
  // practice signpost).
  const href = `${basePath}/practice/${note.noteId}`;

  const accPct = note.answered
    ? Math.round((note.firstCorrect / note.answered) * 100)
    : 0;

  let stateClass: string;
  let sub: React.ReactNode;
  let right: React.ReactNode;

  if (!note.started) {
    stateClass = 'is-empty';
    sub = (
      <span className="mpr-note-sub">
        {note.questionCount} question{note.questionCount === 1 ? '' : 's'} · not
        started
      </span>
    );
    right = <span className="mpr-practise">Practise →</span>;
  } else if (note.toReview > 0) {
    stateClass = 'is-review';
    sub = (
      <span className="mpr-note-sub is-review">
        {note.toReview} to review →
      </span>
    );
    right = (
      <div className={`mpr-score is-${scoreTone(accPct)}`}>
        <div className="mpr-score-val">
          {note.firstCorrect}/{note.answered}
        </div>
        <div className="mpr-score-lbl">first try</div>
      </div>
    );
  } else {
    stateClass = 'is-solid';
    sub = <span className="mpr-note-sub is-solid">Looks solid ✓</span>;
    right = (
      <div className="mpr-score is-strong">
        <div className="mpr-score-val">
          {note.firstCorrect}/{note.answered}
        </div>
        <div className="mpr-score-lbl">first try</div>
      </div>
    );
  }

  return (
    <Link href={href} className={`mpr-note ${stateClass}`}>
      <span className="mpr-note-dot" aria-hidden="true" />
      <div className="mpr-note-main">
        <div className="mpr-note-title">{note.title}</div>
        {sub}
      </div>
      <div className="mpr-note-right">{right}</div>
    </Link>
  );
}

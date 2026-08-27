// mynclex/lib/library/student/practice-note-view.tsx
//
// "My practice" — per-note reflection (Slice 2). The student's questions
// for one note, grouped by block, each marked correct / missed /
// recovered, with their answer vs the correct one and a "Why" on misses.
// Practice has one home — the note — so every "Practise" action deep-links
// into the note at the relevant block (the read view anchors each embed
// block as `practice-<blockId>`). Presentational + server-rendered.

import Link from 'next/link';
import type {
  StudentPracticeNote,
  PracticeNoteBlock,
  PracticeQuestion,
} from './practice-queries';

interface PracticeNoteViewProps {
  note: StudentPracticeNote;
  /** Library route base, e.g. `/student/programme/<id>/library`. */
  basePath: string;
}

const MARK: Record<PracticeQuestion['state'], string> = {
  correct: '✓',
  recovered: '✓',
  missed: '✕',
  unanswered: '○',
};

export function PracticeNoteView({ note, basePath }: PracticeNoteViewProps) {
  const noteHref = `${basePath}/note/${note.noteId}`;
  const practiceHref = note.practiceBlockId
    ? `${noteHref}#practice-${note.practiceBlockId}`
    : noteHref;

  // Verdict + CTA, three states.
  let verdictClass: string;
  let verdictHead: string;
  let verdictSub: string;
  let ctaLabel: string;
  let ctaOutline = false;

  if (note.total === 0) {
    verdictClass = 'is-empty';
    verdictHead = 'No practice in this note';
    verdictSub = 'This note doesn’t have any practice questions yet.';
    ctaLabel = '';
  } else if (!note.started) {
    verdictClass = 'is-empty';
    verdictHead = `${note.total} question${note.total === 1 ? '' : 's'} across ${
      note.blockCount
    } block${note.blockCount === 1 ? '' : 's'}`;
    verdictSub =
      'You haven’t practised this note yet. Work through it whenever you’re reading.';
    ctaLabel = 'Start practice';
  } else if (note.toReview > 0) {
    verdictClass = 'is-review';
    verdictHead = `You got ${note.firstCorrect} of ${note.answered} right first try.`;
    verdictSub =
      'Read the why on each miss, then practise them again. Re-practising is encouraged.';
    ctaLabel = `↻  Practise the ${note.toReview} you missed`;
  } else {
    verdictClass = 'is-solid';
    verdictHead = `You got ${note.firstCorrect} of ${note.answered} right first try.`;
    verdictSub = 'Strong grasp of this note — nicely done.';
    ctaLabel = 'Practise all again';
    ctaOutline = true;
  }

  return (
    // `.slm` — see practice-index-view.tsx for why this wrapper is here
    // and not inherited from the shell.
    <div className="slm">
    <div className="mpr-wrap is-detail">
      <Link href={`${basePath}/practice`} className="mpr-back">
        ← My practice
      </Link>

      <h1 className="mpr-detail-title">{note.title}</h1>

      {note.total > 0 && (
        <div className={`mpr-verdict ${verdictClass}`}>
          <div className="mpr-verdict-head">{verdictHead}</div>
          <div className="mpr-verdict-sub">{verdictSub}</div>
        </div>
      )}

      {note.blocks.map((b) => (
        <PracticeBlockSection
          key={b.blockId}
          block={b}
          practiceHref={`${noteHref}#practice-${b.blockId}`}
        />
      ))}

      {note.total === 0 ? (
        <Link href={noteHref} className="mpr-read-link">
          Read the full note →
        </Link>
      ) : (
        <div className="mpr-detail-foot">
          <Link
            href={practiceHref}
            className={`mpr-cta${ctaOutline ? ' is-outline' : ''}`}
          >
            {ctaLabel}
          </Link>
          <Link href={noteHref} className="mpr-read-link">
            Read the full note →
          </Link>
        </div>
      )}
    </div>
    </div>
  );
}

function PracticeBlockSection({
  block,
  practiceHref,
}: {
  block: PracticeNoteBlock;
  practiceHref: string;
}) {
  return (
    <section className="mpr-block">
      <div className="mpr-block-head">
        <span className="mpr-block-label">{block.label}</span>
        {block.hasReview && (
          <Link href={practiceHref} className="mpr-block-practise">
            Practise →
          </Link>
        )}
      </div>
      {block.questions.map((q) => (
        <PracticeQuestionCard key={q.itemId} q={q} />
      ))}
    </section>
  );
}

function PracticeQuestionCard({ q }: { q: PracticeQuestion }) {
  let youLine: string;
  if (q.state === 'unanswered') youLine = 'Not practised yet';
  else if (q.state === 'correct')
    youLine = `You chose: ${q.youText ?? '—'} · correct first try`;
  else if (q.state === 'recovered')
    youLine = 'Missed first — got it after re-practice';
  else youLine = `You chose: ${q.youText ?? '—'}`;

  return (
    <div className={`mpr-q is-${q.state}`}>
      <span className="mpr-q-mark" aria-hidden="true">
        {MARK[q.state]}
      </span>
      <div className="mpr-q-body">
        <div className="mpr-q-stem">{q.stem}</div>
        <div className="mpr-q-you">{youLine}</div>
        {(q.state === 'missed' || q.state === 'recovered') && q.correctText && (
          <div className="mpr-q-correct">Correct: {q.correctText}</div>
        )}
        {q.state === 'missed' && q.rationale && (
          <div className="mpr-q-why">
            <div className="mpr-q-why-label">Why</div>
            <div className="mpr-q-why-body">{q.rationale}</div>
          </div>
        )}
      </div>
    </div>
  );
}

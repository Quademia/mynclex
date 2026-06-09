// mynclex/lib/programme-quizzes/programme-quiz-badges.tsx
//
// Programme-scoped badge cluster for a quiz row (2026-06 Claude Design
// "grouped rows"). Same badge + hover-peek language as the global quiz
// card, recontextualised for "inside a programme":
//   • Activities — curriculum activities IN this programme that
//     reference the quiz (peek lists all). Zero → a neutral
//     "Standalone" marker (the quiz is attached directly, not via the
//     curriculum), no peek.
//   • Tags — the quiz's own tags.
//   • Other programmes — the tutor's OTHER programmes the quiz is also
//     attached to (reuse context before Remove). Zero → "Only here".
//
// Self-contained peek primitives (auto-flip up/down by viewport room),
// reusing the shared qc-* CSS already in styles/quiz.css.

'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { QuizIcon, type QuizIconName } from '@/lib/tutor-quiz/quiz-icons';
import type { ProgrammeQuizActivityRef } from './types';

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function unitNoun(label: 'WEEK' | 'MODULE'): string {
  return label === 'MODULE' ? 'Module' : 'Week';
}

function usePeek(hasContent: boolean) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const enterT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onMouseEnter = () => {
    if (!hasContent) return;
    if (leaveT.current) clearTimeout(leaveT.current);
    enterT.current = setTimeout(() => setOpen(true), 90);
  };
  const onMouseLeave = () => {
    if (enterT.current) clearTimeout(enterT.current);
    if (pinned) return;
    leaveT.current = setTimeout(() => setOpen(false), 110);
  };
  const onFocus = () => {
    if (hasContent) setOpen(true);
  };
  const onBlur = () => {
    if (!pinned) setOpen(false);
  };
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hasContent) return;
    const next = !pinned;
    setPinned(next);
    setOpen(next);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setPinned(false);
      (e.currentTarget as HTMLElement).blur();
    }
  };

  useEffect(
    () => () => {
      if (enterT.current) clearTimeout(enterT.current);
      if (leaveT.current) clearTimeout(leaveT.current);
    },
    [],
  );

  return {
    isOpen: open,
    pinned,
    handlers: { onMouseEnter, onMouseLeave, onFocus, onBlur, onClick, onKeyDown },
  };
}

function Peek({ open, children }: { open: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  const [down, setDown] = useState(false);

  useLayoutEffect(() => {
    if (!open || !ref.current) {
      setShift(0);
      return;
    }
    const r = ref.current.getBoundingClientRect();
    const pad = 12;
    let s = 0;
    if (r.left < pad) s = pad - r.left;
    else if (r.right > window.innerWidth - pad)
      s = window.innerWidth - pad - r.right;
    setShift(s);
    // Flip below the badge when there isn't room above it (top rows).
    setDown(r.top < pad);
  }, [open]);

  return (
    <div
      ref={ref}
      className={`qc-peek align-left ${down ? 'is-down' : 'is-up'} ${
        open ? 'is-open' : ''
      }`}
      style={{ ['--shift' as string]: `${shift}px` }}
      role="tooltip"
    >
      {children}
    </div>
  );
}

function Badge({
  type,
  icon,
  count,
  one,
  many,
  tone = '',
  zeroLabel,
  children,
}: {
  type: 'activities' | 'tags' | 'programmes';
  icon: QuizIconName;
  count: number;
  one: string;
  many: string;
  tone?: string;
  zeroLabel: string;
  children: ReactNode;
}) {
  const has = count > 0;
  const { isOpen, pinned, handlers } = usePeek(has);
  return (
    <span
      className={`qc-badge-host ${isOpen ? 'is-open' : ''} ${
        pinned ? 'is-pinned' : ''
      }`}
    >
      <button
        type="button"
        data-type={type}
        className={`qc-badge ${tone} ${has ? '' : 'is-zero'}`}
        aria-expanded={has ? isOpen : undefined}
        tabIndex={has ? 0 : -1}
        {...handlers}
      >
        <QuizIcon name={icon} />
        {has ? (
          <>
            <b>{count}</b>
            <span className="lbl">{plural(count, one, many)}</span>
          </>
        ) : (
          <span className="lbl">{zeroLabel}</span>
        )}
      </button>
      {has && <Peek open={isOpen}>{children}</Peek>}
    </span>
  );
}

export function ProgrammeQuizBadges({
  activities,
  tags,
  otherProgrammes,
}: {
  activities: ProgrammeQuizActivityRef[];
  tags: string[];
  otherProgrammes: string[];
}) {
  return (
    <span className="qc-foot-badges style-chip">
      {activities.length > 0 ? (
        <Badge
          type="activities"
          icon="link"
          count={activities.length}
          one="activity"
          many="activities"
          tone="tone-linked"
          zeroLabel="Standalone"
        >
          <div className="qc-peek-title">
            <QuizIcon name="link" />
            Linked via {activities.length}{' '}
            {plural(activities.length, 'activity', 'activities')}
          </div>
          <div className="qc-peek-list">
            {activities.map((a) => (
              <div key={a.activity_id} className="qc-peek-row is-stack">
                <span className="qc-peek-row-main">{a.title}</span>
                <span className="qc-peek-row-sub">
                  <QuizIcon name="unit" />
                  {unitNoun(a.unit_label)} {a.unit_index} · {a.unit_title}
                </span>
              </div>
            ))}
          </div>
        </Badge>
      ) : (
        <span
          className="qc-badge is-standalone"
          title="Attached directly to this programme — not via a curriculum activity"
        >
          <QuizIcon name="dot" />
          <span className="lbl">Standalone</span>
        </span>
      )}

      <Badge
        type="tags"
        icon="hash"
        count={tags.length}
        one="tag"
        many="tags"
        zeroLabel="No tags"
      >
        <div className="qc-peek-title">
          <QuizIcon name="hash" />
          Tags
        </div>
        <div className="qc-peek-tags">
          {tags.map((t) => (
            <span key={t} className="qc-tag-chip">
              #{t}
            </span>
          ))}
        </div>
      </Badge>

      <Badge
        type="programmes"
        icon="programmes"
        count={otherProgrammes.length}
        one="other programme"
        many="other programmes"
        zeroLabel="Only here"
      >
        <div className="qc-peek-title">
          <QuizIcon name="programmes" />
          Also used in {otherProgrammes.length} other{' '}
          {plural(otherProgrammes.length, 'programme', 'programmes')}
        </div>
        <div className="qc-peek-list">
          {otherProgrammes.map((p) => (
            <div key={p} className="qc-peek-row">
              <QuizIcon name="programmes" />
              <span>{p}</span>
            </div>
          ))}
        </div>
      </Badge>
    </span>
  );
}

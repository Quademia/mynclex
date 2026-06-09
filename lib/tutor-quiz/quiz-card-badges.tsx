// mynclex/lib/tutor-quiz/quiz-card-badges.tsx
//
// The quiz card's dedicated badges row (2026-06 Claude Design "Quiz UI
// Uplift" — Layout B + chip style). Three count badges — Tags /
// Programmes / Activities — each a pill chip showing icon + count, with
// a hover/focus/click-pinned peek popover that reveals the actual list
// (tag chips · programme names · activity title + programme·unit).
//
// Client component: the peek open/pin state + the viewport-edge shift
// are interactive. Lives in the card's footer OUTSIDE the editor link
// (the card body + meta row stay the link; the badges are independent
// buttons), so clicking a badge pins its peek instead of navigating.
// Zero counts render muted + non-interactive (no peek).

'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { QuizIcon, type QuizIconName } from './quiz-icons';
import type {
  QuizCardActivityRef,
  QuizCardProgrammeRef,
} from './types';

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function unitLabel(ref: QuizCardActivityRef): string {
  const word = ref.unit_label === 'MODULE' ? 'Module' : 'Week';
  return `${word} ${ref.unit_index}`;
}

// Hover (delayed) + focus open; click pins; Esc closes + unpins.
function usePeek(hasContent: boolean) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const enterT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveT = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (enterT.current) clearTimeout(enterT.current);
    if (leaveT.current) clearTimeout(leaveT.current);
  }

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

  useEffect(() => clearTimers, []);

  return {
    isOpen: open,
    pinned,
    handlers: { onMouseEnter, onMouseLeave, onFocus, onBlur, onClick, onKeyDown },
  };
}

type PeekDirection = 'up' | 'down';

function Peek({
  open,
  direction,
  children,
}: {
  open: boolean;
  direction: PeekDirection;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);

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
  }, [open]);

  return (
    <div
      ref={ref}
      className={`qc-peek align-left ${
        direction === 'down' ? 'is-down' : 'is-up'
      } ${open ? 'is-open' : ''}`}
      style={{ ['--shift' as string]: `${shift}px` }}
      role="tooltip"
    >
      {children}
    </div>
  );
}

function CountBadge({
  type,
  icon,
  count,
  one,
  many,
  zeroLabel,
  direction,
  children,
}: {
  type: 'tags' | 'programmes' | 'activities';
  icon: QuizIconName;
  count: number;
  one: string;
  many: string;
  zeroLabel: string;
  direction: PeekDirection;
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
        className={`qc-badge ${has ? '' : 'is-zero'}`}
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
      {has && (
        <Peek open={isOpen} direction={direction}>
          {children}
        </Peek>
      )}
    </span>
  );
}

export function QuizCardBadges({
  tags,
  programmes,
  activities,
  direction = 'up',
}: {
  tags: string[];
  programmes: QuizCardProgrammeRef[];
  activities: QuizCardActivityRef[];
  /** Which way the peek popovers open. Cards sit low → 'up' (default);
   *  the editor header sits high → 'down'. */
  direction?: PeekDirection;
}) {
  return (
    <div className="qc-foot-badges">
      <CountBadge
        type="tags"
        icon="hash"
        count={tags.length}
        one="tag"
        many="tags"
        zeroLabel="No tags"
        direction={direction}
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
      </CountBadge>

      <CountBadge
        type="programmes"
        icon="programmes"
        count={programmes.length}
        one="programme"
        many="programmes"
        zeroLabel="Unused"
        direction={direction}
      >
        <div className="qc-peek-title">
          <QuizIcon name="programmes" />
          In {programmes.length}{' '}
          {plural(programmes.length, 'programme', 'programmes')}
        </div>
        <div className="qc-peek-list">
          {programmes.map((p) => (
            <div key={p.programme_id} className="qc-peek-row">
              <QuizIcon name="programmes" />
              <span>{p.title}</span>
            </div>
          ))}
        </div>
      </CountBadge>

      <CountBadge
        type="activities"
        icon="layers"
        count={activities.length}
        one="activity"
        many="activities"
        zeroLabel="No activities"
        direction={direction}
      >
        <div className="qc-peek-title">
          <QuizIcon name="layers" />
          {activities.length} {plural(activities.length, 'activity', 'activities')}
        </div>
        <div className="qc-peek-list">
          {activities.map((a) => (
            <div key={a.activity_id} className="qc-peek-row is-stack">
              <span className="qc-peek-row-main">{a.title}</span>
              <span className="qc-peek-row-sub">
                <QuizIcon name="programmes" />
                {a.programme_title} · {unitLabel(a)}
              </span>
            </div>
          ))}
        </div>
      </CountBadge>
    </div>
  );
}

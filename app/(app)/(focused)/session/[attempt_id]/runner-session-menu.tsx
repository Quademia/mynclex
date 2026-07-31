// mynclex/app/(app)/(focused)/session/[attempt_id]/runner-session-menu.tsx
//
// The ⋯ sheet's contents — everything the phone topbar had to drop, with
// its words put back (docs/product-plan/runner-mobile.md).
//
// The desktop topbar carries nine controls and explains four of them with
// `title=` tooltips. A phone has room for five controls and no hover at
// all, so the tooltip text is not a nicety here — it is the only place
// several of these controls are ever explained. Every `sub` line below is
// a sentence that used to live in a `title=` attribute.
//
// It also re-homes two things that are not buttons:
//   • the session NAME, hidden from the phone topbar (only the mode meta
//     line survives there)
//   • the MODE BRIEF from footerBrief(), removed from the footer where it
//     would either wrap to three lines or crush the Submit button. It is
//     relocated, not deleted — this is where it lands.
//
// ⚠ Flag appears BOTH here and on the topbar, deliberately. It stays on
// the bar because it is per-question and frequent; it appears here because
// on a phone the bar shows it as a bare glyph, and this row is the only
// place a student is told what flagging actually does — and how it differs
// from the bookmark directly below it (docs/product-plan/flag-and-bookmark.md).

'use client';

// The topbar's own glyphs, reused rather than redrawn — these rows ARE the
// bookmark/calculator/clock controls the phone topbar dropped, so they must
// look like them. (Also why no emoji: the runner's icon set is a single
// family of 14–15px currentColor strokes, and a colour emoji among them
// reads as a different control.)
import {
  BookmarkIcon,
  CalcIcon,
  ClockIcon,
  ClockOffIcon,
  FlagIcon,
  type ClockProps,
} from './runner-topbar';

interface Toggle {
  on: boolean;
  busy?: boolean;
  onToggle: () => void;
}

interface Props {
  sessionTitle: string;
  modeLabel: string;
  /** footerBrief() — the mode's orientation copy, evicted from the footer. */
  brief: string;
  /** Null where flagging is not offered (the two forward-only modes). */
  flag: (Toggle & { editable: boolean }) | null;
  /** Null where bookmarking is not offered (CAT, packs, tutor quizzes). */
  bookmark: Toggle | null;
  calc: Toggle;
  /**
   * Null in review mode — there is no clock to hide.
   *
   * Deliberately the WHOLE ClockProps object rather than the three fields
   * this menu uses: runner.tsx builds it from refs, so picking fields off it
   * in that file's render trips react-hooks/refs. Read here, inside the
   * child, they are ordinary props.
   */
  clock: Pick<ClockProps, 'hidden' | 'canHide' | 'onToggleHide'> | null;
  onExit: () => void;
  /** Closes the sheet; every row calls it after acting. */
  onClose: () => void;
}

export function RunnerSessionMenu({
  sessionTitle,
  modeLabel,
  brief,
  flag,
  bookmark,
  calc,
  clock,
  onExit,
  onClose,
}: Props) {
  return (
    <>
      <div className="rn-menu-head">
        <div className="name">{sessionTitle}</div>
        <div className="meta">{modeLabel}</div>
        {brief && <div className="rn-menu-brief">{brief}</div>}
      </div>

      <div className="rn-menu-list">
        {flag && (
          <MenuItem
            glyph={<FlagIcon filled={flag.on} />}
            label={flag.on ? 'Flagged for review' : 'Flag for review'}
            // In review the flag is frozen: it is part of the attempt record,
            // and unflagging afterwards would make the report's flag count
            // retroactively untrue. Say so rather than showing a dead row.
            sub={
              flag.editable
                ? 'Comes back in the grid’s Flagged filter this sitting'
                : 'Flags cannot be changed after a sitting ends'
            }
            on={flag.on}
            state={flag.on ? 'On' : undefined}
            disabled={flag.busy || !flag.editable}
            onClick={() => { flag.onToggle(); onClose(); }}
          />
        )}

        {bookmark && (
          <MenuItem
            glyph={<BookmarkIcon filled={bookmark.on} />}
            label={bookmark.on ? 'Bookmarked' : 'Bookmark for later study'}
            sub="Kept after this sitting ends"
            on={bookmark.on}
            state={bookmark.on ? 'Saved' : undefined}
            disabled={bookmark.busy}
            onClick={() => { bookmark.onToggle(); onClose(); }}
          />
        )}

        <MenuItem
          glyph={<CalcIcon />}
          label="Calculator"
          sub="The on-screen calculator you get in the exam"
          on={calc.on}
          state={calc.on ? 'Open' : undefined}
          onClick={() => { calc.onToggle(); onClose(); }}
        />

        {clock && (
          <MenuItem
            glyph={clock.hidden ? <ClockOffIcon /> : <ClockIcon />}
            label={clock.hidden ? 'Show the clock' : 'Hide the clock'}
            sub={
              clock.canHide
                ? 'Locks once the first time warning fires'
                : 'Locked — a time warning has already fired'
            }
            disabled={!clock.canHide}
            onClick={() => { clock.onToggleHide(); onClose(); }}
          />
        )}
      </div>

      <div className="rn-menu-foot">
        {/* Still routes through the runner's existing exit handling, which
            confirms first on a live attempt. The sheet closes either way. */}
        <button
          type="button"
          className="rn-menu-exit"
          onClick={() => { onClose(); onExit(); }}
        >
          Exit the session
        </button>
      </div>
    </>
  );
}

function MenuItem({
  glyph,
  label,
  sub,
  on,
  state,
  disabled,
  onClick,
}: {
  glyph: React.ReactNode;
  label: string;
  sub: string;
  on?: boolean;
  state?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={'rn-menu-item' + (on ? ' on' : '')}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on === undefined ? undefined : on}
    >
      <span className="glyph">{glyph}</span>
      <span className="body">
        <span className="label">{label}</span>
        <span className="sub">{sub}</span>
      </span>
      {state && <span className="state">{state}</span>}
    </button>
  );
}

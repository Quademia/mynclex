'use client';

// mynclex/app/(app)/student/bank/packs/readiness-packs-client.tsx
//
// The interactive Readiness Packs surface (Slice ②b.1), built from the
// CD "Readiness Claiming" prototype — narrowed to the states reachable
// this slice: catalogue, claimable, claimed. Activation, the exam and
// results (the ACTIVE / completed states) arrive in the sitting +
// results slices; the resolver already emits them, so those cards light
// up then without a rewrite here.
//
// Claiming goes through the server actions (claimReadinessPack /
// claimAllReadiness); on success we refresh the server data so the
// cards re-derive. The claim confirm carries BOTH halves of the copy
// (§7): it won't start the clock, and it can't be swapped later.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { claimReadinessPack, claimAllReadiness } from '@/lib/payments/readiness-claim';
import { activateReadinessPack } from '@/lib/payments/readiness-activate';
import { beginReadinessAttempt } from '@/lib/payments/readiness-begin';
import { scoreToBand } from '@/lib/payments/readiness-band';
import type { StudentReadinessView, StudentPackCard } from '@/lib/payments/readiness-packs-view';

function timeStr(sec: number): string {
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h && mm) return `${h}h ${mm}m`;
  if (h) return `${h}h`;
  return `${mm}m`;
}

type Dialog =
  | { kind: 'claim'; pack: StudentPackCard }
  | { kind: 'activate'; pack: StudentPackCard }
  | { kind: 'claimAll' }
  | null;

export function ReadinessPacksClient({ view }: { view: StudentReadinessView }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const claimablePacks = view.packs.filter((p) => p.state === 'CLAIMABLE');
  const showClaimAll = claimablePacks.length >= 2 && view.unclaimed >= claimablePacks.length;

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3600);
  }

  function doClaim(pack: StudentPackCard) {
    startTransition(async () => {
      const r = await claimReadinessPack(pack.packId);
      setDialog(null);
      if (r.ok) {
        flash(`${pack.title} claimed — start the clock when you're ready.`);
        router.refresh();
      } else {
        flash(r.error ?? 'Could not claim that pack.');
      }
    });
  }

  function doClaimAll() {
    startTransition(async () => {
      const r = await claimAllReadiness();
      setDialog(null);
      if (r.ok) {
        flash(`Claimed ${r.claimed ?? 0} pack${(r.claimed ?? 0) === 1 ? '' : 's'}.`);
        router.refresh();
      } else {
        flash(r.error ?? 'Could not claim your packs.');
      }
    });
  }

  function doActivate(pack: StudentPackCard) {
    startTransition(async () => {
      const r = await activateReadinessPack(pack.packId);
      setDialog(null);
      if (r.ok) {
        flash(`Your 21 days on ${pack.title} have started.`);
        router.refresh();
      } else {
        flash(r.error ?? 'Could not start your window.');
      }
    });
  }

  // Begin exam → build the sitting, then hand off to the runner's full-stop
  // preflight (that screen, not this click, spends the shot). No card-level
  // dialog: the one-shot warning IS the preflight (§7's heaviest gate).
  function doBegin(pack: StudentPackCard) {
    startTransition(async () => {
      const r = await beginReadinessAttempt(pack.packId);
      if (r.ok && r.attemptId) {
        router.push(`/session/${r.attemptId}`);
      } else {
        flash(r.error ?? 'Could not open your exam.');
      }
    });
  }

  const hasNothing =
    view.unclaimed === 0 && view.claimed === 0 && view.active === 0 && view.completed === 0;

  return (
    <div className="rs-wrap">
      <Header view={view} hasNothing={hasNothing} />

      {showClaimAll && (
        <div className="rs-claimall">
          <div className="rs-claimall-txt">
            <strong>Claim all {claimablePacks.length} packs at once?</strong> You hold enough
            credits to name every remaining pack in one step.
          </div>
          <button
            type="button"
            className="rs-btn rs-btn-navy"
            disabled={pending}
            onClick={() => setDialog({ kind: 'claimAll' })}
          >
            Claim all {claimablePacks.length}
          </button>
        </div>
      )}

      {view.packs.length === 0 ? (
        <div className="rs-empty">
          <div className="rs-empty-title">Packs are being prepared</div>
          <p>The first readiness packs are being curated — check back soon.</p>
        </div>
      ) : (
        <div className="rs-grid">
          {view.packs.map((p) => (
            <PackCard
              key={p.packId}
              pack={p}
              pending={pending}
              onClaim={() => setDialog({ kind: 'claim', pack: p })}
              onActivate={() => setDialog({ kind: 'activate', pack: p })}
              onBegin={() => doBegin(p)}
              onResume={() => p.resumeAttemptId && router.push(`/session/${p.resumeAttemptId}`)}
              onReport={() =>
                p.reportAttemptId && router.push(`/student/bank/packs/report/${p.reportAttemptId}`)
              }
              onReview={() => p.reportAttemptId && router.push(`/session/${p.reportAttemptId}`)}
            />
          ))}
        </div>
      )}

      {dialog?.kind === 'claim' && (
        <ClaimDialog
          pack={dialog.pack}
          pending={pending}
          onConfirm={() => doClaim(dialog.pack)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'activate' && (
        <ActivateDialog
          pack={dialog.pack}
          pending={pending}
          onConfirm={() => doActivate(dialog.pack)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'claimAll' && (
        <ClaimAllDialog
          count={claimablePacks.length}
          pending={pending}
          onConfirm={doClaimAll}
          onCancel={() => setDialog(null)}
        />
      )}

      {toast && (
        <div className="rs-toast" role="status">
          <span>{toast}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function Header({ view, hasNothing }: { view: StudentReadinessView; hasNothing: boolean }) {
  if (hasNothing) {
    return (
      <header className="rs-head">
        <h1 className="rs-head-title">Readiness Packs</h1>
        <p className="rs-head-sub">
          Full-length, one-shot mock exams that give you a measured verdict on whether you&apos;re
          ready. Each credit becomes one pack.
        </p>
        <a className="rs-btn rs-btn-teal rs-head-cta" href="/readiness">
          Get credits
        </a>
      </header>
    );
  }

  const title =
    view.unclaimed > 0
      ? `You've got ${view.unclaimed} credit${view.unclaimed === 1 ? '' : 's'} — claim your packs`
      : 'Your Readiness Packs';
  const sub =
    view.unclaimed > 0
      ? "Pick which packs to claim below. Claiming names a pack to you — it doesn't start any clock."
      : 'Claim a credit onto a pack, then start its 21-day window when you’re ready to sit it.';

  const chips: { label: string; tone: string }[] = [];
  if (view.unclaimed > 0) chips.push({ label: `${view.unclaimed} unclaimed`, tone: 'navy' });
  if (view.claimed > 0) chips.push({ label: `${view.claimed} claimed`, tone: 'navy' });
  if (view.active > 0) chips.push({ label: `${view.active} window open`, tone: 'teal' });
  if (view.completed > 0) chips.push({ label: `${view.completed} completed`, tone: 'grey' });

  return (
    <header className={`rs-head${view.unclaimed > 0 ? ' rs-head-hot' : ''}`}>
      <h1 className="rs-head-title">{title}</h1>
      <p className="rs-head-sub">{sub}</p>
      {chips.length > 0 && (
        <div className="rs-chips">
          {chips.map((c) => (
            <span key={c.label} className={`rs-chip rs-chip-${c.tone}`}>
              {c.label}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}

function PackCard({
  pack,
  pending,
  onClaim,
  onActivate,
  onBegin,
  onResume,
  onReport,
  onReview,
}: {
  pack: StudentPackCard;
  pending: boolean;
  onClaim: () => void;
  onActivate: () => void;
  onBegin: () => void;
  onResume: () => void;
  onReport: () => void;
  onReview: () => void;
}) {
  const specs = `${pack.n} questions · ${timeStr(pack.timeLimitSec)} · one shot`;

  const pill =
    pack.state === 'CLAIMABLE'
      ? { label: 'Ready to claim', tone: 'teal' }
      : pack.state === 'CLAIMED'
        ? { label: 'Claimed', tone: 'navy' }
        : pack.state === 'ACTIVE'
          ? { label: 'Window open', tone: 'teal' }
          : pack.state === 'SITTING'
            ? { label: 'In progress', tone: 'amber' }
            : pack.state === 'USED'
              ? { label: 'Completed', tone: 'grey' }
              : { label: 'Available', tone: 'grey' };

  return (
    <div className={`rs-card rs-card-${pack.state.toLowerCase()}`}>
      <div className="rs-card-top">
        <div className="rs-card-title">{pack.title}</div>
        <span className={`rs-pill rs-pill-${pill.tone}`}>{pill.label}</span>
      </div>
      <div className="rs-card-specs">{specs}</div>

      {/* Completed sitting → the banked mark + its Readiness band. */}
      {pack.state === 'USED' && <ResultBlock finalScore={pack.finalScore} />}

      {/* The one uniform 21-day window bar — same element from CLAIMED
          (not started) through the running window to review, only the
          label + tone changing. Renders null for the pre-window states. */}
      <WindowBar pack={pack} />

      {pack.state === 'CLAIMED' && (
        <div className="rs-card-note">Start its 21-day window when you&apos;re ready to sit it.</div>
      )}
      {pack.state === 'SITTING' && (
        <div className="rs-card-note rs-card-note-danger">
          Your exam is under way and the clock is still running. Pick up where you left off.
        </div>
      )}
      {pack.state === 'ACTIVE' && pack.daysLeft != null && pack.daysLeft <= 2 && (
        <div className="rs-card-note rs-card-note-danger">
          Your window closes soon — sit it before you lose the shot.
        </div>
      )}
      {pack.lapsed && (
        <div className="rs-card-note rs-card-note-muted">
          A previous window lapsed unused — no questions were seen, so it&apos;s fresh to claim again.
        </div>
      )}

      <div className="rs-card-foot">
        {pack.state === 'CATALOGUE' && (
          <a className="rs-btn rs-btn-teal rs-btn-full" href="/readiness">
            Get credits
          </a>
        )}
        {pack.state === 'CLAIMABLE' && (
          <button type="button" className="rs-btn rs-btn-navy rs-btn-full" disabled={pending} onClick={onClaim}>
            Claim this pack
          </button>
        )}
        {pack.state === 'CLAIMED' && (
          <button type="button" className="rs-btn rs-btn-teal rs-btn-full" disabled={pending} onClick={onActivate}>
            Start my 21 days
          </button>
        )}
        {pack.state === 'ACTIVE' && (
          <button type="button" className="rs-btn rs-btn-navy rs-btn-full" disabled={pending} onClick={onBegin}>
            Begin exam
          </button>
        )}
        {pack.state === 'SITTING' && (
          <button type="button" className="rs-btn rs-btn-navy rs-btn-full" disabled={pending} onClick={onResume}>
            Resume exam
          </button>
        )}
        {pack.state === 'USED' && (
          <div className="rs-card-btns">
            <button type="button" className="rs-btn rs-btn-navy rs-btn-full" disabled={pending} onClick={onReport}>
              See your full report
            </button>
            {pack.reviewOpen && (
              <button type="button" className="rs-btn rs-btn-ghost rs-btn-full" disabled={pending} onClick={onReview}>
                Review answers
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// The completed sitting's banked mark + its Readiness band. The score
// persists forever (unlike the review window), so this stays on the card
// for good once a pack is sat.
function ResultBlock({ finalScore }: { finalScore: number | null }) {
  if (finalScore == null) return null;
  const pct = Math.round(finalScore * 100);
  const band = scoreToBand(finalScore);
  return (
    <div className="rs-result">
      <div className="rs-result-score">{pct}%</div>
      {band && <span className={`rs-band rs-band-${band.tone}`}>{band.label}</span>}
    </div>
  );
}

// The single 21-day window bar, shared across every state where a window
// exists. It's one continuous countdown: activation stamps a deadline and
// the same bar drains from "not started" (CLAIMED) through the running
// window (ACTIVE / SITTING) to answer-review (USED) — only the label and
// tone change. The tone deliberately FLIPS at sitting: before sitting the
// draining bar threatens the whole shot (escalates to red); after sitting
// it only threatens review (stays calm). Pre-window states render nothing.
function WindowBar({ pack }: { pack: StudentPackCard }) {
  const dl = pack.daysLeft;
  const fill = (d: number) => Math.max(4, Math.round((d / 21) * 100));

  let cfg:
    | { tone: string; width: number; num: number | null; label: string }
    | null = null;

  if (pack.state === 'CLAIMED') {
    // No live deadline yet — an illustrative full bar showing the window
    // that's ready to start.
    cfg = { tone: 'idle', width: 100, num: null, label: '21 days · not started' };
  } else if (pack.state === 'ACTIVE' && dl != null) {
    // Time to SIT — losing this loses the shot, so escalate to red.
    const tone = dl > 7 ? 'ok' : dl > 2 ? 'warn' : 'danger';
    cfg = { tone, width: fill(dl), num: dl, label: dl === 1 ? 'day left to sit' : 'days left to sit' };
  } else if (pack.state === 'SITTING' && dl != null) {
    // Mid-exam — the exam's own clock is what matters; keep this muted.
    cfg = { tone: 'idle', width: fill(dl), num: dl, label: dl === 1 ? 'day left' : 'days left' };
  } else if (pack.state === 'USED' && pack.reviewOpen && dl != null) {
    // Score already banked — the countdown only closes REVIEW, so stay calm.
    cfg = { tone: 'ok', width: fill(dl), num: dl, label: dl === 1 ? 'day of review left' : 'days of review left' };
  } else if (pack.state === 'USED' && !pack.reviewOpen) {
    cfg = { tone: 'idle', width: 0, num: null, label: 'Review closed' };
  }

  if (!cfg) return null;

  return (
    <div className="rs-days">
      {cfg.num != null ? (
        <div className={`rs-days-num rs-days-${cfg.tone}`}>
          {cfg.num} <span className="rs-days-unit">{cfg.label}</span>
        </div>
      ) : (
        <div className={`rs-days-label rs-days-${cfg.tone}`}>{cfg.label}</div>
      )}
      <div className="rs-days-bar">
        <div className={`rs-days-fill rs-days-${cfg.tone}`} style={{ width: `${cfg.width}%` }} />
      </div>
    </div>
  );
}

function ClaimDialog({
  pack,
  pending,
  onConfirm,
  onCancel,
}: {
  pack: StudentPackCard;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rs-overlay" onClick={onCancel}>
      <div className="rs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rs-modal-accent rs-modal-accent-teal" />
        <div className="rs-modal-body">
          <h3 className="rs-modal-title">Claim {pack.title}?</h3>
          <p className="rs-modal-p">
            This uses 1 credit and names this pack to you. Claims can&apos;t be swapped to another
            pack later — so if you&apos;re spending limited credits, pick deliberately.
          </p>
          <p className="rs-modal-p">
            It won&apos;t start your 21-day window. You choose when to begin — the clock only starts
            when you activate.
          </p>
          <div className="rs-modal-actions">
            <button type="button" className="rs-btn rs-btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="rs-btn rs-btn-teal" disabled={pending} onClick={onConfirm}>
              {pending ? 'Claiming…' : 'Claim pack'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivateDialog({
  pack,
  pending,
  onConfirm,
  onCancel,
}: {
  pack: StudentPackCard;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rs-overlay" onClick={onCancel}>
      <div className="rs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rs-modal-accent rs-modal-accent-amber" />
        <div className="rs-modal-body">
          <h3 className="rs-modal-title">Start your 21 days on {pack.title}?</h3>
          <p className="rs-modal-p">
            Your 21-day window starts now and can&apos;t be paused. Sit the exam any time within
            those 21 days.
          </p>
          <p className="rs-modal-p">
            If the window closes before you sit, the pack is used up — no reset, no refund. You
            control when to start, so start when you&apos;re ready to sit soon.
          </p>
          <div className="rs-modal-actions">
            <button type="button" className="rs-btn rs-btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="rs-btn rs-btn-navy" disabled={pending} onClick={onConfirm}>
              {pending ? 'Starting…' : 'Start my 21 days'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClaimAllDialog({
  count,
  pending,
  onConfirm,
  onCancel,
}: {
  count: number;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rs-overlay" onClick={onCancel}>
      <div className="rs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rs-modal-accent rs-modal-accent-teal" />
        <div className="rs-modal-body">
          <h3 className="rs-modal-title">Claim all {count} packs?</h3>
          <p className="rs-modal-p">
            This uses {count} credits and names all {count} packs to you at once. Claims can&apos;t be
            swapped afterwards.
          </p>
          <p className="rs-modal-p">
            It won&apos;t start any 21-day window — activate each pack whenever you&apos;re ready to
            sit it.
          </p>
          <div className="rs-modal-actions">
            <button type="button" className="rs-btn rs-btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="rs-btn rs-btn-navy" disabled={pending} onClick={onConfirm}>
              {pending ? 'Claiming…' : `Claim all ${count}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

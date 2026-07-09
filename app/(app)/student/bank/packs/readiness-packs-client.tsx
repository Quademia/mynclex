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
}: {
  pack: StudentPackCard;
  pending: boolean;
  onClaim: () => void;
  onActivate: () => void;
}) {
  const specs = `${pack.n} questions · ${timeStr(pack.timeLimitSec)} · one shot`;

  const pill =
    pack.state === 'CLAIMABLE'
      ? { label: 'Ready to claim', tone: 'teal' }
      : pack.state === 'CLAIMED'
        ? { label: 'Claimed', tone: 'navy' }
        : pack.state === 'ACTIVE'
          ? { label: 'Window open', tone: 'teal' }
          : pack.state === 'USED'
            ? { label: 'Completed', tone: 'grey' }
            : { label: 'Available', tone: 'grey' };

  // Days-left urgency colour for the running window.
  const dl = pack.daysLeft;
  const daysTone = dl == null ? '' : dl > 7 ? 'ok' : dl > 2 ? 'warn' : 'danger';

  return (
    <div className={`rs-card rs-card-${pack.state.toLowerCase()}`}>
      <div className="rs-card-top">
        <div className="rs-card-title">{pack.title}</div>
        <span className={`rs-pill rs-pill-${pill.tone}`}>{pill.label}</span>
      </div>
      <div className="rs-card-specs">{specs}</div>

      {pack.state === 'ACTIVE' && dl != null && (
        <div className="rs-days">
          <div className={`rs-days-num rs-days-${daysTone}`}>
            {dl} <span className="rs-days-unit">{dl === 1 ? 'day left' : 'days left'}</span>
          </div>
          <div className="rs-days-bar">
            <div
              className={`rs-days-fill rs-days-${daysTone}`}
              style={{ width: `${Math.max(4, Math.round((dl / 21) * 100))}%` }}
            />
          </div>
        </div>
      )}

      {pack.state === 'CLAIMED' && (
        <div className="rs-card-note">This pack is yours. Start its 21-day window when you&apos;re ready to sit it.</div>
      )}
      {pack.state === 'ACTIVE' && (
        <div className={`rs-card-note${daysTone === 'danger' ? ' rs-card-note-danger' : ''}`}>
          {daysTone === 'danger'
            ? 'Your window closes soon — sit it before you lose the shot.'
            : 'Sit your one attempt any time before the window closes.'}
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

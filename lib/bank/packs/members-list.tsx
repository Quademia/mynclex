// mynclex/lib/bank/packs/members-list.tsx
//
// The pack detail's "Questions in sat order" panel (②a + ②b), from
// the CD "Readiness Packs Admin" prototype (concept-not-source).
// Standalone rows + case/trend units as tinted collapsible blocks.
// Case blocks are WELDED (move + remove as one — §5 atomicity); trend
// blocks are display-grouping over consecutive rows, so their children
// also get a per-question × (§5, revised 2026-07-07). Each unit's ⊕
// opens the picker in insert-above mode. Printed positions are the
// DENSE index over the ordered members (storage uses spaced
// ordinals — types.ts).

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import {
  movePackUnitAction,
  removePackMemberAction,
  removePackUnitAction,
} from './actions';
import { unitMembers } from './grouping';
import type { PackMember, PackUnit } from './types';

const DIFF_CLASS: Record<string, string> = {
  Easy: 'easy',
  Medium: 'medium',
  Hard: 'hard',
};

export function PackMembersList({
  packId,
  units,
  count,
  target,
  onInsertAbove,
  onAddQuestions,
}: {
  packId: string;
  units: PackUnit[];
  count: number;
  target: number;
  /** Open the picker in insert-above mode (unit's first link + its printed position). */
  onInsertAbove: (linkId: string, pos: number) => void;
  /** Open the picker in append mode (the empty state's CTA). */
  onAddQuestions: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? 'Something went wrong.');
      else router.refresh();
    });
  };

  // Dense printed positions, precomputed (never mutate during render —
  // the RichRenderWithSlots double-invoke lesson): each unit's 1-based
  // [from, to] over the ordered member questions.
  const ranges: { from: number; to: number }[] = [];
  {
    let pos = 0;
    for (const u of units) {
      const len = unitMembers(u).length;
      ranges.push({ from: pos + 1, to: pos + len });
      pos += len;
    }
  }

  return (
    <section className="rp-members">
      <div className="rp-members-head">
        <div className="rp-members-head-top">
          <h3>Questions in sat order</h3>
          <span>{count} / {target}</span>
        </div>
        <p>
          Removing a question keeps it reserved and hidden from students —
          nothing anyone owns is affected, and you can re-add it any time.
        </p>
      </div>

      {units.length === 0 ? (
        <div className="rp-members-empty">
          <div className="rp-members-empty-plus">+</div>
          <div className="rp-members-empty-title">All {target} positions are open</div>
          <p>
            Fill this pack — standalone questions ticked in batches, case
            studies as whole units, and trends question by question.
          </p>
          <button type="button" className="rp-add-btn" onClick={onAddQuestions}>
            + Add questions
          </button>
        </div>
      ) : (
        <div className="rp-members-rows">
          {units.map((u, i) => {
            const first = unitMembers(u)[0];
            const upDis = i === 0 || pending;
            const downDis = i === units.length - 1 || pending;
            const controls = (
              <div className="rp-row-actions">
                <button
                  type="button"
                  title={u.kind === 'q' ? 'Move up' : 'Move unit up'}
                  disabled={upDis}
                  onClick={() => run(() => movePackUnitAction(packId, first.linkId, 'up'))}
                >↑</button>
                <button
                  type="button"
                  title={u.kind === 'q' ? 'Move down' : 'Move unit down'}
                  disabled={downDis}
                  onClick={() => run(() => movePackUnitAction(packId, first.linkId, 'down'))}
                >↓</button>
                <button
                  type="button"
                  className="rp-row-insert"
                  title={
                    u.kind === 'q'
                      ? 'Insert questions above this question'
                      : 'Insert questions above this unit'
                  }
                  disabled={pending}
                  onClick={() => onInsertAbove(first.linkId, ranges[i].from)}
                >+</button>
                <button
                  type="button"
                  className="rp-row-remove"
                  title={
                    u.kind === 'q'
                      ? 'Remove from pack (stays reserved and hidden)'
                      : 'Remove whole unit (stays reserved and hidden)'
                  }
                  disabled={pending}
                  onClick={() => run(() => removePackUnitAction(packId, first.linkId))}
                >×</button>
              </div>
            );

            if (u.kind === 'q') {
              return (
                <div key={first.linkId} className="rp-q-row">
                  <div className="rp-pos">{ranges[i].from}</div>
                  <MemberSummary m={u.member} />
                  {controls}
                </div>
              );
            }

            const { from, to } = ranges[i];
            const isCollapsed = collapsed[u.wrapperId] ?? false;
            return (
              <div key={first.linkId} className={`rp-unit ${u.kind}`}>
                <div className="rp-unit-head">
                  <button
                    type="button"
                    className="rp-unit-chev"
                    title="Expand / collapse"
                    onClick={() =>
                      setCollapsed((c) => ({ ...c, [u.wrapperId]: !isCollapsed }))
                    }
                  >{isCollapsed ? '▸' : '▾'}</button>
                  <div className="rp-pos">{from}–{to}</div>
                  <div className="rp-unit-meta">
                    <div className="rp-row-chips">
                      <span
                        className={`rp-pub-dot ${u.isPublished ? 'pub' : 'unpub'}`}
                        title={u.isPublished ? 'Published' : 'Not yet published'}
                      />
                      <span className={`rp-kind-chip ${u.kind}`}>
                        {u.kind === 'case' ? 'CASE' : 'TREND'}
                      </span>
                      <span className="rp-mono">{u.wrapperId}</span>
                      <span className="rp-dim">
                        {u.members.length} questions · moves as one block
                      </span>
                    </div>
                    <div className="rp-unit-title">{u.title}</div>
                  </div>
                  {controls}
                </div>
                {!isCollapsed && (
                  <div className="rp-unit-children">
                    {u.members.map((m, k) => (
                      <div
                        key={m.linkId}
                        className={`rp-child-row ${u.kind === 'trend' ? 'trend' : ''}`}
                      >
                        <div className="rp-pos">{from + k}</div>
                        <MemberSummary m={m} child />
                        {/* Trend blocks are display-grouping, not welded
                            units (§5) — each question leaves on its own.
                            Case children stay block-remove only. */}
                        {u.kind === 'trend' && (
                          <button
                            type="button"
                            className="rp-child-remove"
                            title="Remove this question (stays reserved and hidden)"
                            disabled={pending}
                            onClick={() => run(() => removePackMemberAction(packId, m.linkId))}
                          >×</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </section>
  );
}

function MemberSummary({ m, child }: { m: PackMember; child?: boolean }) {
  return (
    <div className="rp-row-main">
      <div className="rp-row-chips">
        <span
          className={`rp-pub-dot ${m.isPublished ? 'pub' : 'unpub'}`}
          title={m.isPublished ? 'Published' : 'Not yet published'}
        />
        <span className="rp-mono">{m.itemId}</span>
        <span className="rp-type-chip">{m.questionType}</span>
        {m.difficulty && (
          <span className={`rp-diff ${DIFF_CLASS[m.difficulty] ?? ''}`}>{m.difficulty}</span>
        )}
        {m.category && <span className="rp-dim">{m.category}</span>}
        {child && m.cjmmStep && <span className="rp-cjmm">{m.cjmmStep}</span>}
      </div>
      {m.stemLabel && <div className="rp-stem">{m.stemLabel}</div>}
    </div>
  );
}

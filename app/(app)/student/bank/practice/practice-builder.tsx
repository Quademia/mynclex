// mynclex/app/(app)/student/bank/practice/practice-builder.tsx
//
// The Practice page (Builder). Three sections in the main column +
// sticky summary panel on the right. Wired to nclex_count_eligible_items
// (debounced live count) and nclex_create_attempt (Start click).
//
// 5.1a scope:
//   • Three sections (Pool, Content filters, Intent + Mode)
//   • Sticky summary with live count + breakdown + Start
//   • Smart-link UX (CNC↔Subcategory, Subject↔Body System)
//   • CAT collapse (sections 1+2 + count input)
//   • Stub redirect to /session/[id] on Start
// Deferred to 5.1b/c/d:
//   • Resume banner, Recent Quizzes, Weak-spots quick-start
//   • Mobile accordion + bottom action bar
//   • Per-row counts on individual filter rows
//   • Topic / Subtopic search (placeholder section retained but disabled)

'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import {
  POOLS,
  MODES_STUDY,
  MODES_EXAM,
  DEFAULT_MODE_FOR_INTENT,
  CNC_VALUES,
  SUBCAT_VALUES,
  SUBJECT_VALUES,
  BODY_VALUES,
  QTYPE_OPTIONS,
  DIFFICULTY_VALUES,
  subcatAvailableFor,
  bodyAvailableFor,
  type Intent,
  type ModeId,
  type PoolId,
} from '@/lib/practice/builder/filter-config';
import { buildFilterPayload } from '@/lib/practice/builder/build-filter-payload';
import {
  countEligibleAction,
  createAttemptAction,
  breakdownAction,
} from '@/lib/practice/builder/actions';
import type { BreakdownResult, CountResult, FilterPayload } from '@/lib/practice/builder/types';
import type { FilterOptions } from '@/lib/practice/builder/get-filter-options';
import { parseFilterPayload } from '@/lib/practice/builder/parse-filter-payload';
import type { ResumableAttempt, RecentAttempt } from '@/lib/practice/launchers/types';
import { ResumeBanner } from '@/lib/practice/launchers/resume-banner';
import { RecentQuizzesRow } from '@/lib/practice/launchers/recent-quizzes-row';
import { WeakSpotsButton } from '@/lib/practice/launchers/weak-spots-button';
import { discardAttemptAction } from '@/lib/practice/builder/actions';
import { Axis } from './axis';
import { ModeCard } from './mode-card';
import { SummaryPanel } from './summary-panel';
import { MobileLaunchBar } from './mobile-launch-bar';

// Set helpers — toggle a value, replace the set, etc. Local only.
function toggle<T>(s: Set<T>, v: T): Set<T> {
  const n = new Set(s);
  n.has(v) ? n.delete(v) : n.add(v);
  return n;
}

interface PracticeBuilderProps {
  filterOptions: FilterOptions;
  resumable:    ResumableAttempt | null;
  recents:      RecentAttempt[];
  /** Content-axis filters to pre-seed (e.g. a readiness-report remediation
   *  deep-link, ?subcat=…). Pools stay UNSEEN so practice is fresh questions. */
  initialFilters?: FilterPayload;
}

export function PracticeBuilder({
  filterOptions,
  resumable: initialResumable,
  recents,
  initialFilters,
}: PracticeBuilderProps) {
  const router = useRouter();

  // Pre-seed the content filters from a deep-link (e.g. "practise this
  // category" on the readiness report). Pools are left at the UNSEEN default.
  const seed = parseFilterPayload(initialFilters);
  const hasSeed =
    seed.cnc.size + seed.subcat.size + seed.subject.size + seed.body.size +
    seed.qtype.size + seed.diff.size + seed.tags.size + seed.topic.size +
    seed.subtopic.size > 0;

  // ─── State ────────────────────────────────────────────────────────
  const [pools,   setPools]   = useState<Set<PoolId>>(new Set(['UNSEEN']));
  const [cnc,     setCnc]     = useState<Set<string>>(seed.cnc);
  const [subcat,  setSubcat]  = useState<Set<string>>(seed.subcat);
  const [subject, setSubject] = useState<Set<string>>(seed.subject);
  const [body,    setBody]    = useState<Set<string>>(seed.body);
  const [qtype,   setQtype]   = useState<Set<string>>(seed.qtype);
  const [diff,    setDiff]    = useState<Set<string>>(seed.diff);
  const [tags,     setTags]     = useState<Set<string>>(seed.tags);
  const [topic,    setTopic]    = useState<Set<string>>(seed.topic);
  const [subtopic, setSubtopic] = useState<Set<string>>(seed.subtopic);
  // topicQuery is currently unused — placeholder for the search-as-you-
  // type chip-cloud variant (deferred; plain checkbox grid for now).
  const [topicQuery] = useState<string>('');

  const [intent, setIntent] = useState<Intent>('STUDY');
  const [mode,   setMode]   = useState<ModeId>('UNTIMED_LEARNING');
  const [count,  setCount]  = useState<number>(25);

  // Tab strip — Intent+Mode vs Filters. Default tab is the higher-
  // level decision (Intent+Mode) so the student doesn't fill out
  // filters and then discover their mode (e.g. CAT) doesn't use them.
  const [activeTab, setActiveTab] = useState<'mode' | 'filters'>(hasSeed ? 'filters' : 'mode');

  // Entry-helper local state. Resumable can be cleared client-side
  // when the student clicks Start fresh (the discard RPC fires and we
  // hide the banner without a full SSR re-render). Recents are
  // SSR-only — we don't refetch in the lifetime of this page.
  const [resumable, setResumable] = useState<ResumableAttempt | null>(initialResumable);
  const [discardingResume, startDiscardResume] = useTransition();
  const [weakStarting, startWeakSpots] = useTransition();

  // Live-count + start state
  const [countResult, setCountResult] = useState<CountResult | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [breakdown, setBreakdown] = useState<BreakdownResult | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [starting, startTransition] = useTransition();

  const isCAT = mode === 'CAT';

  // ─── Derived: filters payload ────────────────────────────────────
  const filters = useMemo(
    () => buildFilterPayload({
      pools, cnc, subcat, subject, body, qtype, diff, tags, topic, subtopic, topicQuery,
      intent, mode, count,
    }),
    [pools, cnc, subcat, subject, body, qtype, diff, tags, topic, subtopic, topicQuery, intent, mode, count]
  );

  // ─── Live count fetch — debounced 150ms after the filters settle ─
  // CAT skips the call entirely (doesn't filter the bank).
  const filtersKey = JSON.stringify(filters);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (isCAT) {
      // Show a static count tile in CAT mode — bank size is fixed-ish
      // and not filterable. Breakdown also irrelevant; clear it so
      // axis row counts disappear when the form collapses.
      setCountResult({ total: 0, by_question_type: {} });
      setBreakdown(null);
      setCountLoading(false);
      return;
    }
    const myReq = ++reqIdRef.current;
    setCountLoading(true);
    const t = window.setTimeout(async () => {
      // Fire count + breakdown in parallel — same filter set, no point
      // serialising. Ignore results from any superseded request.
      const [cnt, brk] = await Promise.all([
        countEligibleAction(filters),
        breakdownAction(filters),
      ]);
      if (myReq !== reqIdRef.current) return;
      if (cnt.ok) {
        setCountResult(cnt.data);
      } else {
        setError(cnt.error);
      }
      if (brk.ok) {
        setBreakdown(brk.data);
      } else {
        // Don't surface breakdown errors as toasts — degrade silently
        // (rows just don't show counts). Keeps the page usable if the
        // breakdown RPC is slow or temporarily failing.
        setBreakdown(null);
      }
      setCountLoading(false);
    }, 150);
    return () => window.clearTimeout(t);
  }, [filtersKey, isCAT]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = countResult?.total ?? 0;
  const capped = !isCAT && count > total && total > 0;

  // ─── Pool toggle (with the special "ALL" rule) ───────────────────
  const togglePool = (id: PoolId) =>
    setPools((s) => {
      if (id === 'ALL') {
        return s.has('ALL')
          ? new Set<PoolId>()
          : new Set<PoolId>(['UNSEEN', 'SEEN', 'CORRECT', 'INCORRECT', 'MARKED', 'ALL']);
      }
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      n.delete('ALL'); // any individual chip toggle clears the All shortcut
      return n;
    });

  // ─── Intent change: re-default mode if current isn't valid ───────
  const changeIntent = (next: Intent) => {
    setIntent(next);
    const list = next === 'STUDY' ? MODES_STUDY : MODES_EXAM;
    if (!list.find((m) => m.id === mode)) {
      setMode(DEFAULT_MODE_FOR_INTENT[next]);
    }
  };

  // ─── Disabled-Start logic ────────────────────────────────────────
  let disabledReason: string | null = null;
  if (pools.size === 0 && !isCAT) {
    disabledReason = 'Pick at least one pool to draw from.';
  } else if (!isCAT && countLoading) {
    disabledReason = null; // don't block on loading; the button auto-rechecks
  } else if (!isCAT && total === 0) {
    disabledReason = 'No questions match these filters. Loosen your filters.';
  } else if (!isCAT && total < count - 3) {
    disabledReason = `Only ${total} questions available. Reduce count or loosen filters.`;
  }

  // ─── Recap rows ──────────────────────────────────────────────────
  const recap = useMemo(() => {
    if (isCAT) {
      return [
        { label: 'Source', value: 'Full bank' },
        { label: 'Mode',   value: 'CAT (adaptive)' },
        { label: 'Intent', value: 'Exam' },
      ];
    }
    const poolLabel =
      pools.has('ALL')
        ? 'All'
        : pools.size === 0
          ? 'No pool picked'
          : [...pools].map((p) => POOLS.find((x) => x.id === p)?.label ?? p).join(' · ');
    const subjLabel =
      subject.size === 0 ? 'Any' : [...subject].join(', ');
    const diffLabel =
      diff.size === 0 || diff.size === DIFFICULTY_VALUES.length
        ? 'Any'
        : [...diff].join(', ');
    const modeList = intent === 'STUDY' ? MODES_STUDY : MODES_EXAM;
    const modeLbl = modeList.find((m) => m.id === mode)?.label ?? '—';
    return [
      { label: 'Pool',       value: poolLabel,  muted: pools.size === 0 },
      { label: 'Subjects',   value: subjLabel,  muted: subject.size === 0 },
      { label: 'Difficulty', value: diffLabel,  muted: diff.size === 0 || diff.size === DIFFICULTY_VALUES.length },
      { label: 'Mode',       value: (intent === 'STUDY' ? 'Study · ' : 'Exam · ') + modeLbl },
    ];
  }, [isCAT, pools, subject, diff, intent, mode]);

  // ─── Breakdown preview node ───────────────────────────────────────
  // Use the by_question_type the backend returned. Top 5 by count.
  // Note the variable name — `breakdownPreview` is the JSX node for
  // the summary panel; `breakdown` (above) is the BreakdownResult
  // object with per-axis row counts.
  const breakdownPreview = useMemo(() => {
    if (isCAT || !countResult) return null;
    const entries = Object.entries(countResult.by_question_type)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (entries.length === 0) return null;
    // Scale to the requested count proportionally
    const totalActual = entries.reduce((a, [, n]) => a + n, 0) || 1;
    const scaled = entries.map(([k, n]) => ({
      key: k,
      n: Math.max(1, Math.round((n / totalActual) * count)),
    }));
    return (
      <div>
        {scaled.map((it, i) => {
          const lbl = QTYPE_OPTIONS.find((q) => q.id === it.key)?.label ?? it.key;
          return (
            <span key={it.key}>
              {i > 0 ? ' · ' : ''}
              <b>{it.n}</b> {lbl}
            </span>
          );
        })}
      </div>
    );
  }, [isCAT, countResult, count]);

  // ─── Start handler ───────────────────────────────────────────────
  const onStart = () => {
    if (disabledReason) return;

    // CAT hands off — it does not launch here (§10.7.1). Exactly one place
    // may spend a CAT, and that is the CAT preflight; a second launcher
    // would need its own full-stop warning, allowance guard and
    // idempotency, and the failure mode of the two drifting is a student
    // burning a 4-hour one-shot through whichever path forgot a gate.
    //
    // What this replaces was worse than a duplicate launcher. It called
    // createAttemptAction with mode='CAT' and a hardcoded count of 75 —
    // the BUILDER's RPC, not the CAT one — producing an ordinary attempt
    // with 75 pre-snapshotted items and none of the engine state. The
    // runner would then see mode === 'CAT' and try to play adaptive turns
    // against it. Nothing about that was a CAT.
    if (isCAT) {
      router.push('/student/bank/cat');
      return;
    }

    startTransition(async () => {
      const res = await createAttemptAction({
        filters,
        mode,
        intent,
        count,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/session/${res.data.attemptId}`);
    });
  };

  // ─── Entry-helper handlers ───────────────────────────────────────
  const onResumeClick = () => {
    if (!resumable) return;
    router.push(`/session/${resumable.attempt_id}`);
  };

  const onStartFresh = () => {
    if (!resumable) return;
    const targetId = resumable.attempt_id;
    startDiscardResume(async () => {
      const res = await discardAttemptAction(targetId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResumable(null); // hide the banner client-side; SSR will agree on next nav
    });
  };

  const onRecentSelect = (rec: RecentAttempt) => {
    // Restore the saved configuration into the form. Sets are
    // reconstructed from the saved filters_json (lossy on the
    // 'All' chip — see parse-filter-payload.ts).
    const parsed = parseFilterPayload(rec.filters_json);
    setPools(parsed.pools);
    setCnc(parsed.cnc);
    setSubcat(parsed.subcat);
    setSubject(parsed.subject);
    setBody(parsed.body);
    setQtype(parsed.qtype);
    setDiff(parsed.diff);
    setTags(parsed.tags);
    setTopic(parsed.topic);
    setSubtopic(parsed.subtopic);
    setIntent(rec.intent);
    setMode(rec.mode);
    setCount(rec.requested_count);
    // Switch to the Filters tab so the student sees what was
    // restored. They can tweak then Start, or Start straight away.
    setActiveTab('filters');
  };

  const onWeakSpots = () => {
    // v1 weak-spots heuristic: items the student last got wrong.
    // 25 Q, Study + Untimed Learning, no other filters. When real
    // analytics ship in slice 7.x this gets replaced with a smarter
    // selector (e.g. lowest-accuracy slice, recent regression).
    const weakFilters: FilterPayload = { pool_history: ['INCORRECT'] };
    startWeakSpots(async () => {
      const res = await createAttemptAction({
        filters: weakFilters,
        mode: 'UNTIMED_LEARNING',
        intent: 'STUDY',
        count: 25,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/session/${res.data.attemptId}`);
    });
  };

  const modeList = intent === 'STUDY' ? MODES_STUDY : MODES_EXAM;
  const modeLabel = modeList.find((m) => m.id === mode)?.label ?? '—';

  const anyContentSelected =
    cnc.size + subcat.size + subject.size + body.size +
    qtype.size + diff.size + tags.size + topic.size + subtopic.size > 0;

  return (
    <div className="bk-builder">
      <ErrorToast error={error} onDismiss={() => setError(null)} />

      <div className="bk-builder-head">
        <h1>Build a practice quiz</h1>
        {/* "on the right" was true of the desktop rail only — on a phone
            the summary sits at the end of the form and the live count
            rides in the launch strip, so the direction pointed at
            nothing. Stated without a direction, it is true of both. */}
        <div className="sub">
          Pick what you’re practising and how. The count updates as you go.
        </div>
      </div>

      <div className="bk-grid">
        <div className="bk-stack">
          {/* Entry helpers — Resume banner, Recent Quizzes shortcut,
              Weak Spots one-tap. All sit above the tab strip and only
              render when relevant (Resume hides when there's no
              unfinished STUDY attempt; Recents hides when the student
              has no quiz history). */}
          {resumable && (
            <ResumeBanner
              attempt={resumable}
              onResume={onResumeClick}
              onStartFresh={onStartFresh}
              pending={discardingResume}
            />
          )}
          <RecentQuizzesRow recents={recents} onSelect={onRecentSelect} />
          <WeakSpotsButton onTrigger={onWeakSpots} pending={weakStarting} />

          {/* Tab strip — switches between Intent & Mode and Filters.
              The right-rail summary stays mounted across both tabs. */}
          <div className="bk-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'mode'}
              className={'bk-tab' + (activeTab === 'mode' ? ' on' : '')}
              onClick={() => setActiveTab('mode')}
            >
              Intent &amp; Mode
              <span className="bk-tab-meta">
                {(intent === 'STUDY' ? MODES_STUDY : MODES_EXAM).find((m) => m.id === mode)?.label ?? ''}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'filters'}
              className={'bk-tab' + (activeTab === 'filters' ? ' on' : '')}
              onClick={() => setActiveTab('filters')}
            >
              Filters
              <span className="bk-tab-meta">
                {isCAT ? "doesn't apply in CAT" : (anyContentSelected || pools.size > 0 ? 'configured' : 'any')}
              </span>
            </button>
          </div>

          {/* ─── FILTERS TAB — Pool section ─── */}
          {activeTab === 'filters' && (
          <section className="bk-section">
            <div className="bk-section-head">
              <div>
                <div className="bk-section-title">Question pool</div>
                <div className="bk-section-sub">
                  Pick the slice of your history to draw from. Combinable — overlap is intentional.
                </div>
              </div>
            </div>
            <div className="bk-section-body">
              {isCAT ? (
                <CollapsedNote>
                  <strong>CAT pulls from the full bank to simulate the real exam.</strong>
                  Pool filters don’t apply.
                </CollapsedNote>
              ) : (
                <div className="bk-pools">
                  {POOLS.map((p) => {
                    const active = pools.has(p.id);
                    const cnt = breakdown?.by_pool?.[p.id];
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={'bk-pool' + (active ? ' on' : '')}
                        onClick={() => togglePool(p.id)}
                      >
                        <div className="bk-pool-row1">
                          <span className="bk-pool-check">
                            {active && (
                              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 8l3 3 7-8" />
                              </svg>
                            )}
                          </span>
                          {p.label}
                        </div>
                        <div className="bk-pool-sub">
                          {p.sub}
                          {cnt !== undefined && (
                            <> · <strong style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{cnt.toLocaleString()}</strong> available</>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
          )}

          {/* ─── FILTERS TAB — Content filters section ─── */}
          {activeTab === 'filters' && (
          <section className="bk-section">
            <div className="bk-section-head">
              <div>
                <div className="bk-section-title">Content filters</div>
                <div className="bk-section-sub">
                  Within an axis: <em>or</em> · across axes: <em>and</em>. Leave an axis empty for &ldquo;any&rdquo;.
                </div>
              </div>
              {anyContentSelected && !isCAT && (
                <button
                  type="button"
                  className="bk-section-clear"
                  onClick={() => {
                    setCnc(new Set()); setSubcat(new Set()); setSubject(new Set()); setBody(new Set());
                    setQtype(new Set()); setDiff(new Set()); setTags(new Set());
                    setTopic(new Set()); setSubtopic(new Set());
                  }}
                >
                  Clear all filters
                </button>
              )}
            </div>
            <div className="bk-section-body" style={{ paddingTop: 0 }}>
              {isCAT ? (
                <CollapsedNote>
                  <strong>Filters don’t apply in CAT.</strong>
                  The IRT engine selects every question by your live ability estimate to simulate the real NCLEX.
                </CollapsedNote>
              ) : (
                <>
                  <Axis
                    name="Client Needs Category"
                    items={CNC_VALUES.map((v) => ({ id: v, label: v }))}
                    selected={cnc}
                    onToggle={(id) => setCnc((s) => toggle(s, id))}
                    onCheckAll={(on) => setCnc(new Set(on ? CNC_VALUES : []))}
                    counts={breakdown?.by_cnc}
                  />
                  <Axis
                    name="Subcategory"
                    items={SUBCAT_VALUES.map((v) => ({ id: v, label: v }))}
                    selected={subcat}
                    onToggle={(id) => setSubcat((s) => toggle(s, id))}
                    onCheckAll={(on) =>
                      setSubcat(new Set(on ? SUBCAT_VALUES.filter((s) => subcatAvailableFor(s, cnc)) : []))
                    }
                    linkedTo={(id) => subcatAvailableFor(id, cnc)}
                    hint={cnc.size > 0 ? 'linked to Client Needs' : undefined}
                    indent
                    counts={breakdown?.by_subcat}
                  />
                  <Axis
                    name="Subject"
                    items={SUBJECT_VALUES.map((v) => ({ id: v, label: v }))}
                    selected={subject}
                    onToggle={(id) => setSubject((s) => toggle(s, id))}
                    onCheckAll={(on) => setSubject(new Set(on ? SUBJECT_VALUES : []))}
                    counts={breakdown?.by_subject}
                  />
                  <Axis
                    name="Body System"
                    items={BODY_VALUES.map((v) => ({ id: v, label: v }))}
                    selected={body}
                    onToggle={(id) => setBody((s) => toggle(s, id))}
                    onCheckAll={(on) =>
                      setBody(new Set(on ? BODY_VALUES.filter((b) => bodyAvailableFor(b, subject)) : []))
                    }
                    linkedTo={(id) => bodyAvailableFor(id, subject)}
                    hint={subject.size > 0 ? 'linked to Subject' : undefined}
                    indent
                    counts={breakdown?.by_body}
                  />
                  <Axis
                    name="Question Type"
                    items={QTYPE_OPTIONS}
                    selected={qtype}
                    onToggle={(id) => setQtype((s) => toggle(s, id))}
                    onCheckAll={(on) => setQtype(new Set(on ? QTYPE_OPTIONS.map((q) => q.id) : []))}
                    defaultOpen={false}
                    counts={breakdown?.by_qtype}
                  />
                  <Axis
                    name="Difficulty"
                    items={DIFFICULTY_VALUES.map((v) => ({ id: v, label: v }))}
                    selected={diff}
                    onToggle={(id) => setDiff((s) => toggle(s, id))}
                    onCheckAll={(on) => setDiff(new Set(on ? DIFFICULTY_VALUES : []))}
                    counts={breakdown?.by_diff}
                  />
                  {/* Tags — curator-driven; default closed since the list
                      can grow long once the bank fills up. */}
                  {filterOptions.tags.length > 0 && (
                    <Axis
                      name="Tags"
                      items={filterOptions.tags.map((v) => ({ id: v, label: v }))}
                      selected={tags}
                      onToggle={(id) => setTags((s) => toggle(s, id))}
                      onCheckAll={(on) =>
                        setTags(new Set(on ? filterOptions.tags : []))
                      }
                      defaultOpen={false}
                      counts={breakdown?.by_tag}
                    />
                  )}
                  {/* Topic and Subtopic — independent axes (no enforced
                      parent-child link in the schema). Default closed. */}
                  {filterOptions.topics.length > 0 && (
                    <Axis
                      name="Topic"
                      items={filterOptions.topics.map((v) => ({ id: v, label: v }))}
                      selected={topic}
                      onToggle={(id) => setTopic((s) => toggle(s, id))}
                      onCheckAll={(on) =>
                        setTopic(new Set(on ? filterOptions.topics : []))
                      }
                      defaultOpen={false}
                      counts={breakdown?.by_topic}
                    />
                  )}
                  {filterOptions.subtopics.length > 0 && (
                    <Axis
                      name="Subtopic"
                      items={filterOptions.subtopics.map((v) => ({ id: v, label: v }))}
                      selected={subtopic}
                      onToggle={(id) => setSubtopic((s) => toggle(s, id))}
                      onCheckAll={(on) =>
                        setSubtopic(new Set(on ? filterOptions.subtopics : []))
                      }
                      defaultOpen={false}
                      counts={breakdown?.by_subtopic}
                    />
                  )}
                </>
              )}
            </div>
          </section>
          )}

          {/* ─── MODE TAB — Intent + Mode section ─── */}
          {activeTab === 'mode' && (
          <section className="bk-section">
            <div className="bk-section-head">
              <div>
                <div className="bk-section-title">Intent &amp; mode</div>
                <div className="bk-section-sub">
                  Pick the frame first — it changes which modes are available and how the runner behaves.
                </div>
              </div>
            </div>
            <div className="bk-section-body">
              {/* Intent step */}
              <div className="bk-substep-head">
                <span className="bk-substep-name">Intent</span>
                <span className="bk-substep-help">Are you learning, or simulating the test?</span>
              </div>
              <div className="bk-intent-grid">
                <button
                  type="button"
                  className={'bk-intent' + (intent === 'STUDY' ? ' on' : '')}
                  onClick={() => changeIntent('STUDY')}
                >
                  <span className="bk-intent-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 4h7a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2zM22 4h-7a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h8z" />
                    </svg>
                  </span>
                  <div className="bk-intent-name">Study</div>
                  <div className="bk-intent-desc">
                    Learn at your own pace. Pause and resume. Engagement-clock if timed.
                  </div>
                </button>
                <button
                  type="button"
                  className={'bk-intent' + (intent === 'EXAM' ? ' on' : '')}
                  onClick={() => changeIntent('EXAM')}
                >
                  <span className="bk-intent-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="13" r="8" />
                      <path d="M12 9v4l2.5 2.5M9 2h6" />
                    </svg>
                  </span>
                  <div className="bk-intent-name">Exam</div>
                  <div className="bk-intent-desc">
                    Single sitting. Wall-clock if timed. Cannot be paused — simulates the real test.
                  </div>
                </button>
              </div>

              {/* Mode step */}
              <div className="bk-mode-divider">
                <div className="bk-substep-head">
                  <span className="bk-substep-name">Mode</span>
                  <span className="bk-substep-help">How the runner behaves — clock, feedback, navigation.</span>
                  <span className={'bk-mode-context ' + (intent === 'STUDY' ? 'study' : 'exam')}>
                    {intent === 'STUDY' ? 'Study modes' : 'Exam modes'}
                  </span>
                </div>
                <div className="bk-mode-grid">
                  {modeList.map((m) => (
                    <ModeCard
                      key={m.id}
                      mode={m}
                      active={mode === m.id}
                      onClick={() => setMode(m.id)}
                    />
                  ))}
                </div>
                {intent === 'STUDY' && (
                  <div className="bk-mode-info">
                    <InfoIcon /> CAT is exam-only — its IRT model needs the continuous engagement of a single sitting.
                  </div>
                )}
              </div>
            </div>
          </section>
          )}
        </div>

        {/* ─── Right rail ─── */}
        <SummaryPanel
          total={isCAT ? null : total}
          loading={countLoading}
          count={count}
          setCount={setCount}
          intent={intent}
          modeLabel={modeLabel}
          isCAT={isCAT}
          recap={recap}
          breakdown={breakdownPreview}
          capped={capped}
          disabledReason={disabledReason}
          starting={starting}
          onStart={onStart}
        />
      </div>

      {/* Phone-only (≤768px, hidden by CSS above it). Outside .bk-grid
          because it is fixed-position furniture, not a column. */}
      <MobileLaunchBar
        total={isCAT ? null : total}
        loading={countLoading}
        intent={intent}
        modeLabel={modeLabel}
        isCAT={isCAT}
        disabledReason={disabledReason}
        starting={starting}
        onStart={onStart}
      />
    </div>
  );
}

function CollapsedNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="bk-collapsed">
      <span style={{ flexShrink: 0, marginTop: 2 }}>
        <InfoIcon />
      </span>
      <div>{children}</div>
    </div>
  );
}

function InfoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-faint)' }}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 8h.01M11 12h1v5h1" />
    </svg>
  );
}

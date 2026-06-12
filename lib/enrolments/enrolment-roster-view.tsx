// mynclex/lib/enrolments/enrolment-roster-view.tsx
//
// Enrolment roster surface (Slice 1b + Slice 4 rework to the CD design
// at docs/product-plan/design-handoff/payments-and-enrolment/
// prototypes/tutor-cohort-workspace.html). Scope-driven: mounts on a
// tutor-led COHORT (the cohort Enrolments tab) or a SELF_PACED
// PROGRAMME (the programme Enrolments tab) — same table, same lifecycle
// actions, same Add-student.
//
// Cohort scope keeps two sub-tabs: Roster (the enrolled/lifecycle table,
// with status filter chips + search) and Waitlist (student-initiated
// off-platform leads, Convert → enrolment / Dismiss). Programme scope is
// roster-only — waitlists and PENDING_APPROVAL are cohort concepts
// (self-paced rows are created already ENROLLED; its leads live in the
// sibling Enquiries tab), so its summary swaps those cells for
// Overdue / Expired.

'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addSelfPacedStudentAction,
  addStudentAction,
  approveEnrolmentAction,
  cancelEnrolmentAction,
  convertWaitlistEntryAction,
  dismissWaitlistEntryAction,
  giveMoreTimeAction,
  markInstallmentPaidAction,
  pauseEnrolmentAction,
  rejectEnrolmentAction,
  resumeEnrolmentAction,
  type TransitionResult,
} from './actions';
import { initials, relativeTime } from './format';
import { describePlan, formatMoney, planLabel } from '@/lib/strategies/format';
import type { Currency } from '@/lib/payments/types';
import type { PaymentStrategy } from '@/lib/strategies/types';
import {
  actionsForStatus,
  ENROLMENT_ACTION_META,
  ENROLMENT_SOURCE_LABEL,
  ENROLMENT_STATUS_META,
  PREFERRED_CONTACT_LABEL,
  type EnrolmentAction,
  type EnrolmentRosterRow,
  type EnrolmentStatus,
  type RosterScope,
  type WaitlistEntry,
} from './types';

interface EnrolmentRosterViewProps {
  scope: RosterScope;
  /** Sub-heading under "Students" — the cohort name or programme title. */
  contextName: string;
  roster: EnrolmentRosterRow[];
  /** Cohort scope only; programme scope omits it (self-paced has no waitlist). */
  waitlist?: WaitlistEntry[];
  /** The programme's active payment plans, for the Add Student plan picker
   *  (add-with-plan, 2026-06-12). Empty = picker hidden. */
  plans?: PaymentStrategy[];
  currency?: Currency;
}

const ACTION_PAST_TENSE: Record<EnrolmentAction, string> = {
  approve: 'Approved',
  reject: 'Rejected',
  pause: 'Paused',
  resume: 'Resumed',
  cancel: 'Cancelled',
};

function formatDueShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Order the status filter chips follow when present in the roster.
const STATUS_ORDER: EnrolmentStatus[] = [
  'PENDING_APPROVAL',
  'ENROLLED',
  'PAUSED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
];

type Tab = 'roster' | 'waitlist';
type StatusFilter = EnrolmentStatus | 'ALL';

export function EnrolmentRosterView({
  scope,
  contextName,
  roster,
  waitlist = [],
  plans = [],
  currency = 'GHS',
}: EnrolmentRosterViewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isCohort = scope.kind === 'COHORT';

  const [tab, setTab] = useState<Tab>(
    // Land on Waitlist when there are leads waiting and no roster yet —
    // the action items come first. Otherwise default to Roster.
    // (Programme scope has no waitlist, so this always lands on Roster.)
    waitlist.length > 0 && roster.length === 0 ? 'waitlist' : 'roster',
  );

  const [addOpen, setAddOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    action: EnrolmentAction;
    row: EnrolmentRosterRow;
  } | null>(null);
  const [markPaidRow, setMarkPaidRow] = useState<EnrolmentRosterRow | null>(null);
  const [giveTimeRow, setGiveTimeRow] = useState<EnrolmentRosterRow | null>(null);

  const [wlBusyId, setWlBusyId] = useState<string | null>(null);
  const [wlConvert, setWlConvert] = useState<WaitlistEntry | null>(null);
  const [wlDismiss, setWlDismiss] = useState<WaitlistEntry | null>(null);

  // Roster filtering.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');

  const counts = useMemo(() => {
    const c: Record<EnrolmentStatus, number> = {
      PENDING_APPROVAL: 0,
      ENROLLED: 0,
      PAUSED: 0,
      REJECTED: 0,
      CANCELLED: 0,
      EXPIRED: 0,
    };
    for (const r of roster) c[r.status] += 1;
    return c;
  }, [roster]);

  const visibleRoster = useMemo(() => {
    const q = search.trim().toLowerCase();
    return roster.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (q && !`${r.name} ${r.email}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [roster, statusFilter, search]);

  function leadName(entry: WaitlistEntry) {
    return `${entry.forename} ${entry.surname}`.trim();
  }

  const ACTION_FN: Record<
    EnrolmentAction,
    (scope: RosterScope, enrolmentId: string, note?: string) => Promise<TransitionResult>
  > = {
    approve: approveEnrolmentAction,
    reject: rejectEnrolmentAction,
    pause: pauseEnrolmentAction,
    resume: resumeEnrolmentAction,
    cancel: cancelEnrolmentAction,
  };

  function runAction(action: EnrolmentAction, row: EnrolmentRosterRow, note?: string) {
    setBusyId(row.enrolment_id);
    startTransition(async () => {
      const res = await ACTION_FN[action](scope, row.enrolment_id, note);
      setBusyId(null);
      setConfirm(null);
      if (!res.ok) {
        setToast({ tone: 'error', message: res.error });
        return;
      }
      setToast({ tone: 'success', message: `${ACTION_PAST_TENSE[action]} ${row.name}.` });
      router.refresh();
    });
  }

  function onActionClick(action: EnrolmentAction, row: EnrolmentRosterRow) {
    if (ENROLMENT_ACTION_META[action].confirm) setConfirm({ action, row });
    else runAction(action, row);
  }

  function runMarkPaid(row: EnrolmentRosterRow) {
    setBusyId(row.enrolment_id);
    startTransition(async () => {
      const res = await markInstallmentPaidAction(scope, row.enrolment_id);
      setBusyId(null);
      setMarkPaidRow(null);
      if (!res.ok) {
        setToast({ tone: 'error', message: res.error });
        return;
      }
      setToast({ tone: 'success', message: `Recorded an off-platform payment for ${row.name}.` });
      router.refresh();
    });
  }

  function runGiveTime(row: EnrolmentRosterRow, days: number) {
    setBusyId(row.enrolment_id);
    startTransition(async () => {
      const res = await giveMoreTimeAction(scope, row.enrolment_id, days);
      setBusyId(null);
      setGiveTimeRow(null);
      if (!res.ok) {
        setToast({ tone: 'error', message: res.error });
        return;
      }
      setToast({ tone: 'success', message: `Gave ${row.name} ${days} more day${days === 1 ? '' : 's'}.` });
      router.refresh();
    });
  }

  function openAdd() {
    setFormError(null);
    setAddOpen(true);
  }
  function closeAdd() {
    if (pending) return;
    setAddOpen(false);
    setFormError(null);
  }

  function handleSubmit(formData: FormData) {
    setFormError(null);
    startTransition(async () => {
      const res =
        scope.kind === 'COHORT'
          ? await addStudentAction(scope.cohortId, formData)
          : await addSelfPacedStudentAction(scope.programmeId, formData);
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      setAddOpen(false);
      setToast({
        tone: 'success',
        message: res.invited
          ? `Invited ${res.name} — they'll get an email to set up their account.`
          : `Enrolled ${res.name} (existing MyNclex account).`,
      });
      router.refresh();
    });
  }

  function runConvert(entry: WaitlistEntry) {
    if (scope.kind !== 'COHORT') return; // waitlists are cohort-only
    setWlBusyId(entry.waitlist_id);
    startTransition(async () => {
      const res = await convertWaitlistEntryAction(scope.cohortId, entry.waitlist_id);
      setWlBusyId(null);
      setWlConvert(null);
      if (!res.ok) {
        setToast({ tone: 'error', message: res.error });
        return;
      }
      setToast({
        tone: 'success',
        message: res.invited
          ? `Enrolled ${res.name} — invite sent to set up their account.`
          : `Enrolled ${res.name} (existing MyNclex account).`,
      });
      router.refresh();
    });
  }

  function runDismiss(entry: WaitlistEntry) {
    if (scope.kind !== 'COHORT') return; // waitlists are cohort-only
    setWlBusyId(entry.waitlist_id);
    startTransition(async () => {
      const res = await dismissWaitlistEntryAction(scope.cohortId, entry.waitlist_id);
      setWlBusyId(null);
      setWlDismiss(null);
      if (!res.ok) {
        setToast({ tone: 'error', message: res.error });
        return;
      }
      setToast({ tone: 'success', message: `Dismissed ${leadName(entry)}'s request.` });
      router.refresh();
    });
  }

  const hasStudents = roster.length > 0;
  const activeChips: StatusFilter[] = [
    'ALL',
    ...STATUS_ORDER.filter((s) => counts[s] > 0),
  ];
  // Programme-scope summary swaps the cohort-only cells (Pending
  // approval / Waitlist) for the states a self-paced roster actually
  // produces. Overdue = behind on an installment, paused or not yet.
  const overdueCount = roster.filter((r) => r.nextPayment?.isOverdue).length;

  return (
    <div className="cw-page">
      <header className="cw-header">
        <div className="cw-header-titles">
          <h1 className="cw-title">Students</h1>
          <p className="cw-sub">{contextName}</p>
        </div>
        <button
          type="button"
          className="enrol-btn enrol-btn-primary"
          onClick={openAdd}
          disabled={pending}
        >
          + Add student
        </button>
      </header>

      <div className="cw-summary">
        <SummaryCell k="Enrolled" v={counts.ENROLLED} sub="Active access" />
        {isCohort ? (
          <>
            <SummaryCell
              k="Pending approval"
              v={counts.PENDING_APPROVAL}
              sub="Awaiting your decision"
            />
            <SummaryCell k="Waitlist" v={waitlist.length} sub="Off-platform leads" />
            <SummaryCell k="Paused" v={counts.PAUSED} sub="Access on hold" />
          </>
        ) : (
          <>
            <SummaryCell k="Paused" v={counts.PAUSED} sub="Access on hold" />
            <SummaryCell k="Overdue" v={overdueCount} sub="Behind on payment" />
            <SummaryCell k="Expired" v={counts.EXPIRED} sub="Window ended" />
          </>
        )}
      </div>

      {isCohort && (
        <nav className="cw-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'roster'}
            className={`cw-tab ${tab === 'roster' ? 'on' : ''}`}
            onClick={() => setTab('roster')}
          >
            Roster <span className="cw-tab-count">{roster.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'waitlist'}
            className={`cw-tab ${tab === 'waitlist' ? 'on' : ''}`}
            onClick={() => setTab('waitlist')}
          >
            Waitlist
            {waitlist.length > 0 && (
              <span className="cw-tab-count warn">{waitlist.length}</span>
            )}
          </button>
        </nav>
      )}

      {tab === 'roster' || !isCohort ? (
        !hasStudents ? (
          <div className="enrol-empty">
            <h2 className="enrol-empty-title">No students enrolled yet.</h2>
            <p className="enrol-empty-sub">
              {isCohort ? (
                <>
                  Add a student you&apos;re bringing in off-platform — type
                  their name and email and they&apos;ll be enrolled right
                  away. Or convert a request from the Waitlist tab.
                </>
              ) : (
                <>
                  Add a student you&apos;re bringing in off-platform — type
                  their name and email and they&apos;ll be enrolled right
                  away. Students who buy the programme from its public page
                  appear here automatically.
                </>
              )}
            </p>
            <button
              type="button"
              className="enrol-btn enrol-btn-primary"
              onClick={openAdd}
              disabled={pending}
            >
              + Add student
            </button>
          </div>
        ) : (
          <>
            <div className="cw-toolbar">
              <div className="cw-filters">
                {activeChips.map((chip) => {
                  const on = statusFilter === chip;
                  const label =
                    chip === 'ALL' ? 'All' : ENROLMENT_STATUS_META[chip].label;
                  const count = chip === 'ALL' ? roster.length : counts[chip];
                  return (
                    <button
                      key={chip}
                      type="button"
                      className={`cw-filter ${on ? 'on' : ''}`}
                      onClick={() => setStatusFilter(chip)}
                    >
                      {label} <span className="cw-filter-count">{count}</span>
                    </button>
                  );
                })}
              </div>
              <input
                type="search"
                className="cw-search"
                placeholder="Search by name or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="cw-roster">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '30%' }}>Student</th>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Enrolled</th>
                    <th>Access · payment</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRoster.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="cw-roster-empty">
                        No students match this filter.
                      </td>
                    </tr>
                  ) : (
                    visibleRoster.map((row) => {
                      const meta = ENROLMENT_STATUS_META[row.status];
                      const actions = actionsForStatus(row.status);
                      const rowBusy = busyId === row.enrolment_id && pending;
                      const np = row.nextPayment;
                      const graced = np?.graceUntilIso != null;
                      // "Give more time" applies to an overdue-paused student.
                      const canGiveTime =
                        row.status === 'PAUSED' && row.paused_reason === 'INSTALLMENT_OVERDUE';
                      return (
                        <tr key={row.enrolment_id}>
                          <td>
                            <div className="cw-student">
                              <span className="cw-avatar" aria-hidden="true">
                                {initials(row.name)}
                              </span>
                              <span className="cw-student-id">
                                <span className="cw-student-name">{row.name}</span>
                                <span className="cw-student-email">{row.email}</span>
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={`enrol-pill ${meta.pillClass}`}>
                              {meta.label}
                            </span>
                          </td>
                          <td className="cw-src">
                            {ENROLMENT_SOURCE_LABEL[row.enrolment_source]}
                          </td>
                          <td className="cw-muted">{relativeTime(row.enrolled_at)}</td>
                          <td>
                            {np ? (
                              <span
                                className={`cw-pay${
                                  np.isOverdue ? ' overdue' : graced ? ' extended' : ''
                                }`}
                              >
                                {np.isOverdue ? 'Overdue · ' : graced ? 'Grace · ' : 'Next · '}
                                {formatMoney(np.currency, np.amountMinor)}
                                <span className="cw-pay-due">
                                  {' '}
                                  {np.isOverdue ? 'since' : graced ? 'until' : 'by'}{' '}
                                  {formatDueShort(graced ? np.graceUntilIso! : np.dueDateIso)}
                                </span>
                              </span>
                            ) : row.paymentFullyPaid ? (
                              <span className="cw-pay paid">Paid in full</span>
                            ) : row.enrolment_source === 'TUTOR_ADDED' ? (
                              <span className="cw-pay offplatform">Off-platform</span>
                            ) : row.enrolment_source === 'ADMIN_GRANT' ? (
                              <span className="cw-pay offplatform">Granted</span>
                            ) : (
                              <span className="cw-muted">—</span>
                            )}
                          </td>
                          <td>
                            <div className="cw-row-actions">
                              {actions.length === 0 && !np && !canGiveTime ? (
                                <span className="cw-muted">—</span>
                              ) : (
                                <>
                                  {actions.map((action) => {
                                    const am = ENROLMENT_ACTION_META[action];
                                    return (
                                      <button
                                        key={action}
                                        type="button"
                                        className={`enrol-action enrol-action-${am.tone}`}
                                        onClick={() => onActionClick(action, row)}
                                        disabled={pending}
                                      >
                                        {rowBusy ? '…' : am.label}
                                      </button>
                                    );
                                  })}
                                  {canGiveTime && (
                                    <button
                                      type="button"
                                      className="enrol-action enrol-action-neutral"
                                      onClick={() => setGiveTimeRow(row)}
                                      disabled={pending}
                                      title="Let them back in for longer without recording a payment"
                                    >
                                      {rowBusy ? '…' : 'Give more time'}
                                    </button>
                                  )}
                                  {np && (
                                    <button
                                      type="button"
                                      className="enrol-action enrol-action-neutral"
                                      onClick={() => setMarkPaidRow(row)}
                                      disabled={pending}
                                      title="Record a payment the student made off-platform"
                                    >
                                      {rowBusy ? '…' : 'Mark paid'}
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )
      ) : (
        <WaitlistTab
          waitlist={waitlist}
          pending={pending}
          wlBusyId={wlBusyId}
          leadName={leadName}
          onConvert={(entry) => setWlConvert(entry)}
          onDismiss={(entry) => setWlDismiss(entry)}
        />
      )}

      {addOpen && (
        <AddStudentModal
          pending={pending}
          error={formError}
          plans={plans}
          currency={currency}
          onClose={closeAdd}
          onSubmit={handleSubmit}
        />
      )}

      {confirm && (
        <TransitionConfirm
          action={confirm.action}
          row={confirm.row}
          containerNoun={isCohort ? 'cohort' : 'programme'}
          pending={pending}
          onClose={() => {
            if (!pending) setConfirm(null);
          }}
          onConfirm={(note) => runAction(confirm.action, confirm.row, note)}
        />
      )}

      {markPaidRow && (
        <MarkPaidConfirm
          row={markPaidRow}
          pending={pending}
          onClose={() => {
            if (!pending) setMarkPaidRow(null);
          }}
          onConfirm={() => runMarkPaid(markPaidRow)}
        />
      )}

      {giveTimeRow && (
        <GiveMoreTimeModal
          row={giveTimeRow}
          pending={pending}
          onClose={() => {
            if (!pending) setGiveTimeRow(null);
          }}
          onConfirm={(days) => runGiveTime(giveTimeRow, days)}
        />
      )}

      {wlConvert && (
        <WaitlistConvertConfirm
          name={leadName(wlConvert)}
          email={wlConvert.email}
          pending={pending}
          onClose={() => {
            if (!pending) setWlConvert(null);
          }}
          onConfirm={() => runConvert(wlConvert)}
        />
      )}

      {wlDismiss && (
        <WaitlistDismissConfirm
          name={leadName(wlDismiss)}
          pending={pending}
          onClose={() => {
            if (!pending) setWlDismiss(null);
          }}
          onConfirm={() => runDismiss(wlDismiss)}
        />
      )}

      {toast && (
        <EnrolToast
          tone={toast.tone}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

function SummaryCell({ k, v, sub }: { k: string; v: number; sub: string }) {
  return (
    <div className="cw-cell">
      <div className="cw-cell-k">{k}</div>
      <div className="cw-cell-v">{v}</div>
      <div className="cw-cell-sub">{sub}</div>
    </div>
  );
}

function WaitlistTab({
  waitlist,
  pending,
  wlBusyId,
  leadName,
  onConvert,
  onDismiss,
}: {
  waitlist: WaitlistEntry[];
  pending: boolean;
  wlBusyId: string | null;
  leadName: (e: WaitlistEntry) => string;
  onConvert: (e: WaitlistEntry) => void;
  onDismiss: (e: WaitlistEntry) => void;
}) {
  if (waitlist.length === 0) {
    return (
      <div className="enrol-empty">
        <h2 className="enrol-empty-title">No waitlist requests.</h2>
        <p className="enrol-empty-sub">
          When someone fills in the &ldquo;Join the waitlist&rdquo; form on
          this programme&apos;s public page, their request shows up here for
          you to convert into an enrolment.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="cw-wl-intro">
        People who asked to join this cohort from the public page — name,
        email and how they&apos;d like to be contacted. Once they&apos;ve paid
        you (or you&apos;re ready to let them in), <strong>Convert</strong>{' '}
        sends an invite and enrols them.
      </p>
      <div className="cw-waitlist">
        {waitlist.map((entry) => {
          const rowBusy = wlBusyId === entry.waitlist_id && pending;
          return (
            <div className="cw-wl-row" key={entry.waitlist_id}>
              <div className="cw-wl-person">
                <span className="cw-avatar lg" aria-hidden="true">
                  {initials(leadName(entry))}
                </span>
                <div className="cw-wl-id">
                  <span className="cw-student-name">{leadName(entry)}</span>
                  <span className="cw-student-email">{entry.email}</span>
                  {entry.phone && <span className="cw-wl-phone">{entry.phone}</span>}
                  <div className="cw-wl-prefs">
                    {entry.preferred_contact.map((p) => (
                      <span key={p} className="cw-pref-badge">
                        {PREFERRED_CONTACT_LABEL[p]}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className={`cw-wl-msg ${entry.message ? '' : 'empty'}`}>
                {entry.message ? `“${entry.message}”` : 'No message'}
              </div>
              <div className="cw-wl-when">{relativeTime(entry.created_at)}</div>
              <div className="cw-wl-actions">
                <button
                  type="button"
                  className="enrol-action enrol-action-neutral"
                  onClick={() => onDismiss(entry)}
                  disabled={pending}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  className="enrol-action enrol-action-primary"
                  onClick={() => onConvert(entry)}
                  disabled={pending}
                >
                  {rowBusy ? '…' : 'Convert →'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// How many schedule positions a plan produces — mirrors the schedule
// engine's shape rules (UPFRONT = 1, DEPOSIT = 2, EQUAL = its count).
function planTotalPayments(p: PaymentStrategy): number {
  switch (p.kind) {
    case 'UPFRONT_FULL':
      return 1;
    case 'DEPOSIT_BALANCE':
      return 2;
    case 'EQUAL_INSTALLMENTS':
      return p.installment_count ?? 1;
  }
}

function AddStudentModal({
  pending,
  error,
  plans,
  currency,
  onClose,
  onSubmit,
}: {
  pending: boolean;
  error: string | null;
  plans: PaymentStrategy[];
  currency: Currency;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const firstFieldRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  // Add-with-plan (2026-06-12): optional plan + payments already received +
  // first-payment grace when nothing's been received yet.
  const [planId, setPlanId] = useState('');
  const [received, setReceived] = useState(0);
  const [graceDays, setGraceDays] = useState(7);
  const chosen = plans.find((p) => p.strategy_id === planId) ?? null;
  const totalPayments = chosen ? planTotalPayments(chosen) : 0;

  function onPlanChange(id: string) {
    setPlanId(id);
    setReceived(0);
    setGraceDays(7);
  }

  return (
    <div className="enrol-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="enrol-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="enrol-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="enrol-modal-title" className="enrol-modal-title">
          Add student
        </h2>
        <p className="enrol-modal-sub">
          Enrol a student directly. If they already have a MyNclex account
          they&apos;re attached straight away; otherwise they get an email to
          set up their account.
        </p>

        <form action={onSubmit} className="enrol-form">
          <div className="enrol-form-row">
            <label className="enrol-field">
              <span className="enrol-field-label">First name</span>
              <input
                ref={firstFieldRef}
                name="forename"
                type="text"
                className="enrol-input"
                autoComplete="off"
                required
                disabled={pending}
              />
            </label>
            <label className="enrol-field">
              <span className="enrol-field-label">Surname</span>
              <input
                name="surname"
                type="text"
                className="enrol-input"
                autoComplete="off"
                required
                disabled={pending}
              />
            </label>
          </div>
          <label className="enrol-field">
            <span className="enrol-field-label">Email</span>
            <input
              name="email"
              type="email"
              className="enrol-input"
              autoComplete="off"
              required
              disabled={pending}
            />
          </label>

          {plans.length > 0 && (
            <>
              <label className="enrol-field">
                <span className="enrol-field-label">Payment plan</span>
                <select
                  name="plan_strategy_id"
                  className="enrol-input"
                  value={planId}
                  onChange={(e) => onPlanChange(e.target.value)}
                  disabled={pending}
                >
                  <option value="">No plan — handled privately</option>
                  {plans.map((p) => (
                    <option key={p.strategy_id} value={p.strategy_id}>
                      {planLabel(p)} · {formatMoney(currency, p.total_price_minor)}
                    </option>
                  ))}
                </select>
              </label>

              {chosen && (
                <>
                  <p className="enrol-modal-sub">{describePlan(chosen, currency)}</p>
                  <div className="enrol-form-row">
                    <label className="enrol-field">
                      <span className="enrol-field-label">
                        Payments already received
                      </span>
                      <input
                        name="plan_received"
                        type="number"
                        min={0}
                        max={totalPayments}
                        className="enrol-input"
                        value={Number.isNaN(received) ? '' : received}
                        onChange={(e) => setReceived(parseInt(e.target.value, 10))}
                        disabled={pending}
                      />
                    </label>
                    {received === 0 && (
                      <label className="enrol-field">
                        <span className="enrol-field-label">
                          First payment due within (days)
                        </span>
                        <input
                          name="plan_grace_days"
                          type="number"
                          min={1}
                          max={365}
                          className="enrol-input"
                          value={Number.isNaN(graceDays) ? '' : graceDays}
                          onChange={(e) => setGraceDays(parseInt(e.target.value, 10))}
                          disabled={pending}
                        />
                      </label>
                    )}
                  </div>
                  <p className="enrol-modal-sub">
                    {received >= totalPayments ? (
                      <>Recorded as fully paid — nothing left to collect.</>
                    ) : received > 0 ? (
                      <>
                        Payments you&apos;ve already collected are recorded as
                        received directly (not through Paystack). The remaining{' '}
                        {totalPayments - received} follow the plan&apos;s schedule.
                      </>
                    ) : (
                      <>
                        Their first payment falls due once you set them up — the
                        days above are how long they have before access pauses.
                      </>
                    )}
                  </p>
                </>
              )}
            </>
          )}

          {error && (
            <p className="enrol-form-error" role="alert">
              {error}
            </p>
          )}

          <div className="enrol-modal-actions">
            <button
              type="button"
              className="enrol-btn enrol-btn-ghost"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="enrol-btn enrol-btn-primary"
              disabled={pending}
            >
              {pending ? 'Adding…' : 'Add student'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const CONFIRM_COPY: Record<
  'pause' | 'reject' | 'cancel',
  { title: (name: string) => string; body: (noun: string) => string; confirmLabel: string }
> = {
  pause: {
    title: (name) => `Pause ${name}'s access?`,
    body: (noun) =>
      `They'll temporarily lose access to this ${noun}. You can resume them at any time.`,
    confirmLabel: 'Pause access',
  },
  reject: {
    title: (name) => `Reject ${name}'s request?`,
    body: () => 'This declines their pending enrolment request. You can add them again later.',
    confirmLabel: 'Reject request',
  },
  cancel: {
    title: (name) => `Cancel ${name}'s enrolment?`,
    body: (noun) => `They'll lose access to this ${noun}. You can add them again later.`,
    confirmLabel: 'Cancel enrolment',
  },
};

function TransitionConfirm({
  action,
  row,
  containerNoun,
  pending,
  onClose,
  onConfirm,
}: {
  action: EnrolmentAction;
  row: EnrolmentRosterRow;
  containerNoun: 'cohort' | 'programme';
  pending: boolean;
  onClose: () => void;
  onConfirm: (note?: string) => void;
}) {
  const [note, setNote] = useState('');
  const meta = ENROLMENT_ACTION_META[action];
  // Resume's consequence depends on why they were paused, so its copy is
  // computed from the row rather than the static map.
  const copy =
    action === 'resume'
      ? {
          title: (name: string) => `Resume ${name}'s access?`,
          body: () =>
            row.paused_reason === 'INSTALLMENT_OVERDUE'
              ? "This lets them back in right now, but they're still behind on payment — tonight's automatic check will pause them again unless they pay or you give them more time."
              : 'This lifts the pause and restores their access.',
          confirmLabel: 'Resume access',
        }
      : CONFIRM_COPY[action as 'pause' | 'reject' | 'cancel'];

  return (
    <div className="enrol-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="enrol-modal enrol-modal-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="enrol-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="enrol-confirm-title" className="enrol-modal-title">
          {copy.title(row.name)}
        </h2>
        <p className="enrol-modal-sub">{copy.body(containerNoun)}</p>

        {meta.note && (
          <label className="enrol-field">
            <span className="enrol-field-label">Note (optional)</span>
            <textarea
              className="enrol-input enrol-textarea"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason — kept for your records and refund handling."
              disabled={pending}
            />
          </label>
        )}

        <div className="enrol-modal-actions">
          <button
            type="button"
            className="enrol-btn enrol-btn-ghost"
            onClick={onClose}
            disabled={pending}
          >
            Keep as is
          </button>
          <button
            type="button"
            className={`enrol-btn ${
              meta.tone === 'danger' ? 'enrol-btn-danger' : 'enrol-btn-primary'
            }`}
            onClick={() => onConfirm(meta.note ? note : undefined)}
            disabled={pending}
          >
            {pending ? 'Working…' : copy.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function GiveMoreTimeModal({
  row,
  pending,
  onClose,
  onConfirm,
}: {
  row: EnrolmentRosterRow;
  pending: boolean;
  onClose: () => void;
  onConfirm: (days: number) => void;
}) {
  const [days, setDays] = useState(7);
  const np = row.nextPayment;
  const valid = Number.isInteger(days) && days >= 1 && days <= 365;
  return (
    <div className="enrol-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="enrol-modal enrol-modal-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="enrol-givetime-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="enrol-givetime-title" className="enrol-modal-title">
          Give {row.name} more time?
        </h2>
        <p className="enrol-modal-sub">
          This lets them back in <strong>without recording any payment</strong>.
          {np ? (
            <>
              {' '}
              They still owe {formatMoney(np.currency, np.amountMinor)} (payment{' '}
              {np.index} of {np.totalPayments}) and are expected to pay it on the
              platform by the new date.
            </>
          ) : null}
        </p>
        <label className="enrol-field">
          <span className="enrol-field-label">Extra days from today</span>
          <input
            type="number"
            min={1}
            max={365}
            className="enrol-input"
            value={Number.isNaN(days) ? '' : days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            disabled={pending}
          />
        </label>
        <p className="enrol-modal-sub">
          They&apos;ll be paused again after that date if the payment still
          hasn&apos;t arrived.
        </p>
        <div className="enrol-modal-actions">
          <button
            type="button"
            className="enrol-btn enrol-btn-ghost"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="enrol-btn enrol-btn-primary"
            onClick={() => onConfirm(days)}
            disabled={pending || !valid}
          >
            {pending ? 'Saving…' : 'Give more time'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MarkPaidConfirm({
  row,
  pending,
  onClose,
  onConfirm,
}: {
  row: EnrolmentRosterRow;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const np = row.nextPayment;
  return (
    <div className="enrol-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="enrol-modal enrol-modal-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="enrol-markpaid-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="enrol-markpaid-title" className="enrol-modal-title">
          Record an off-platform payment?
        </h2>
        <p className="enrol-modal-sub">
          This marks {row.name}&apos;s next payment
          {np
            ? ` — ${formatMoney(np.currency, np.amountMinor)}, payment ${np.index} of ${np.totalPayments}`
            : ''}{' '}
          as paid, for money received directly (cash or transfer), not through
          Paystack.
          {np?.isOverdue
            ? ' If this clears their overdue balance, their paused access is restored.'
            : ''}
        </p>
        <p className="enrol-modal-sub">
          Only do this once you&apos;ve actually received the payment.
        </p>
        <div className="enrol-modal-actions">
          <button
            type="button"
            className="enrol-btn enrol-btn-ghost"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="enrol-btn enrol-btn-primary"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Recording…' : 'Mark paid'}
          </button>
        </div>
      </div>
    </div>
  );
}

function WaitlistConvertConfirm({
  name,
  email,
  pending,
  onClose,
  onConfirm,
}: {
  name: string;
  email: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="enrol-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="enrol-modal enrol-modal-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="enrol-wl-convert-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="enrol-wl-convert-title" className="enrol-modal-title">
          Convert {name} to an enrolment?
        </h2>
        <p className="enrol-modal-sub">Converting will:</p>
        <ul className="enrol-modal-list">
          <li>
            Email an invite to <strong>{email}</strong> to set up their MyNclex
            account (skipped if they already have one).
          </li>
          <li>
            Add them to this cohort as <strong>Enrolled</strong> — they appear
            in the roster and get access right away.
          </li>
        </ul>
        <p className="enrol-modal-sub">
          Only do this once you&apos;ve confirmed their payment (or you&apos;re
          ready to let them in).
        </p>
        <div className="enrol-modal-actions">
          <button
            type="button"
            className="enrol-btn enrol-btn-ghost"
            onClick={onClose}
            disabled={pending}
          >
            Not yet
          </button>
          <button
            type="button"
            className="enrol-btn enrol-btn-primary"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Converting…' : 'Convert & enrol'}
          </button>
        </div>
      </div>
    </div>
  );
}

function WaitlistDismissConfirm({
  name,
  pending,
  onClose,
  onConfirm,
}: {
  name: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="enrol-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="enrol-modal enrol-modal-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="enrol-wl-dismiss-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="enrol-wl-dismiss-title" className="enrol-modal-title">
          Dismiss {name}&apos;s request?
        </h2>
        <p className="enrol-modal-sub">
          This removes their waitlist request from the list. It doesn&apos;t
          notify them, and they can ask to join again from the public page.
        </p>
        <div className="enrol-modal-actions">
          <button
            type="button"
            className="enrol-btn enrol-btn-ghost"
            onClick={onClose}
            disabled={pending}
          >
            Keep request
          </button>
          <button
            type="button"
            className="enrol-btn enrol-btn-primary"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Working…' : 'Dismiss request'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EnrolToast({
  tone,
  message,
  onDismiss,
}: {
  tone: 'success' | 'error';
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(id);
  }, [message, onDismiss]);

  return (
    <div
      className={`enrol-toast enrol-toast-${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      <span className="enrol-toast-icon" aria-hidden="true">
        {tone === 'success' ? '✓' : '!'}
      </span>
      <span className="enrol-toast-message">{message}</span>
      <button
        type="button"
        className="enrol-toast-close"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        ✕
      </button>
    </div>
  );
}

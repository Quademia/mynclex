// mynclex/lib/home/tutor/programme-overview-types.ts
//
// Shapes for the tutor PROGRAMME Overview page (the detail landing at
// /tutor/programme/[id]/overview). It's the tutor Home (lib/home/tutor)
// scoped to ONE programme — same derive-at-read-time philosophy, no new
// tables. Built from the CD "Overview — A Card Grid" prototype.
//
// Mode is fixed by the programme's delivery_mode (TUTOR_LED vs
// SELF_PACED), not a runtime toggle — one loader, one view, two header /
// KPI / panel arrangements (mirrors lib/home/student).

import type {
  Currency,
  DeliveryMode,
  PaymentCollectionMode,
  ProgrammeFormValues,
  ProgrammeStatus,
  UnitLabel,
} from '@/lib/programmes/types';
import type { EnrolmentStatus } from '@/lib/enrolments/types';

// ── Header ────────────────────────────────────────────────────────────
// Identity + meta line + the action cluster's seed data. formValues feeds
// the Edit modal (ProgrammeFormModal, mode='edit') so opening Edit needs
// no second round-trip.
export type ProgrammeOverviewHeader = {
  programmeId: string;
  title: string;
  tagline: string | null;
  deliveryMode: DeliveryMode;
  status: ProgrammeStatus;
  lengthUnits: number;
  unitLabel: UnitLabel;
  priceMinor: number | null;
  currency: Currency;
  paymentGatesAccess: boolean;
  formValues: ProgrammeFormValues;
  // Next scheduled live session across this programme's cohorts (TUTOR_LED
  // only). null when self-paced or nothing upcoming.
  nextSessionLabel: string | null;
  // Money that actually arrived for THIS programme, in its own currency.
  // null when nothing received yet.
  revenueLabel: string | null;
};

// ── KPI strip ─────────────────────────────────────────────────────────
// Raw figures; the view assembles the four cards per mode. Tutored uses
// cohortsActive / cohortsNeedAttention / avgCompletion; self-paced uses
// enrolmentsOverdue + revenue (avg completion needs programme-level
// analytics, which isn't built — see the queries note).
export type ProgrammeOverviewKpis = {
  studentsEnrolled: number;
  studentsNewThisWeek: number;
  cohortsActive: number;
  cohortsNeedAttention: number;
  avgCompletion: number | null;
  enrolmentsOverdue: number;
  enquiriesOpen: number;
};

// ── Sections grid (the five content shortcuts) ──────────────────────────
export type ProgrammeOverviewSections = {
  curriculum: { units: number; activities: number; unitLabel: UnitLabel };
  library: { notes: number; shelves: number };
  quizzes: { total: number; mock: number; practice: number };
  payments: { plans: number; mode: PaymentCollectionMode };
  enrolments: { active: number; expired: number };
};

// ── Cohort health rows (TUTOR_LED — rendered in the work panel, Slice 2) ──
// Computed in Slice 1 already (the avg-completion KPI + needs-attention
// count run the per-cohort analytics anyway), so the panel reuses it for
// free. health: on-track ≥60% · watch <60% or lagging · just-started
// (running but barely begun) · no-data (no enrolled students yet).
export type CohortHealthStatus = 'on-track' | 'watch' | 'just-started' | 'no-data';

export type CohortHealthRow = {
  cohortId: string;
  name: string;
  dateRange: string;
  students: number;
  completionPct: number;
  laggingCount: number;
  status: CohortHealthStatus;
};

// ── Work-row panels (Slice 2) ────────────────────────────────────────
// One open enquiry preview (both modes). fresh = NEW (vs CONTACTED) —
// drives the unread dot.
export type EnquiryPreview = {
  enquiryId: string;
  name: string;
  initials: string;
  agoLabel: string;
  message: string;
  fresh: boolean;
};

// One row in the self-paced "recently enrolled" list.
export type RecentEnrolment = {
  enrolmentId: string;
  name: string;
  initials: string;
  agoLabel: string;
  detail: string | null;
  status: EnrolmentStatus;
};

// Self-paced enrolment-health panel — status tiles + recent enrolments.
// (overdue = a missed installment paused them; paused = a manual tutor
// pause; mirrors the roster's PAUSED split.)
export type EnrolmentHealth = {
  active: number;
  overdue: number;
  paused: number;
  expired: number;
  recent: RecentEnrolment[];
};

export type ProgrammeOverviewData = {
  header: ProgrammeOverviewHeader;
  kpis: ProgrammeOverviewKpis;
  sections: ProgrammeOverviewSections;
  // TUTOR_LED: in-progress cohorts, worst health first. Empty for
  // self-paced (the view shows the enrolment-health panel instead).
  cohorts: CohortHealthRow[];
  // Open enquiries (NEW / CONTACTED), newest first, capped — both modes.
  enquiries: EnquiryPreview[];
  // Self-paced work panel (tutor-led shows the cohorts panel instead).
  enrolmentHealth: EnrolmentHealth;
};

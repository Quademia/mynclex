// mynclex/lib/curriculum/types.ts
//
// Shape mirrors nclex_programme_units / _blocks / _activities
// (slice 9.3a migration). Refer to db/migrations/
// 20260512200000_slice_9_3a_curriculum_schema.sql for the source
// of truth on columns and constraints.
//
// Activity payload: shape varies by `type` (discriminated union).
// The DB column is JSONB with no shape enforcement — these TS
// types are the contract. Marked PROVISIONAL: per-type shapes
// finalise when that type's editor ships (Text in 9.3b, the
// remaining five in 9.3d).

import type { UnitLabel, DeliveryMode } from '@/lib/programmes/types';

export type ProgrammeUnit = {
  unit_id: string;
  programme_id: string;
  unit_index: number;
  title: string | null;
  description: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type ProgrammeBlock = {
  block_id: string;
  unit_id: string;
  ordinal: number;
  title: string;
  description: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

// Six activity types — v1 set. Library Note, uploaded video,
// written assignments deferred to v2 per main.md.
//
// `ONLINE_LIVE_SESSION` (renamed from `LIVE_SESSION` in slice
// 9.3d-a): "live" describes synchronicity, "online" the medium.
// A future `IN_PERSON_LIVE_SESSION` will share the "live" half;
// both leave room for a future `RECORDED_SESSION` async type.
export type ActivityType =
  | 'TEXT'
  | 'PDF'
  | 'EXTERNAL_LINK'
  | 'ONLINE_LIVE_SESSION'
  | 'MOCK'
  | 'PRACTICE_QUIZ';

// PROVISIONAL payload shapes — refined when each editor ships.
// The TEXT shape lands first in 9.3b; the rest follow in 9.3d.
// Action-layer validators enforce these at write time; the DB
// stores any JSONB.

export type ActivityPayloadText = {
  body?: string;
  estimated_minutes?: number;
};

// Refined in slice 9.3d-c — `storage_path` replaced by
// `pdf_asset_id`. The PDF file lives as a row in
// `nclex_media_assets` (slice 9.3d-b); the activity payload only
// carries the FK-shaped reference. No DB-level FK constraint — per
// 9.3a's locked decision, the payload is JSONB and integrity is
// enforced at the action layer (validatePdfAssetOwnership).
export type ActivityPayloadPdf = {
  pdf_asset_id?: string;
  estimated_minutes?: number;
};

export type ActivityPayloadExternalLink = {
  url?: string;
  estimated_minutes?: number;
};

export type ActivityPayloadOnlineLiveSession = {
  scheduled_at?: string;       // ISO UTC timestamp
  duration_minutes?: number;
  join_url?: string;
  recording_url?: string;
};

// Slice 9.3d-d — future-link shape. MOCK and PRACTICE_QUIZ are
// curriculum placeholders today: the activity exists, but no quiz
// settings live on it. When the central tutor-quiz system ships
// (separate later slice), `quiz_id` points to a row in
// `nclex_tutor_quizzes`; the student launches a PROGRAMME_ASSIGNED
// attempt against that quiz through the existing runner. Until
// then, `quiz_id` is null and the activity is not student-
// launchable. Both placeholder types share the same shape — the
// activity-type field on the row already encodes the distinction.
export type ActivityPayloadMock = { quiz_id: string | null };
export type ActivityPayloadPracticeQuiz = { quiz_id: string | null };

export type ActivityPayload =
  | ActivityPayloadText
  | ActivityPayloadPdf
  | ActivityPayloadExternalLink
  | ActivityPayloadOnlineLiveSession
  | ActivityPayloadMock
  | ActivityPayloadPracticeQuiz;

export type ProgrammeActivity = {
  activity_id: string;
  unit_id: string;
  block_id: string | null;
  ordinal: number;
  type: ActivityType;
  title: string;
  description: string | null;   // slice 9.3d-a — what the activity is about
  note: string | null;          // directive to the student (operational)
  payload: ActivityPayload;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

// Projection for the Units Overview grid (slice 9.3a). One row
// per unit slot with rolled-up counts for the card meta line.
// Slice 9.3e added `published_*_count` so the card can show
// "3 of 5 activities live" alongside the unit's own pill.
export type UnitGridRow = ProgrammeUnit & {
  block_count: number;
  activity_count: number;
  published_block_count: number;
  published_activity_count: number;
};

// Context the Units Overview page needs from the parent programme
// — drives the unit label ("Week N" / "Module N") and the count
// of slots to render.
export type CurriculumProgrammeContext = {
  programme_id: string;
  unit_label: UnitLabel;
  delivery_mode: DeliveryMode;
  length_units: number;
};

// Slice 9.3b — Unit Builder.

// Editable shape of the unit-edit form. Title + description are
// the tutor-facing fields; `is_published` is the Live/Draft pill
// toggle. unit_index is fixed (set by programme.length_units at
// backfill / creation time); never editable.
export type UnitFormValues = {
  title: string;            // empty string → stored as NULL
  description: string;      // empty string → stored as NULL
  is_published: boolean;
};

// Common shape every activity editor's modal carries — Title +
// Description + "Note to student" + Live/Draft toggle sit in the
// activity-modal shell above the type-specific body, in that
// order. Slice 9.3d-a added description; slice 9.3e added
// `is_published` to mirror the unit + block modals.
//
// `title` is required at the DB level (NOT NULL). `description`
// and `note` are nullable — empty strings get stored as NULL.
// Description = what the activity is about (substantive); note =
// directive to the student (operational). `is_published` matches
// the column; default false on create.
export type ActivityCommonFormValues = {
  title: string;
  description: string;      // empty string → stored as NULL
  note: string;             // empty string → stored as NULL
  is_published: boolean;
};

// Text-activity body fields. The shell holds title + note; this
// object covers the type-specific bits that live below the
// divider. Pairs with payload shape ActivityPayloadText in v1.
export type TextActivityBodyValues = {
  body: string;             // free text, no formatting in v1
  estimated_minutes: string; // free-text input; '' → NULL on save
};

// Full TEXT-activity form payload — shell + body merged. Used by
// createActivityAction / editActivityAction.
export type TextActivityFormValues = ActivityCommonFormValues & {
  body: string;
  estimated_minutes: number | null;
};

// --- Slice 9.3d-a — External link ---

// Raw editor body state. The estimated_minutes input is a free-
// text number string so the parent modal can parse + validate
// uniformly with Text's pattern. Empty string → NULL on save.
export type ExternalLinkActivityBodyValues = {
  url: string;
  estimated_minutes: string;
};

// Parsed/validated form payload sent to the server action.
export type ExternalLinkActivityFormValues = ActivityCommonFormValues & {
  url: string;
  estimated_minutes: number | null;
};

// --- Slice 9.3d-c — PDF activity ---

// Raw editor body state. `pdf_asset_id` is null until the tutor
// completes an upload (or, in edit mode, the value loaded from
// payload). `estimated_minutes` mirrors the free-text pattern
// used by Text + External link.
export type PdfActivityBodyValues = {
  pdf_asset_id: string | null;
  estimated_minutes: string;
};

// Validated form payload sent to the server action. pdf_asset_id
// is required at save time — a PDF activity without a PDF is
// pointless. estimated_minutes is optional.
export type PdfActivityFormValues = ActivityCommonFormValues & {
  pdf_asset_id: string;
  estimated_minutes: number | null;
};

// Display metadata for an existing PDF activity's attached asset.
// Fetched lazily by the modal in edit mode via
// getActivityPdfPreviewAction. signed_url is a short-lived (1-hour)
// link minted by the server; the modal won't be open long enough
// for expiry to matter, but cache busts on Replace.
export type PdfActivityPreview = {
  original_filename: string;
  size_bytes: number;
  signed_url: string;
};

// --- Slice 9.3d-a — Online live session ---

// Raw editor body state. `scheduled_at` here is the raw
// datetime-local input value ("YYYY-MM-DDTHH:MM", local time, no
// TZ); the modal converts to UTC ISO before save. The string-
// shaped duration_minutes mirrors the pattern used for Text /
// External link.
export type OnlineLiveSessionActivityBodyValues = {
  scheduled_at: string;       // "YYYY-MM-DDTHH:MM" local
  duration_minutes: string;
  join_url: string;
  recording_url: string;
};

// Parsed/validated form payload sent to the server action.
// `scheduled_at` here is UTC ISO. `recording_url` is nullable —
// tutor fills it after the session airs.
export type OnlineLiveSessionActivityFormValues = ActivityCommonFormValues & {
  scheduled_at: string;       // UTC ISO
  duration_minutes: number;
  join_url: string;
  recording_url: string | null;
};

// --- Tutor-quiz Slice 2 — Mock + Practice quiz (functional) ---

// Raw editor body state for both quiz activity types. `quiz_id` is
// null until the tutor picks a quiz in the "Choose a quiz"
// selector (or, in edit mode, the value loaded from payload). Both
// types share this shape — the activity-type row field encodes the
// Mock vs Practice distinction.
export type QuizActivityBodyValues = {
  quiz_id: string | null;
};

// Validated form payload sent to the server action. `quiz_id` may
// be null (a quiz activity can be saved as a draft without a quiz);
// the publish gate in buildPayload blocks is_published === true
// when quiz_id is null.
export type MockActivityFormValues = ActivityCommonFormValues &
  QuizActivityBodyValues;
export type PracticeQuizActivityFormValues = ActivityCommonFormValues &
  QuizActivityBodyValues;

// Discriminated union of every per-type form payload the server
// actions accept. Narrows on `type` so each branch sees its own
// fully-typed shape.
export type ActivityFormValues =
  | ({ type: 'TEXT' } & TextActivityFormValues)
  | ({ type: 'PDF' } & PdfActivityFormValues)
  | ({ type: 'EXTERNAL_LINK' } & ExternalLinkActivityFormValues)
  | ({ type: 'ONLINE_LIVE_SESSION' } & OnlineLiveSessionActivityFormValues)
  | ({ type: 'MOCK' } & MockActivityFormValues)
  | ({ type: 'PRACTICE_QUIZ' } & PracticeQuizActivityFormValues);

// Unit detail projection — unit + ALL its content (blocks + every
// activity, loose AND in-block) + parent programme identity.
// Slice 9.3c added blocks; the activities array is no longer
// loose-only — the page splits them by `block_id` when composing
// the unit body.
export type UnitDetail = {
  unit: ProgrammeUnit;
  blocks: ProgrammeBlock[];
  activities: ProgrammeActivity[];
  programme: CurriculumProgrammeContext;
};

// Slice 9.3c — block authoring.

// Editable shape of the block edit modal. Title is required at the
// DB level (NOT NULL); create flow handles title via an inline
// rename, so this form is reused only for edit. Description +
// is_published mirror the unit pattern.
export type BlockFormValues = {
  title: string;            // required (NOT NULL in DB)
  description: string;      // empty string → stored as NULL
  is_published: boolean;
};

// Unit body is a flat ordered sequence of entries. Each entry is
// either a block (carrying its own ordered activity list) or a
// loose activity. `ordinal` lives in a single numeric space across
// both kinds inside a unit; the queries layer merges them into
// this discriminated union before render.
export type UnitBodyEntry =
  | { kind: 'block'; block: ProgrammeBlock; activities: ProgrammeActivity[] }
  | { kind: 'loose'; activity: ProgrammeActivity };

// Re-export the activity-type literal for the picker.
export const ACTIVITY_TYPES: ActivityType[] = [
  'TEXT',
  'PDF',
  'EXTERNAL_LINK',
  'ONLINE_LIVE_SESSION',
  'MOCK',
  'PRACTICE_QUIZ',
];

// =====================================================================
// Slice 10.1 — Student curriculum viewer shape
// =====================================================================
//
// Single shape produced by both delivery modes' student queries.
// The viewer takes this tree and renders it identically — the
// difference between SELF_PACED and TUTOR_LED is captured by
// whether `cohort` is null. Self-paced reads the programme
// template directly; tutor-led routes every activity through the
// cohort checklist (inclusion + release date).
//
// Activities here are ALREADY filtered to isVisibleToStudents()
// — the viewer never has to filter again. Empty units / empty
// blocks survive the filter so the tutor's structural intent
// stays visible to the student (e.g. "Week 2 — Coming soon"
// rather than the week vanishing).

// Slice 10.6 / 10.7 — an activity as the student sees it: the
// template row, plus its window state. A flat intersection (not a
// wrapper) so call sites stay activity-shaped.
//
// `openState` is derived from the cohort window vs. today:
//   LOCKED — before release_date ("Opens <date>")
//   OPEN   — released and not past close (the normal action; a
//            "Due <date>" line shows when dueDate is set)
//   CLOSED — past close_date ("Closed <date>")
// Self-paced activities have no window — openState 'OPEN', all
// three dates null.
export type StudentActivity = ProgrammeActivity & {
  openState: 'LOCKED' | 'OPEN' | 'CLOSED';
  releaseDate: string | null; // YYYY-MM-DD; null for self-paced
  dueDate: string | null;     // soft target; null = none set
  closeDate: string | null;   // hard gate; null = none set
  // Progress engine, Slice 1. TRUE when the student has a row in
  // nclex_student_activity_progress for this activity. Orthogonal
  // to openState — a LOCKED or CLOSED activity may still be DONE
  // (e.g., done while open then later closed; the row survives).
  isDone: boolean;
  // Progress engine, Slice 3. TRUE only for quiz types (MOCK /
  // PRACTICE_QUIZ) when the student has an IN_PROGRESS programme
  // attempt against this activity. Derived from nclex_attempts at
  // read time; not stored (per §1). Always FALSE for non-quiz
  // types. Mutually exclusive with isDone (DONE means the latest
  // attempt was terminal; can't also be IN_PROGRESS).
  isInProgress: boolean;
};

export type StudentBodyEntry =
  | {
      kind: 'block';
      block: ProgrammeBlock;
      activities: StudentActivity[]; // visible (may be locked)
    }
  | { kind: 'loose'; activity: StudentActivity };

export type StudentCurriculumUnit = {
  unit: ProgrammeUnit;
  body: StudentBodyEntry[];
  // Progress engine, Slice 3. Counts of visible activities in this
  // unit (matches what isVisibleToStudents filters in). LOCKED and
  // CLOSED activities count toward the denominator (§7 — they're
  // part of the curriculum). progressPct is null when total = 0
  // (no denominator) — the tab strip omits the % suffix in that case.
  progressDone: number;
  progressTotal: number;
  progressPct: number | null; // 0..100 integer, or null
};

export type StudentCurriculumTree = {
  programme: {
    programme_id: string;
    title: string;
    delivery_mode: import('@/lib/programmes/types').DeliveryMode;
    unit_label: UnitLabel;
  };
  cohort: {
    cohort_id: string;
    name: string | null;
    start_date: string;
  } | null;
  units: StudentCurriculumUnit[];

  // Progress engine, Slice 3 — soft guidance signals.
  //
  // upNextActivityId: the activity_id the "Up next" / "Start here"
  // pill should land on (per §8.1). First row in curriculum order
  // that's NOT_STARTED AND NOT IN_PROGRESS (an IN_PROGRESS quiz
  // gets its own pill — Up next would double up). null when
  // nothing matches (everything DONE, or only quiz IN_PROGRESS
  // exists).
  upNextActivityId: string | null;

  // whereILeftOffUnitIndex: the unit the tab strip should default
  // to (per §6.1 + §8.2 — resume-first). Most recent IN_PROGRESS
  // quiz attempt's unit, fallback most recent DONE activity's
  // unit, fallback null (the tab wrapper falls back to Unit 1).
  whereILeftOffUnitIndex: number | null;

  // hasAnyDone: drives the "Start here" vs "Up next" copy flip
  // (§8.1). TRUE when at least one activity in this programme is
  // DONE for this student.
  hasAnyDone: boolean;
};

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

// --- Slice 9.3d-d — Mock + Practice quiz (placeholders) ---

// Both placeholder editors expose no body fields — the shell's
// Title + Description + Note are the only editable surfaces. When
// the quiz selector ships, these gain a `quiz_id` (and the
// payload field flips from null to that id).
export type MockActivityFormValues = ActivityCommonFormValues;
export type PracticeQuizActivityFormValues = ActivityCommonFormValues;

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

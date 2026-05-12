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
export type ActivityType =
  | 'TEXT'
  | 'PDF'
  | 'EXTERNAL_LINK'
  | 'LIVE_SESSION'
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

export type ActivityPayloadPdf = {
  storage_path?: string;
  estimated_minutes?: number;
};

export type ActivityPayloadExternalLink = {
  url?: string;
  estimated_minutes?: number;
};

export type ActivityPayloadLiveSession = {
  scheduled_at?: string;       // ISO timestamp
  duration_minutes?: number;
  join_url?: string;
  recording_url?: string;
};

export type ActivityPayloadMock = {
  question_count?: number;
  time_limit_minutes?: number;
  pass_score?: number;
  due_at?: string;             // ISO timestamp
  attempts?: number;
  release_results?: 'IMMEDIATE' | 'AFTER_DUE';
};

export type ActivityPayloadPracticeQuiz = {
  question_count?: number;
  due_at?: string;
  pass_score?: number;
  release_results?: 'IMMEDIATE' | 'AFTER_DUE';
};

export type ActivityPayload =
  | ActivityPayloadText
  | ActivityPayloadPdf
  | ActivityPayloadExternalLink
  | ActivityPayloadLiveSession
  | ActivityPayloadMock
  | ActivityPayloadPracticeQuiz;

export type ProgrammeActivity = {
  activity_id: string;
  unit_id: string;
  block_id: string | null;
  ordinal: number;
  type: ActivityType;
  title: string;
  note: string | null;
  payload: ActivityPayload;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

// Projection for the Units Overview grid (slice 9.3a). One row
// per unit slot with rolled-up counts for the card meta line.
export type UnitGridRow = ProgrammeUnit & {
  block_count: number;
  activity_count: number;
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

// Common shape every activity editor's modal carries — Title and
// "Note to student" sit in the activity-modal shell above the
// type-specific body. Every type uses the same two fields per
// curriculum-authoring-ux.md screen 6.
export type ActivityCommonFormValues = {
  title: string;
  note: string;             // empty string → stored as NULL
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

// Unit detail projection — unit + its activities, with the parent
// programme's identity inlined so the page can render headers
// without a second round trip.
export type UnitDetail = {
  unit: ProgrammeUnit;
  activities: ProgrammeActivity[];
  programme: CurriculumProgrammeContext;
};

// Re-export the activity-type literal for the picker.
export const ACTIVITY_TYPES: ActivityType[] = [
  'TEXT',
  'PDF',
  'EXTERNAL_LINK',
  'LIVE_SESSION',
  'MOCK',
  'PRACTICE_QUIZ',
];

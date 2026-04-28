// mynclex/lib/authoring/types.ts
//
// Shared types for the authoring system. The 9 question editors and
// the 2 wrapper editors all import what they need from here.
//
// Scope: in-memory editor value shapes only. JSONB-on-the-wire shapes
// remain authoritative in lib/bank/types.ts — read-side parsers in
// each editor's value.ts module translate from those into the value
// types defined here.

export interface ClassificationValue {
  clientNeedsCategory: string;
  clientNeedsSubcategory: string;
  nursingSubject: string;
  bodySystem: string;
  difficulty: string;
  topic: string;
  subtopic: string;
  bloomLevel: string;
  // Comma-separated; the save parser will split on save (Slice 2).
  // Stored as a string in the editor so typing "a, b" mid-stroke
  // doesn't reshape on every keystroke.
  tags: string;
}

export const emptyClassification = (): ClassificationValue => ({
  clientNeedsCategory: '',
  clientNeedsSubcategory: '',
  nursingSubject: '',
  bodySystem: '',
  difficulty: '',
  topic: '',
  subtopic: '',
  bloomLevel: '',
  tags: '',
});

export interface HousekeepingValue {
  marks: number;
  questionRef: string;
  batchId: string;
  isFreeSample: boolean;
  isBuilderVisible: boolean;
  shuffleOptions: boolean;
}

export const emptyHousekeeping = (): HousekeepingValue => ({
  marks: 1,
  questionRef: '',
  batchId: '',
  isFreeSample: false,
  isBuilderVisible: true,
  shuffleOptions: true,
});

// System fields the DB owns. The editor displays these in Housekeeping
// but never edits them. Published status is also surfaced in the
// modal topbar as a status pill.
export interface SystemMeta {
  itemId: string;
  isPublished: boolean;
  createdAt: string; // ISO string from row.created_at
  updatedAt: string; // ISO string from row.updated_at
}

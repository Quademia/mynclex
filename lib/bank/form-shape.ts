// mynclex/lib/bank/form-shape.ts
//
// The "initial values" shape shared between the bank authoring form
// (client component) and the page that renders it (server component).
//
// Lives here, not in form.tsx, because form.tsx carries a 'use client'
// directive — and Next.js won't let a server component call a plain
// function exported from a client file. Types can cross the boundary
// via type-only imports, but runtime helpers cannot. Keeping both the
// interface and the factory function in a neutral module side-steps
// the issue cleanly.

import type { QuestionType } from './classifications';

export interface BankFormInitial {
  item_id: string | null;            // null = create mode
  question_type: QuestionType;
  stem: string;
  rationale: string;
  rationale_img: string;
  options: { id: string; text: string; feedback: string }[];
  correct_ids: string[];
  select_count: number;
  // Matrix-specific fields — empty/default for all other types
  matrix_row_label: string;
  matrix_rows: { id: string; text: string; feedback: string }[];
  matrix_columns: { id: string; text: string }[];
  matrix_correct: Record<string, string>;   // rowId -> columnId
  client_needs_category: string;
  client_needs_subcategory: string;
  nursing_subject: string;
  body_system: string;
  topic: string;
  subtopic: string;
  difficulty: string;
  bloom_level: string;
  tags: string;                      // comma-separated
  is_published: boolean;
  is_free_sample: boolean;
  is_builder_visible: boolean;
  marks: number;
  shuffle_options: boolean;
  question_ref: string;
  batch_id: string;
}

export function emptyInitial(): BankFormInitial {
  return {
    item_id: null,
    question_type: 'MCQ',
    stem: '',
    rationale: '',
    rationale_img: '',
    options: [],
    correct_ids: [],
    select_count: 2,
    client_needs_category: '',
    client_needs_subcategory: '',
    nursing_subject: '',
    body_system: '',
    topic: '',
    subtopic: '',
    difficulty: '',
    bloom_level: '',
    tags: '',
    is_published: false,
    is_free_sample: false,
    is_builder_visible: true,
    marks: 1,
    shuffle_options: true,
    matrix_row_label: '',
    matrix_rows: [
      { id: 'r1', text: '', feedback: '' },
      { id: 'r2', text: '', feedback: '' },
      { id: 'r3', text: '', feedback: '' },
    ],
    matrix_columns: [
      { id: 'c1', text: '' },
      { id: 'c2', text: '' },
      { id: 'c3', text: '' },
    ],
    matrix_correct: {},
    question_ref: '',
    batch_id: '',
  };
}

// mynclex/lib/bank/runner/types/tf.tsx
//
// TF (True/False) runner — a thin wrapper around McqRunner.
//
// Why the wrapper rather than the switch dispatching to McqRunner
// directly: TfContent / TfCorrect are type aliases of McqContent /
// McqCorrect (lib/bank/types.ts §TF), so the rendering is identical
// today. But TF questions are conceptually different (locked 2-option
// True/False semantics, max marks fixed at 1 per scoring §5.2), and
// future divergence (different visual treatment, different a11y copy,
// different keyboard shortcuts) has a natural home here without
// touching McqRunner. The cost is one indirection — small.
//
// Per BUILD_LIST.md slice 4.2: "Each as a single component with
// `mode: 'answering' | 'review'` prop, structurally mirroring
// lib/bank/runner/types/mcq.tsx" — the wrapper satisfies that.

'use client';

import type { TfContent, TfCorrect } from '@/lib/bank/types';
import type { TfAnswer } from '@/lib/scoring';
import { McqRunner } from './mcq';

type TfRunnerProps = {
  content: TfContent;
} & (
  | {
      mode:     'answering';
      selected: TfAnswer;
      onChange: (id: TfAnswer) => void;
    }
  | {
      mode:          'review';
      studentAnswer: TfAnswer;
      correct:       TfCorrect;
    }
);

export function TfRunner(props: TfRunnerProps) {
  return <McqRunner {...props} />;
}

// mynclex/lib/library/programme/embed-preview.tsx
//
// Read-only preview of an embedded-questions block, for the tutor's
// programme-library "student preview". The faithful-but-inert
// counterpart to the student's <EmbedPlayer>: it loads the SAME
// answerable content (stems + options, no answer key) via loadEmbedBlock
// — which works for the tutor because that action gates on RLS note
// visibility, and the tutor OWNS the note — then renders every question
// statically. Nothing is scored, submitted, or logged (no rows written
// to the student-keyed nclex_library_embed_answers).
//
// The per-type option lists reuse the bank-runner components in
// answering mode, frozen inside a pointer-events:none wrapper so the
// tutor sees exactly the choices students get without being able to
// answer (and without the key leaking).

'use client';

import { useEffect, useState } from 'react';
import {
  McqRunner,
  TfRunner,
  SataRunner,
  SelectNRunner,
} from '@/lib/practice/runner';
import type {
  McqContent,
  TfContent,
  SataContent,
  SelectNContent,
} from '@/lib/bank/types';
import {
  loadEmbedBlock,
  type EmbedPlayQuestion,
} from '../student/embed-player-actions';

type LoadState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error' }
  | { status: 'ready'; questions: EmbedPlayQuestion[] };

export function EmbedPreview({
  noteId,
  blockId,
}: {
  noteId: string;
  blockId: string;
}) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let live = true;
    loadEmbedBlock(noteId, blockId).then((res) => {
      if (!live) return;
      if (!res) setLoad({ status: 'error' });
      else if (res.questions.length === 0) setLoad({ status: 'empty' });
      else setLoad({ status: 'ready', questions: res.questions });
    });
    return () => {
      live = false;
    };
  }, [noteId, blockId]);

  if (load.status === 'loading') {
    return <div className="eq-player eq-player--state">Loading practice…</div>;
  }
  if (load.status === 'empty') return null;
  if (load.status === 'error') {
    return (
      <div className="eq-player eq-player--state">
        Practice questions are unavailable.
      </div>
    );
  }

  const total = load.questions.length;

  return (
    <div className="eq-player eq-preview">
      <div className="eq-preview-head">
        <span className="eq-player-tab">
          <span aria-hidden="true">✦</span> Practice
        </span>
        <span className="eq-preview-note">
          {total} question{total === 1 ? '' : 's'} · students answer these
        </span>
      </div>

      <ol className="eq-preview-list">
        {load.questions.map((q, i) => (
          <li key={q.itemId} className="eq-preview-item">
            <div className="eq-preview-qnum">
              Question {i + 1} of {total}
            </div>
            <div className="rn-stem">{q.stem}</div>
            {q.instruction && <p className="rn-instruction">{q.instruction}</p>}
            <div className="eq-preview-options" aria-hidden="true">
              <InertOptions questionType={q.questionType} content={q.content} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// The option list for one question, rendered via the bank runner in
// answering mode but with no selection + a no-op onChange. The wrapper's
// pointer-events:none (see CSS) freezes it; the answer key is never sent
// to the client (loadEmbedBlock returns answerable content only).
function InertOptions({
  questionType,
  content,
}: {
  questionType: EmbedPlayQuestion['questionType'];
  content: unknown;
}) {
  switch (questionType) {
    case 'MCQ':
      return (
        <McqRunner
          mode="answering"
          content={content as McqContent}
          selected={null}
          onChange={() => {}}
        />
      );
    case 'TF':
      return (
        <TfRunner
          mode="answering"
          content={content as TfContent}
          selected={null}
          onChange={() => {}}
        />
      );
    case 'SATA':
      return (
        <SataRunner
          mode="answering"
          content={content as SataContent}
          selected={[]}
          onChange={() => {}}
        />
      );
    case 'SELECT_N':
      return (
        <SelectNRunner
          mode="answering"
          content={content as SelectNContent}
          selected={[]}
          onChange={() => {}}
        />
      );
  }
}

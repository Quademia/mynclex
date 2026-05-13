// mynclex/lib/curriculum/quiz-placeholder-editor.tsx
//
// Slice 9.3d-d — Mock + Practice quiz placeholder body.
//
// Both activity types share this component. The body has no
// editable fields today — only the shell's Title + Description +
// Note are user-input. This panel renders a type-keyed
// explanation of what the activity will become once the central
// tutor-quiz system ships in a later slice.
//
// When the quiz selector ships, this file becomes the host for a
// "Choose / change quiz" affordance — the call-site contract stays
// the same (a body component with a `type` discriminator), and
// the activity-type → quiz-kind mapping (MOCK ↔ mock quiz,
// PRACTICE_QUIZ ↔ practice quiz) is what the future selector will
// filter on.

'use client';

interface QuizPlaceholderEditorProps {
  type: 'MOCK' | 'PRACTICE_QUIZ';
}

const COPY: Record<
  QuizPlaceholderEditorProps['type'],
  { icon: string; heading: string; body: string }
> = {
  MOCK: {
    icon: '🎯',
    heading: 'Mock assessment — timed exam-style readiness check',
    body:
      'Quiz setup is coming in a later slice. Once the tutor quiz system ships, ' +
      'this activity will be linked to a mock quiz you author (question set, ' +
      'time limit, pass score, attempts) and students will launch it in the ' +
      'same runner the bank uses.',
  },
  PRACTICE_QUIZ: {
    icon: '✏️',
    heading: 'Practice quiz — learning-focused practice',
    body:
      'Quiz setup is coming in a later slice. Once the tutor quiz system ships, ' +
      'this activity will be linked to a practice quiz you author (question set, ' +
      'review behaviour, pass score) and students will launch it in the same ' +
      'runner the bank uses.',
  },
};

export function QuizPlaceholderEditor({ type }: QuizPlaceholderEditorProps) {
  const copy = COPY[type];
  return (
    <div className="activity-editor-body">
      <div className="activity-quiz-placeholder" role="note">
        <div className="activity-quiz-placeholder-icon" aria-hidden="true">
          {copy.icon}
        </div>
        <div className="activity-quiz-placeholder-text">
          <h4 className="activity-quiz-placeholder-heading">{copy.heading}</h4>
          <p className="activity-quiz-placeholder-body">{copy.body}</p>
        </div>
      </div>
    </div>
  );
}

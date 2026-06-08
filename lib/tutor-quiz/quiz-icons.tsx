// mynclex/lib/tutor-quiz/quiz-icons.tsx
//
// Small inline line-icon set for the tutor-quiz uplift (2026-06 Claude
// Design "Quiz UI Uplift"). Same lucide-style family as the app's
// NavIcon / the picker filter's inline icons — lifted from the CD
// prototype's shared.js so the rendered look matches the handoff.
//
// Sized by CSS (no fixed width/height) so each context controls the
// glyph size — matches how quiz.css / the uplift rules set `svg` sizes.

import type { ReactNode } from 'react';

export type QuizIconName =
  | 'plus' | 'search' | 'list-checks' | 'clock' | 'timer' | 'programmes'
  | 'target' | 'sparkles' | 'check-circle' | 'pencil' | 'archive'
  | 'more' | 'chev-down' | 'chev-up-down' | 'chev-right' | 'alert'
  | 'arrow-up' | 'arrow-down' | 'grip' | 'check' | 'trash' | 'x'
  | 'list' | 'repeat' | 'quiz' | 'hash' | 'layers'
  | 'link' | 'dot' | 'unit';

function inner(name: QuizIconName): ReactNode {
  switch (name) {
    case 'plus':
      return (<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>);
    case 'search':
      return (<><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>);
    case 'list-checks':
      return (<><path d="M3 5l2 2 3-3" /><path d="M3 13l2 2 3-3" /><line x1="11" y1="4" x2="21" y2="4" /><line x1="11" y1="12" x2="21" y2="12" /><line x1="11" y1="19" x2="21" y2="19" /></>);
    case 'clock':
      return (<><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>);
    case 'timer':
      return (<><line x1="10" y1="2" x2="14" y2="2" /><line x1="12" y1="14" x2="15" y2="11" /><circle cx="12" cy="14" r="8" /></>);
    case 'programmes':
      return (<><path d="M2 3h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" /></>);
    case 'target':
      return (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.3" /></>);
    case 'sparkles':
      return (<><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" /><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" /></>);
    case 'check-circle':
      return (<><circle cx="12" cy="12" r="9" /><polyline points="8.5 12 11 14.5 15.5 9.5" /></>);
    case 'pencil':
      return (<><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></>);
    case 'archive':
      return (<><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" /><line x1="10" y1="12" x2="14" y2="12" /></>);
    case 'more':
      return (<><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /><circle cx="5" cy="12" r="1.4" /></>);
    case 'chev-down':
      return (<polyline points="6 9 12 15 18 9" />);
    case 'chev-up-down':
      return (<><polyline points="8 9 12 5 16 9" /><polyline points="8 15 12 19 16 15" /></>);
    case 'chev-right':
      return (<polyline points="9 18 15 12 9 6" />);
    case 'alert':
      return (<><path d="M10.3 3.8L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>);
    case 'arrow-up':
      return (<><line x1="12" y1="19" x2="12" y2="5" /><polyline points="6 11 12 5 18 11" /></>);
    case 'arrow-down':
      return (<><line x1="12" y1="5" x2="12" y2="19" /><polyline points="6 13 12 19 18 13" /></>);
    case 'grip':
      return (<><circle cx="9" cy="6" r="1.3" /><circle cx="15" cy="6" r="1.3" /><circle cx="9" cy="12" r="1.3" /><circle cx="15" cy="12" r="1.3" /><circle cx="9" cy="18" r="1.3" /><circle cx="15" cy="18" r="1.3" /></>);
    case 'check':
      return (<polyline points="20 6 9 17 4 12" />);
    case 'trash':
      return (<><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></>);
    case 'x':
      return (<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>);
    case 'list':
      return (<><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>);
    case 'repeat':
      return (<><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>);
    case 'quiz':
      return (<><path d="M9 11l3 3 8-8" /><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" /></>);
    case 'hash':
      return (<><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></>);
    case 'layers':
      return (<><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>);
    case 'link':
      return (<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72" /></>);
    case 'dot':
      return (<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />);
    case 'unit':
      return (<><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="9" x2="9" y2="20" /></>);
  }
}

export function QuizIcon({ name }: { name: QuizIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {inner(name)}
    </svg>
  );
}

// mynclex/app/(app)/tutor/quizzes/layout.tsx
//
// Wraps /tutor/quizzes (the list) in the global tutor chrome.
// The quiz editor is a SIBLING route at /tutor/quiz/[id] (singular)
// — not a child of this folder — so its layout owns its own chrome
// without double-rendering this one.

import { TutorGlobalShell } from '@/components/nav/tutor/global-shell';

export const dynamic = 'force-dynamic';

export default function TutorQuizzesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TutorGlobalShell>{children}</TutorGlobalShell>;
}

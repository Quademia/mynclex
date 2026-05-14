// mynclex/app/(app)/tutor/quiz/[id]/layout.tsx
//
// Wraps the quiz editor in the global tutor chrome. Sibling route to
// /tutor/quizzes (the list) — singular detail vs. plural list, per
// the folder convention — so neither double-renders the other's
// chrome.

import { TutorGlobalShell } from '@/components/nav/tutor/global-shell';

export const dynamic = 'force-dynamic';

export default function TutorQuizEditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TutorGlobalShell>{children}</TutorGlobalShell>;
}

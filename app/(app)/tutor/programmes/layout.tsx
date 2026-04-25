// mynclex/app/(app)/tutor/programmes/layout.tsx
//
// Wraps /tutor/programmes (the list) in the global tutor chrome.
// /tutor/programmes/[programme_id]/* has its own nested layout that
// replaces this chrome with the programme-scoped one.

import { TutorGlobalShell } from '@/components/nav/tutor/global-shell';

export const dynamic = 'force-dynamic';

export default function TutorProgrammesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TutorGlobalShell>{children}</TutorGlobalShell>;
}

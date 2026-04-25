// mynclex/app/(app)/tutor/programmes/layout.tsx
//
// Wraps /tutor/programmes (the list) in the global tutor chrome.
// The programme detail subtree is a SIBLING route at
// /tutor/programme/[programme_id]/* (singular) — not a child of
// this folder — so its layout doesn't double-render the global
// chrome on top of the programme chrome.

import { TutorGlobalShell } from '@/components/nav/tutor/global-shell';

export const dynamic = 'force-dynamic';

export default function TutorProgrammesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TutorGlobalShell>{children}</TutorGlobalShell>;
}

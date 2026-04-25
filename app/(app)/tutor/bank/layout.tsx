// mynclex/app/(app)/tutor/bank/layout.tsx
//
// Wraps /tutor/bank/* in the global tutor chrome. The "My Bank"
// dropdown in the global sidebar handles sub-route highlighting
// based on pathname, so no per-sub-route layout is needed under
// /tutor/bank/.

import { TutorGlobalShell } from '@/components/nav/tutor/global-shell';

export const dynamic = 'force-dynamic';

export default function TutorBankLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TutorGlobalShell>{children}</TutorGlobalShell>;
}

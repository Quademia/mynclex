import { TutorGlobalShell } from '@/components/nav/tutor/global-shell';

export const dynamic = 'force-dynamic';

export default function TutorStudentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TutorGlobalShell>{children}</TutorGlobalShell>;
}

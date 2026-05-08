// mynclex/app/(app)/(focused)/layout.tsx
//
// Focused-mode layout: no sidebar, no topbar product label, no
// audience chrome. Used by the runner (and the runner stub for now)
// where the student needs the whole viewport for the quiz.
//
// The (app)/layout.tsx auth boundary still applies — this is just a
// layout-shape choice nested under it.

export const dynamic = 'force-dynamic';

export default function FocusedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

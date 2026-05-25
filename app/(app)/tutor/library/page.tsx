// mynclex/app/(app)/tutor/library/page.tsx
//
// Tutor library home — slice 11.1 part 2 (chrome only).
//
// Renders the page frame + 5-lens sidebar + empty-state hero.
// No data calls yet — folders / notes / shelves / pillars / tags
// CRUD land in slices 11.2+ as the foundation grows.
//
// Auth: gated by (app)/tutor/layout.tsx which enforces TUTOR role.

import { LibraryHomeShell } from '@/lib/library/home/home-shell';

export default function TutorLibraryPage() {
  return <LibraryHomeShell />;
}

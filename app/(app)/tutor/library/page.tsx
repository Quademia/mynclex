// mynclex/app/(app)/tutor/library/page.tsx
//
// Tutor library home — slice 11.2a wires real folder data.
//
// Server component. Fetches the tutor's folders (RLS-gated) and
// reads `?folder=` from the URL to drive sidebar + main-pane state.
// Hands everything to <LibraryHomeShell> which handles the rest
// client-side.
//
// Auth: gated by (app)/tutor/layout.tsx which enforces TUTOR role.
// `dynamic = 'force-dynamic'` is set in the library layout (per the
// CLAUDE.md rule #4 auth/cache rule).

import { LibraryHomeShell } from '@/lib/library/home-shell';
import { getFoldersForTutor } from '@/lib/library/queries';

interface PageProps {
  // Next.js 16: searchParams is a Promise on server components.
  searchParams: Promise<{ folder?: string | string[] }>;
}

export default async function TutorLibraryPage({ searchParams }: PageProps) {
  const folders = await getFoldersForTutor();

  // Resolve `?folder=` to a single string. Array form (`?folder=a&folder=b`)
  // shouldn't happen with our nav patterns but we defensively take the
  // first entry rather than crashing on a malformed URL.
  const params = await searchParams;
  const raw = params.folder;
  const selected =
    typeof raw === 'string' ? raw : Array.isArray(raw) ? (raw[0] ?? null) : null;

  return <LibraryHomeShell folders={folders} selected={selected} />;
}

// mynclex/app/(app)/admin/media-test/page.tsx
//
// TEMPORARY — foundation smoke test for slice 9.3d-b. SUPER_ADMIN
// only. Lets a real user exercise the upload + signed-URL flow end-
// to-end before any feature wires up <UploadField>. Removed (or
// folded into a permanent diagnostics tree) once slice 9.3d-c lights
// up the PDF-activity editor.

import { requireSuperAdmin } from '@/lib/access';
import { MediaTestPanel } from './test-panel';

export const dynamic = 'force-dynamic';

export default async function AdminMediaTestPage() {
  await requireSuperAdmin();

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Media foundation — smoke test</h1>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 20, maxWidth: 640 }}>
        Pick a PDF (max 25 MB). The upload action creates a row in
        nclex_media_assets and pushes the file into the
        nclex-pdf-activities bucket. The Fetch button asks the server
        for a 1-hour signed URL. This page is removed after slice
        9.3d-c.
      </p>
      <MediaTestPanel />
    </div>
  );
}

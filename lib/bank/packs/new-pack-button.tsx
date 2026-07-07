// mynclex/lib/bank/packs/new-pack-button.tsx
//
// "+ New pack" (packs list header) — opens the shared create/edit
// modal in create mode; on success jumps straight into the new
// draft's detail (settled 2026-07-08).

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PackFormModal } from './pack-form-modal';

export function NewPackButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="rp-add-btn" onClick={() => setOpen(true)}>
        + New pack
      </button>
      {open && (
        <PackFormModal
          onClose={() => setOpen(false)}
          onCreated={(packId) => router.push(`/admin/packs/${packId}`)}
        />
      )}
    </>
  );
}

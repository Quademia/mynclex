// mynclex/app/(app)/admin/bank/trends/new/page.tsx
//
// Admin trend-dataset create form (Slice 1.12a). Minimal surface:
//   - kind picker (5 presets + Custom)
//   - title input
//   - Create button → createTrendAction → redirects to the editor.
//
// Rationale (matches case-study's create-then-edit flow): keep the
// first save trivial so every heavy-lift (scenario, rows, columns,
// flags) happens in the full editor where the data-table lives.

import Link from 'next/link';
import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/auth';
import { createTrendAction } from '@/lib/bank/trend/actions';
import { KIND_PRESETS, kindDefaultLabel } from '@/lib/bank/trend/kind-templates';

export const dynamic = 'force-dynamic';

export default async function AdminTrendCreatePage() {
  await requireAdminPermission(PERM_BANK_CURATE);

  return (
    <main className="bank-page">
      <div className="cs-list-head">
        <div>
          <h1>New trend dataset</h1>
          <p className="cs-list-sub">
            Pick a kind to seed a starting row template, name the dataset,
            then click Create — the full editor opens next.
          </p>
        </div>
        <div className="cs-list-actions">
          <Link href="/admin/bank/trends" className="cs-btn">← Cancel</Link>
        </div>
      </div>

      <form
        action={async (fd: FormData) => {
          'use server';
          // createTrendAction redirects on success; ActionResult is
          // only used for the failure branch. The <form action> slot
          // wants void | Promise<void>, so we swallow the result.
          await createTrendAction(fd);
        }}
        className="tr-create-form"
      >
        <input type="hidden" name="surface" value="admin" />

        <div className="tr-field">
          <label htmlFor="tr-new-title">Title</label>
          <input
            id="tr-new-title"
            type="text"
            name="title"
            required
            defaultValue=""
            placeholder="e.g. Post-op vitals over 3 hours"
          />
        </div>

        <div className="tr-field">
          <label htmlFor="tr-new-kind">Kind</label>
          <select id="tr-new-kind" name="kind" defaultValue="vitals">
            {KIND_PRESETS.map((k) => (
              <option key={k} value={k}>{kindDefaultLabel(k)}</option>
            ))}
            <option value="custom">Custom (empty table)</option>
          </select>
          <div className="tr-field-hint">
            Presets seed starting rows. You can edit or replace them after
            creation.
          </div>
        </div>

        <div className="cs-list-actions">
          <button type="submit" className="cs-btn primary">Create</button>
        </div>
      </form>
    </main>
  );
}

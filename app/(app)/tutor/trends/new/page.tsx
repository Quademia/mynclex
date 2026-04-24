// mynclex/app/(app)/tutor/trends/new/page.tsx
//
// Tutor trend-dataset create form (Slice 1.12a). Tutor-scoped twin
// of the admin create page. Same shape, surface hidden input set
// to 'tutor'. Redirects to /no-access unless the user holds TUTOR
// role (belt-and-braces; RLS enforces at the DB layer).

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createTrendAction } from '@/lib/bank/trend/actions';
import { KIND_PRESETS, kindDefaultLabel } from '@/lib/bank/trend/kind-templates';

export const dynamic = 'force-dynamic';

export default async function TutorTrendCreatePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: rolesData } = await supabase
    .from('nclex_user_roles')
    .select('role')
    .eq('user_id', user.id);

  const roles = (rolesData ?? []).map((r) => r.role as string);

  if (!roles.includes('TUTOR')) redirect('/no-access');

  return (
    <main className="bank-page">
      <div className="cs-list-head">
        <div>
          <h1>New trend dataset</h1>
          <p className="cs-list-sub">
            Pick a kind, name the dataset, then click Create — the full
            editor opens next.
          </p>
        </div>
        <div className="cs-list-actions">
          <Link href="/tutor/trends" className="cs-btn">← Cancel</Link>
        </div>
      </div>

      <form
        action={async (fd: FormData) => {
          'use server';
          await createTrendAction(fd);
        }}
        className="tr-create-form"
      >
        <input type="hidden" name="surface" value="tutor" />

        <div className="tr-field">
          <label htmlFor="tr-new-title">Title</label>
          <input
            id="tr-new-title"
            type="text"
            name="title"
            required
            defaultValue=""
            placeholder="e.g. Electrolytes across 3 days"
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

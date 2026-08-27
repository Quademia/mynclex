// mynclex/lib/bank/actions/delete-question.ts
//
// Server action for deleting a standalone question from the new
// authoring tree. Surface-aware (admin / tutor) — branches table
// and revalidate path on the `surface` form field.
//
// Hard delete. The bank list filters out wrapper-linked rows, so
// this action only ever runs against rows with parent_case_id AND
// trend_id both NULL. Wrapper detach + delete flows live in the
// wrapper actions (slices 11–12).

'use server';

import { revalidatePath } from 'next/cache';
import { requireBankCurator } from '@/lib/access';

type Surface = 'admin' | 'tutor';

export type DeleteResult =
  | { ok: true; item_id: string }
  | { ok: false; error: string };

function surfaceConfig(surface: Surface) {
  if (surface === 'tutor') {
    return {
      table: 'nclex_tutor_questions' as const,
      revalidate: '/tutor/bank/all',
    };
  }
  return {
    table: 'nclex_bank_items' as const,
    revalidate: '/admin/bank/all',
  };
}

function readSurface(formData: FormData): Surface {
  const raw = String(formData.get('surface') ?? '');
  return raw === 'tutor' ? 'tutor' : 'admin';
}

export async function deleteQuestionAction(formData: FormData): Promise<DeleteResult> {
  const surface = readSurface(formData);
  const { supabase, user } = await requireBankCurator(surface);

  const item_id = String(formData.get('item_id') ?? '').trim();
  if (!item_id) return { ok: false, error: 'Missing item_id.' };

  const cfg = surfaceConfig(surface);

  // ⚠⚠ Two guards here, and they answer different questions.
  //
  // 1. The tutor-surface owner filter. RLS does NOT narrow this for a
  //    SUPER_ADMIN — nclex_tutor_questions_superadmin is FOR ALL, so it
  //    matches every row for DELETE too, and requireBankCurator('tutor')
  //    admits SUPER_ADMIN on purpose. Executed on dev 2026-08-27: an
  //    admin-and-tutor account deleted another tutor's published
  //    question; the same delete as a plain tutor affected 0 rows.
  //    See lib/bank/tutor-scope.ts. (The admin surface has no tutor_id
  //    to filter on, and reaching every bank item IS its job.)
  //
  // 2. `.select().maybeSingle()` makes the row count readable. A DELETE
  //    that matches nothing is not an error in Postgres, so without it a
  //    refused delete falls through to `ok: true` and the screen lies
  //    about work it never did — the deleteUnit shape (2026-08-25).
  const deleted =
    surface === 'tutor'
      ? await supabase
          .from('nclex_tutor_questions')
          .delete()
          .eq('item_id', item_id)
          .eq('tutor_id', user.id)
          .select('item_id')
          .maybeSingle()
      : await supabase
          .from('nclex_bank_items')
          .delete()
          .eq('item_id', item_id)
          .select('item_id')
          .maybeSingle();

  if (deleted.error) return { ok: false, error: `Delete failed: ${deleted.error.message}` };
  if (!deleted.data) {
    return { ok: false, error: 'Question not found, or not yours to delete.' };
  }

  revalidatePath(cfg.revalidate);
  return { ok: true, item_id };
}

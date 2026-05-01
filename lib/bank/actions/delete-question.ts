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
  const { supabase } = await requireBankCurator(surface);

  const item_id = String(formData.get('item_id') ?? '').trim();
  if (!item_id) return { ok: false, error: 'Missing item_id.' };

  const cfg = surfaceConfig(surface);

  const { error } = await supabase.from(cfg.table).delete().eq('item_id', item_id);
  if (error) return { ok: false, error: `Delete failed: ${error.message}` };

  revalidatePath(cfg.revalidate);
  return { ok: true, item_id };
}

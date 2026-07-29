// mynclex/lib/practice/tutorial/completion.ts
//
// Server actions for the runner tutorial's two flag tables (Slice 3a):
//   nclex_tutorial_completions — "did this user finish tutorial X"
//   nclex_dismissed_prompts     — the "don't show me this again" list
//
// See docs/product-plan/runner-tutorial.md -> Slice 3. This is the
// ONLY database footprint of the whole tutorial feature.
//
// UNAUTHENTICATED USERS: every write here NO-OPS without a signed-in
// user, by design (the tutorial route is public). This is the
// authoritative guard — never trust the client — and RLS (keyed on
// auth.uid()) is the backstop. Reads return the "not set" answer.
//
// 'use server' — this module may export ONLY async functions. Shared
// key constants live in ./keys (a plain module) so client components
// can import them too.

'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Record that the signed-in user finished a tutorial. First completion
 * wins (the row's completed_at is preserved on repeat runs). No-ops for
 * an unauthenticated user. Never throws for the caller — a failed write
 * to this record-only table must not break the tutorial.
 */
export async function markTutorialCompleted(tutorialKey: string): Promise<void> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return; // anonymous — nothing to record

  await supabase
    .from('nclex_tutorial_completions')
    .upsert(
      { user_id: userId, tutorial_key: tutorialKey },
      { onConflict: 'user_id,tutorial_key', ignoreDuplicates: true },
    );
}

/**
 * Record that the signed-in user ticked "Don't show again" for a popup.
 * Idempotent (first dismissal time preserved). No-ops for an
 * unauthenticated user.
 */
export async function dismissPrompt(promptKey: string): Promise<void> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return; // anonymous — nothing to record

  await supabase
    .from('nclex_dismissed_prompts')
    .upsert(
      { user_id: userId, prompt_key: promptKey },
      { onConflict: 'user_id,prompt_key', ignoreDuplicates: true },
    );
}

/**
 * Has the signed-in user dismissed this popup? Drives whether the
 * pre-exam offer shows. Returns false for an unauthenticated user (they
 * never meet the popup — it lives behind an exam attempt — but false is
 * the safe answer regardless).
 */
export async function hasDismissedPrompt(promptKey: string): Promise<boolean> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return false;

  const { data } = await supabase
    .from('nclex_dismissed_prompts')
    .select('prompt_key')
    .eq('user_id', userId)
    .eq('prompt_key', promptKey)
    .maybeSingle();

  return data != null;
}

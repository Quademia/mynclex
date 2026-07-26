// mynclex/lib/practice/tutorial/keys.ts
//
// Shared string keys for the tutorial flag tables (Slice 3a). Plain
// module — NOT 'use server' — so both client components (the pre-exam
// popup, the coach) and the server actions in completion.ts can import
// these constants. A 'use server' module may export only async
// functions, so the keys cannot live there.
//
//   TUTORIAL_KEY_*  -> nclex_tutorial_completions.tutorial_key
//   PROMPT_KEY_*    -> nclex_dismissed_prompts.prompt_key
//
// A future walkthrough or popup is just a new constant here — no schema
// change (both tables key on a free-text key column).

/** The exam-runner walkthrough (this feature's tutorial). */
export const TUTORIAL_KEY_EXAM_RUNNER = 'exam-runner';

/** The "watch the walkthrough before this exam?" pre-exam offer.
 *  Names the OFFER, not the physical spot — dismissing it silences the
 *  offer on every exam preflight. */
export const PROMPT_KEY_PRE_EXAM_OFFER = 'pre-exam-tutorial-offer';

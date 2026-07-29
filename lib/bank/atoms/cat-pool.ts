// Shared copy for the "Reserve for CAT" flag (cat_pool). Used by the
// question-editor Housekeeping tab and the case wrapper editor so the label +
// help text can't drift between surfaces. CAT Slice 10b1, regrained
// 2026-07-28 (migration 20260822120000).
//
// There are TWO reservation units, and the copy has to be honest about which
// one the curator is looking at:
//
//   • a QUESTION, ticked on its own row — standalone, or trend-linked. A trend
//     dataset is not a reservation unit: the exam picks trend questions
//     individually, one per dataset per sitting, so each is reserved on its
//     own and the dataset is only context.
//   • a CASE, ticked on the wrapper. Its children carry the flag too, but as a
//     copy the database maintains — never as something a curator sets, which
//     is why the tick is hidden on a case child entirely.

export const CAT_POOL_LABEL = 'Reserve for CAT';

export const CAT_POOL_HELP =
  'Reserve as adaptive-exam (CAT) pool stock. Reserved questions leave student practice.';

/** The case wrapper's own tick, which speaks for all six children. */
export const CAT_POOL_HELP_CASE =
  'Reserve this whole case as adaptive-exam (CAT) pool stock. All of its questions come with it.';

// Shared copy for the "Reserve for CAT" flag (cat_pool). Used by the
// question-editor Housekeeping tab and the case / trend wrapper editors so
// the label + help text can't drift between surfaces. CAT Slice 10b1.
// The flag marks a standalone question, or a case / trend wrapper, as
// reserved adaptive-exam (CAT) pool stock — children inherit their
// wrapper's flag. Admin-only (§20).

export const CAT_POOL_LABEL = 'Reserve for CAT';
export const CAT_POOL_HELP =
  'Reserve as adaptive-exam (CAT) pool stock. Case / trend children inherit this.';

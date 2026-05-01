// mynclex/lib/bank/field-prefix.ts
//
// The canonical field-prefix helper shared by QuestionAuthoringPanel
// and the nine per-type editors in `mynclex/lib/bank/editors/`.
//
// Background. In standalone bank mode, one question's fields live in
// one form and every name= attribute is unique already. In case-child
// mode the Case Study editor may hold up to six questions in one
// form — without prefixing, every slot's `stem`, `option_id`, etc.
// would collide.
//
// Contract. Callers create a prefixer once and use it for every
// `name=` attribute they emit:
//
//     const fn = makePrefixer(fieldPrefix);       // fieldPrefix = 'q1_'
//     <input name={fn('stem')} />                 // → name="q1_stem"
//
// When fieldPrefix is '' (standalone mode, the default) the prefixer
// is an identity function — zero behaviour change for existing forms.
//
// Single canonical implementation. Do NOT inline this logic inside
// individual editors. If the prefix contract ever evolves (e.g.
// indexed / nested slots) there must be exactly one place to update.

export function makePrefixer(prefix: string = ''): (name: string) => string {
  if (prefix === '') return (name) => name;
  return (name) => `${prefix}${name}`;
}
